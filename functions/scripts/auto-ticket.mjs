import { createHash } from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT ?? process.env.FIREBASE_SERVICES_ACCOUNT ?? "{}",
);
if (!serviceAccount.project_id)
  throw new Error("FIREBASE_SERVICE_ACCOUNT haipo au si JSON sahihi.");
if (!process.env.SPORTS_API_KEY) throw new Error("SPORTS_API_KEY haijawekwa.");
const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);
const apiBase = (process.env.SPORTS_API_BASE_URL ?? "https://v3.football.api-sports.io").replace(
  /\/$/,
  "",
);
const apiKey = process.env.SPORTS_API_KEY;
const timeZone = "Africa/Dar_es_Salaam";
const oddsCacheMs = 6 * 60 * 60 * 1000;
const futureWindowMs = 48 * 60 * 60 * 1000;
const maxOddsFixtures = Math.max(1, Math.min(3, Number(process.env.MAX_ODDS_FIXTURES ?? 3)));
const maxApiRetries = 2;
const apiStats = { requests: 0, oddsRequests: 0, http429Responses: 0, retries: 0 };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function writeLog(data) {
  try {
    await db.collection("api_logs").add({ ...data, createdAt: FieldValue.serverTimestamp() });
  } catch (error) {
    console.error("api_logs write failed:", error.message);
  }
}

async function api(path, params = {}) {
  const url = new URL(`${apiBase}/${path.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  for (let attempt = 0; attempt <= maxApiRetries; attempt++) {
    apiStats.requests++;
    if (path === "odds") apiStats.oddsRequests++;
    const response = await fetch(url, {
      headers: { "x-apisports-key": apiKey, Accept: "application/json" },
    });
    if (response.ok) {
      const body = await response.json();
      if (body.errors && Object.keys(body.errors).length)
        throw new Error(`Sports API returned errors: ${JSON.stringify(body.errors)}`);
      return body.response ?? [];
    }
    if (response.status !== 429 || attempt === maxApiRetries)
      throw new Error(`Sports API HTTP ${response.status}`);
    apiStats.http429Responses++;
    apiStats.retries++;
    const retryAfter = Number(response.headers.get("retry-after"));
    const delayMs =
      retryAfter > 0 && Number.isFinite(retryAfter)
        ? Math.min(retryAfter * 1000, 30000)
        : 2500 * (attempt + 1);
    console.warn(
      `Sports API 429 for ${path}; retry ${attempt + 1}/${maxApiRetries} after ${delayMs}ms`,
    );
    await sleep(delayMs);
  }
  throw new Error("Sports API request failed after retries.");
}

function dateInTanzania(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function addCalendarDays(date, days) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function normalizeFixture(raw) {
  const f = raw?.fixture,
    l = raw?.league,
    t = raw?.teams,
    g = raw?.goals,
    s = raw?.score;
  const kickoff = new Date(f?.date).getTime();
  if (!f?.id || !l?.id || !t?.home?.id || !t?.away?.id || !Number.isFinite(kickoff)) return null;
  return {
    eventId: String(f.id),
    leagueId: String(l.id),
    leagueName: l.name ?? "Unknown",
    homeId: String(t.home.id),
    awayId: String(t.away.id),
    homeTeamName: t.home.name ?? "Unknown",
    awayTeamName: t.away.name ?? "Unknown",
    homeTeamLogo: t.home.logo ?? null,
    awayTeamLogo: t.away.logo ?? null,
    kickoffAt: new Date(kickoff).toISOString(),
    status: f.status?.short ?? "UNKNOWN",
    homeScore: g?.home ?? null,
    awayScore: g?.away ?? null,
    halfHomeScore: s?.halftime?.home ?? null,
    halfAwayScore: s?.halftime?.away ?? null,
  };
}

function isUpcoming(match, now = Date.now()) {
  const scheduledStatus = ["NS", "TBD"].includes(String(match?.status ?? "").toUpperCase());
  const kickoff = new Date(String(match?.kickoffAt ?? "")).getTime();
  return (
    scheduledStatus && Number.isFinite(kickoff) && kickoff > now && kickoff <= now + futureWindowMs
  );
}

function normalizeOdds(response) {
  const markets = [];
  for (const bookmaker of response?.[0]?.bookmakers ?? []) {
    for (const bet of bookmaker.bets ?? []) {
      const name = String(bet.name ?? "").toLowerCase();
      const options = (bet.values ?? [])
        .map((value) => ({
          prediction: String(value.value),
          odds: Number(value.odd),
          line: value.handicap ? Number(value.handicap) : null,
        }))
        .filter((value) => Number.isFinite(value.odds) && value.odds > 1);
      let market = null;
      if (name.includes("match winner") || name === "1x2") market = "1X2";
      else if (name.includes("double chance")) market = "DOUBLE_CHANCE";
      else if (name.includes("both teams score") || name.includes("both teams to score"))
        market = "BTTS";
      else if (name.includes("goals over/under") || name.includes("total goals"))
        market = "OVER_UNDER";
      else if (name.includes("draw no bet")) market = "DRAW_NO_BET";
      else if (name.includes("asian handicap") || name.includes("handicap")) market = "HANDICAP";
      if (market && options.length) {
        const existing = markets.find((item) => item.market === market);
        if (existing) existing.options.push(...options);
        else markets.push({ market, options });
      }
    }
  }
  return markets;
}

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  const millis = new Date(value).getTime();
  return Number.isFinite(millis) ? millis : 0;
}

function hasRecentOddsFetch(match, now = Date.now()) {
  const fetchedAt = timestampMillis(match.oddsFetchedAt);
  return (
    match.oddsSource === "api-football" &&
    fetchedAt > 0 &&
    fetchedAt <= now + 60_000 &&
    fetchedAt >= now - oddsCacheMs
  );
}

function hasFreshOdds(match, now = Date.now()) {
  return Array.isArray(match.markets) && match.markets.length > 0 && hasRecentOddsFetch(match, now);
}

async function syncDate(date) {
  const diagnostics = {
    requestedDate: date,
    receivedFixtures: 0,
    validFixtures: 0,
    upcomingFixtures: 0,
    rejectedPastOrOutsideWindow: 0,
    rejectedMalformed: 0,
    statusCounts: {},
    oddsCandidates: 0,
    oddsFixturesWithMarkets: 0,
    oddsRequests: 0,
    oddsCacheHits: 0,
    oddsEmptyResponses: 0,
    observedOddsBetNames: {},
    normalizedMarketOptionCounts: {},
    futureButNotScheduledStatus: 0,
    reason: null,
  };
  let fixtures;
  try {
    fixtures = await api("fixtures", { date });
  } catch (error) {
    diagnostics.reason = "fixtures-api-error";
    diagnostics.error = String(error);
    return diagnostics;
  }
  diagnostics.receivedFixtures = fixtures.length;
  const normalized = fixtures.map(normalizeFixture);
  diagnostics.validFixtures = normalized.filter(Boolean).length;
  diagnostics.rejectedMalformed = fixtures.length - diagnostics.validFixtures;
  for (const fixture of normalized.filter(Boolean))
    diagnostics.statusCounts[fixture.status] = (diagnostics.statusCounts[fixture.status] ?? 0) + 1;
  const now = Date.now();
  const futureByTime = normalized.filter((match) => {
    const kickoff = new Date(String(match?.kickoffAt ?? "")).getTime();
    return match && Number.isFinite(kickoff) && kickoff > now && kickoff <= now + futureWindowMs;
  });
  const futureFixtures = futureByTime
    .filter((match) => isUpcoming(match, now))
    .sort((a, b) => Date.parse(a.kickoffAt) - Date.parse(b.kickoffAt));
  diagnostics.futureButNotScheduledStatus = futureByTime.length - futureFixtures.length;
  diagnostics.upcomingFixtures = futureFixtures.length;
  diagnostics.rejectedPastOrOutsideWindow =
    diagnostics.validFixtures - diagnostics.upcomingFixtures;
  diagnostics.oddsCandidates = Math.min(futureFixtures.length, maxOddsFixtures);

  for (const match of futureFixtures) {
    await db
      .collection("matches")
      .doc(match.eventId)
      .set(
        { ...match, externalProvider: "api-football", updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
  }
  for (const match of futureFixtures.slice(0, maxOddsFixtures)) {
    const ref = db.collection("matches").doc(match.eventId);
    const existingData = (await ref.get()).data() ?? {};
    if (hasRecentOddsFetch(existingData, now)) {
      diagnostics.oddsCacheHits++;
      if (hasFreshOdds(existingData, now)) {
        diagnostics.oddsFixturesWithMarkets++;
        for (const market of existingData.markets) {
          diagnostics.normalizedMarketOptionCounts[market.market] =
            (diagnostics.normalizedMarketOptionCounts[market.market] ?? 0) +
            (market.options?.length ?? 0);
        }
      }
      continue;
    }
    diagnostics.oddsRequests++;
    try {
      const oddsResponse = await api("odds", { fixture: match.eventId });
      for (const bookmaker of oddsResponse?.[0]?.bookmakers ?? []) {
        for (const bet of bookmaker.bets ?? []) {
          const name = String(bet.name ?? "UNKNOWN");
          diagnostics.observedOddsBetNames[name] =
            (diagnostics.observedOddsBetNames[name] ?? 0) + 1;
        }
      }
      const markets = normalizeOdds(oddsResponse);
      for (const market of markets) {
        diagnostics.normalizedMarketOptionCounts[market.market] =
          (diagnostics.normalizedMarketOptionCounts[market.market] ?? 0) + market.options.length;
      }
      await ref.set(
        {
          markets,
          oddsFetchedAt: FieldValue.serverTimestamp(),
          oddsSource: "api-football",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      if (markets.length) diagnostics.oddsFixturesWithMarkets++;
      else diagnostics.oddsEmptyResponses++;
    } catch (error) {
      await writeLog({
        type: "odds-fetch",
        ok: false,
        matchId: match.eventId,
        requestedDate: date,
        kickoffAt: match.kickoffAt,
        error: String(error),
      });
      console.error(`odds ${match.eventId}:`, error.message);
    }
  }
  if (!diagnostics.receivedFixtures) diagnostics.reason = "api-returned-no-fixtures-for-date";
  else if (!diagnostics.upcomingFixtures) diagnostics.reason = "no-upcoming-fixtures-in-window";
  else if (!diagnostics.oddsFixturesWithMarkets)
    diagnostics.reason = "no-fixtures-with-usable-odds";
  return diagnostics;
}

function chooseOption(match, settings) {
  const preferred =
    settings.risk === "LOW"
      ? ["DOUBLE_CHANCE", "DRAW_NO_BET", "OVER_UNDER", "BTTS"]
      : ["DOUBLE_CHANCE", "1X2", "DRAW_NO_BET", "OVER_UNDER", "BTTS"];
  for (const marketName of preferred) {
    const market = (match.markets ?? []).find((item) => item.market === marketName);
    const option = (market?.options ?? [])
      .map((item) => ({ ...item, odds: Number(item.odds) }))
      .filter((item) => item.odds > 1 && item.odds <= Number(settings.maxOddsPerSelection))
      .sort((a, b) => a.odds - b.odds)[0];
    if (option) return { market: marketName, ...option };
  }
  return null;
}

async function verifyPublishedTicket(ticketId) {
  const ticketRef = db.collection("tickets").doc(ticketId);
  const [ticketSnapshot, selectionsSnapshot] = await Promise.all([
    ticketRef.get(),
    ticketRef.collection("selections").get(),
  ]);
  if (!ticketSnapshot.exists) {
    return { verified: false, reason: "ticket-document-not-found", ticketId };
  }
  const ticket = ticketSnapshot.data() ?? {};
  const selections = selectionsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const selectionChecks = await Promise.all(
    selections.map(async (selection) => {
      const matchSnapshot = await db.collection("matches").doc(String(selection.matchId)).get();
      const match = matchSnapshot.data() ?? {};
      const matchingMarket = (match.markets ?? []).find(
        (market) => market.market === selection.market,
      );
      const matchingOption = (matchingMarket?.options ?? []).find(
        (option) =>
          String(option.prediction) === String(selection.prediction) &&
          Number(option.odds) === Number(selection.odds),
      );
      return {
        selectionId: selection.id,
        matchId: selection.matchId,
        market: selection.market,
        prediction: selection.prediction,
        odds: Number(selection.odds),
        oddsSource: match.oddsSource ?? null,
        oddsFresh: hasFreshOdds(match),
        optionMatchesApiSnapshot: Boolean(matchingOption),
      };
    }),
  );
  const computedTotalOdds = selections.reduce((total, item) => total * Number(item.odds), 1);
  const checks = {
    visibilityPublic: ticket.visibility === "PUBLIC",
    automated: ticket.automated === true,
    oddsVerifiedAtPresent: Boolean(ticket.oddsVerifiedAt),
    automationFingerprintPresent:
      typeof ticket.automationFingerprint === "string" && ticket.automationFingerprint.length > 0,
    selectionCountMatches: Number(ticket.selectionCount) === selections.length,
    selectionsMeetRange: selections.length >= 2 && selections.length <= 5,
    totalOddsMatches: Number(ticket.totalOdds) === Number(computedTotalOdds.toFixed(2)),
    allSelectionsHaveFreshApiOdds:
      selectionChecks.length > 0 &&
      selectionChecks.every(
        (item) =>
          item.oddsFresh && item.oddsSource === "api-football" && item.optionMatchesApiSnapshot,
      ),
  };
  return {
    verified: Object.values(checks).every(Boolean),
    ticketId,
    checks,
    ticket: {
      visibility: ticket.visibility,
      automated: ticket.automated,
      oddsVerifiedAt: timestampMillis(ticket.oddsVerifiedAt) || null,
      automationFingerprint: ticket.automationFingerprint ?? null,
      selectionCount: ticket.selectionCount,
      totalOdds: ticket.totalOdds,
    },
    selections: selectionChecks,
  };
}

async function generateTicket() {
  const config = (await db.collection("automation").doc("config").get()).data() ?? {};
  const settings = {
    enabled: true,
    maxSelections: 5,
    maxOddsPerSelection: 1.65,
    maxTotalOdds: 12,
    risk: "LOW",
    ...config,
  };
  if (!settings.enabled) return { created: false, reason: "disabled" };
  const now = Date.now();
  const matches = (
    await db
      .collection("matches")
      .where("kickoffAt", ">", new Date(now).toISOString())
      .orderBy("kickoffAt", "asc")
      .limit(200)
      .get()
  ).docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((match) => isUpcoming(match, now) && hasFreshOdds(match, now));
  const availableOdds = {
    freshOddsMatches: matches.length,
    eligibleOptionsByMarket: {},
    marketsByName: {},
  };
  for (const match of matches) {
    for (const market of match.markets ?? []) {
      availableOdds.marketsByName[market.market] =
        (availableOdds.marketsByName[market.market] ?? 0) + 1;
      const count = (market.options ?? []).filter((item) => {
        const odds = Number(item.odds);
        return odds > 1 && odds <= Number(settings.maxOddsPerSelection);
      }).length;
      if (count) {
        availableOdds.eligibleOptionsByMarket[market.market] =
          (availableOdds.eligibleOptionsByMarket[market.market] ?? 0) + count;
      }
    }
  }
  const selections = [];
  let runningOdds = 1;
  for (const match of matches) {
    const option = chooseOption(match, settings);
    if (!option || selections.some((item) => item.matchId === match.id)) continue;
    const candidateOdds = runningOdds * option.odds;
    if (candidateOdds > Number(settings.maxTotalOdds)) continue;
    selections.push({
      matchId: match.id,
      market: option.market,
      line: option.line ?? null,
      prediction: option.prediction,
      odds: option.odds,
      homeTeam: match.homeTeamName,
      awayTeam: match.awayTeamName,
      kickoffAt: match.kickoffAt,
      leagueName: match.leagueName,
      status: "PENDING",
    });
    runningOdds = candidateOdds;
    if (
      selections.length >= Math.max(2, Math.min(5, Number(settings.maxSelections))) ||
      selections.length >= 5
    )
      break;
  }
  const totalOdds = selections.reduce((total, selection) => total * Number(selection.odds), 1);
  if (selections.length < 2)
    return {
      created: false,
      reason: "not-enough-qualifying-selections",
      qualifyingSelections: selections.length,
      ...availableOdds,
    };
  if (totalOdds > Number(settings.maxTotalOdds))
    return {
      created: false,
      reason: "total-odds-exceed-configured-maximum",
      qualifyingSelections: selections.length,
    };
  const fingerprint = createHash("sha256")
    .update(
      selections
        .map((item) => `${item.matchId}:${item.market}:${item.prediction}:${item.odds}`)
        .sort()
        .join("|"),
      "utf8",
    )
    .digest("hex");
  const duplicate = await db
    .collection("tickets")
    .where("automationFingerprint", "==", fingerprint)
    .limit(1)
    .get();
  if (!duplicate.empty) {
    const ticketId = duplicate.docs[0].id;
    return {
      created: false,
      reason: "duplicate-fingerprint",
      ticketId,
      verification: await verifyPublishedTicket(ticketId),
    };
  }
  const windowKey = new Date().toISOString().slice(0, 13);
  const sameWindow = await db
    .collection("tickets")
    .where("automationWindow", "==", windowKey)
    .limit(1)
    .get();
  if (!sameWindow.empty)
    return {
      created: false,
      reason: "already-created-this-window",
      ticketId: sameWindow.docs[0].id,
      verification: await verifyPublishedTicket(sameWindow.docs[0].id),
    };
  const ticket = db.collection("tickets").doc();
  const batch = db.batch();
  const titleDate = new Intl.DateTimeFormat("en-GB", { timeZone, dateStyle: "medium" }).format(
    new Date(),
  );
  batch.set(ticket, {
    creatorId: "AUTO_BOT",
    creatorUsername: "wazee_betting_tz",
    creatorName: "Wazee wa Betting Tz",
    creatorPhotoURL: null,
    title: `Mkeka wa Automatic • ${titleDate}`,
    description:
      "Mkeka huu umetengenezwa na mfumo kwa kutumia odds zilizothibitishwa kutoka Sports API. Hakuna uhakika wa ushindi; cheza kwa uwajibikaji.",
    sport: "Football",
    risk: settings.risk,
    visibility: "PUBLIC",
    access: "FREE",
    totalOdds: Number(totalOdds.toFixed(2)),
    status: "PENDING",
    selectionCount: selections.length,
    automated: true,
    automationWindow: windowKey,
    automationFingerprint: fingerprint,
    oddsVerifiedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  selections.forEach((selection, index) =>
    batch.set(ticket.collection("selections").doc(String(index + 1)), {
      ...selection,
      kickoffAt: new Date(selection.kickoffAt),
      createdAt: FieldValue.serverTimestamp(),
    }),
  );
  await batch.commit();
  const verification = await verifyPublishedTicket(ticket.id);
  return {
    created: true,
    ticketId: ticket.id,
    selections: selections.length,
    totalOdds: Number(totalOdds.toFixed(2)),
    fingerprint,
    verification,
  };
}

async function main() {
  const today = dateInTanzania();
  const dates = [today, addCalendarDays(today, 1)];
  const syncResults = [];
  for (const date of dates) syncResults.push(await syncDate(date));
  const result = await generateTicket();
  const diagnostics = {
    timeZone,
    runnerTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    runnerNow: new Date().toISOString(),
    tanzaniaDate: today,
    syncResults,
    apiStats,
    result,
    quotaPolicy: {
      maxOddsFixturesPerDate: maxOddsFixtures,
      oddsCacheHours: 6,
      futureWindowHours: 48,
      maxApiRetries,
    },
  };
  await writeLog({ type: "github-auto-ticket", ok: true, ...diagnostics });
  console.log(JSON.stringify(diagnostics));
}

try {
  await main();
} catch (error) {
  await writeLog({
    type: "github-auto-ticket",
    ok: false,
    error: String(error),
    apiStats,
    diagnostics: {
      timeZone,
      runnerTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      runnerNow: new Date().toISOString(),
      tanzaniaDate: dateInTanzania(),
    },
    quotaPolicy: {
      maxOddsFixturesPerDate: maxOddsFixtures,
      oddsCacheHours: 6,
      futureWindowHours: 48,
      maxApiRetries,
    },
  });
  console.error(error);
  process.exitCode = 1;
}
