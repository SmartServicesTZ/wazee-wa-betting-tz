import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { choosePrediction, type TeamForm } from "./prediction-engine.js";
import {
  calculatePredictionAccuracy,
  evaluatePredictionOutcome as outcome,
} from "./prediction-settlement.js";
initializeApp();
const db = getFirestore();
const API_BASE = process.env.SPORTS_API_BASE_URL ?? "https://v3.football.api-sports.io";
async function createCommunityNotification(
  userId: string,
  type: string,
  actorId: string,
  message: string,
  referenceId: string,
) {
  if (!userId || userId === actorId) return;
  await db.collection("notifications").add({
    userId,
    type,
    actorId,
    message,
    referenceId,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });
}
export const notifyTicketLike = onDocumentCreated(
  { document: "likes/{likeId}", region: "europe-west1" },
  async (event) => {
    const like = event.data?.data();
    if (!like) return;
    const ticket = await db.collection("tickets").doc(String(like.ticketId)).get();
    const creatorId = String(ticket.data()?.creatorId ?? "");
    await createCommunityNotification(
      creatorId,
      "LIKE",
      String(like.userId),
      "Mtu amependa tiketi yako.",
      String(like.ticketId),
    );
  },
);
export const notifyTicketComment = onDocumentCreated(
  { document: "comments/{commentId}", region: "europe-west1" },
  async (event) => {
    const comment = event.data?.data();
    if (!comment) return;
    const ticket = await db.collection("tickets").doc(String(comment.ticketId)).get();
    const creatorId = String(ticket.data()?.creatorId ?? "");
    await createCommunityNotification(
      creatorId,
      "COMMENT",
      String(comment.authorId),
      "Mtu ameacha maoni kwenye tiketi yako.",
      String(comment.ticketId),
    );
  },
);
export const notifyNewFollower = onDocumentCreated(
  { document: "followers/{followId}", region: "europe-west1" },
  async (event) => {
    const follow = event.data?.data();
    if (!follow) return;
    await createCommunityNotification(
      String(follow.followingId),
      "FOLLOW",
      String(follow.followerId),
      "Mtu mpya amekufuata.",
      String(follow.followerId),
    );
  },
);

const API_KEY = process.env.SPORTS_API_KEY;
type Status = "PENDING" | "WON" | "LOST" | "VOID" | "CANCELLED";
type Match = {
  eventId: string;
  leagueId: string;
  leagueName: string;
  homeId: string;
  awayId: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoffAt: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  halfHomeScore: number | null;
  halfAwayScore: number | null;
  markets?: any[];
};
function assertApi() {
  if (!API_KEY) throw new Error("SPORTS_API_KEY haijawekwa kwenye server.");
}
async function api(path: string, params: Record<string, string> = {}) {
  assertApi();
  const base = API_BASE.endsWith("/") ? API_BASE : API_BASE + "/";
  const url = new URL(path, base);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, {
    headers: { "x-apisports-key": API_KEY!, Accept: "application/json" },
  });
  if (!res.ok) throw new Error("Sports API HTTP " + res.status);
  const body = (await res.json()) as any;
  if (body.errors && Object.keys(body.errors).length) throw new Error(JSON.stringify(body.errors));
  return body.response ?? [];
}
function normalizeFixture(item: any): Match {
  const f = item.fixture,
    l = item.league,
    t = item.teams,
    g = item.goals,
    s = item.score;
  return {
    eventId: String(f.id),
    leagueId: String(l.id),
    leagueName: l.name ?? "Unknown",
    homeId: String(t.home.id),
    awayId: String(t.away.id),
    homeTeamName: t.home.name,
    awayTeamName: t.away.name,
    kickoffAt: new Date(f.date).toISOString(),
    status: f.status.short,
    homeScore: g.home ?? null,
    awayScore: g.away ?? null,
    halfHomeScore: s.halftime?.home ?? null,
    halfAwayScore: s.halftime?.away ?? null,
  };
}
function normalizeOdds(response: any[]): any[] {
  const markets: any[] = [];
  const bookmakers = response?.[0]?.bookmakers ?? [];
  for (const bookmaker of bookmakers) {
    for (const bet of bookmaker.bets ?? []) {
      const name = String(bet.name).toLowerCase();
      const values = (bet.values ?? [])
        .map((v: any) => ({
          prediction: String(v.value),
          odds: Number(v.odd),
          line: v.handicap ? Number(v.handicap) : null,
        }))
        .filter((v: any) => Number.isFinite(v.odds));
      let market: any = null;
      if (name.includes("match winner") || name.includes("match result") || name === "winner")
        market = { market: "1X2", options: values };
      else if (name.includes("double chance"))
        market = { market: "DOUBLE_CHANCE", options: values };
      else if (name.includes("both teams score") || name.includes("both teams to score"))
        market = { market: "BTTS", options: values };
      else if (name.includes("goals over/under") || name.includes("total goals"))
        market = { market: "OVER_UNDER", options: values };
      else if (name.includes("draw no bet")) market = { market: "DRAW_NO_BET", options: values };
      else if (name.includes("asian handicap") || name.includes("handicap"))
        market = { market: "HANDICAP", options: values };
      else if (name.includes("first half") || name.includes("half time"))
        market = { market: "HALF_TIME", options: values };
      if (market && market.options.length) {
        const existing = markets.find((item) => item.market === market.market);
        if (existing) existing.options.push(...market.options);
        else markets.push(market);
      }
    }
  }
  return markets;
}
const ODDS_CACHE_MS = 6 * 60 * 60 * 1000;
const TEAM_FORM_CACHE_MS = 12 * 60 * 60 * 1000;
const MAX_ODDS_FIXTURES_PER_DATE = 5;
function timestampMillis(value: any): number {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}
function hasFreshOdds(match: any, now = Date.now()): boolean {
  const fetchedAt = timestampMillis(match?.oddsFetchedAt);
  return (
    match?.oddsSource === "api-football" &&
    Array.isArray(match?.markets) &&
    match.markets.length > 0 &&
    fetchedAt > 0 &&
    fetchedAt <= now + 60_000 &&
    fetchedAt >= now - ODDS_CACHE_MS
  );
}
async function syncDate(date: string) {
  const fixtures = await api("/fixtures", { date });
  const now = Date.now();
  const oddsFixtureIds = new Set(
    fixtures
      .map(normalizeFixture)
      .filter((match: Match) => {
        const kickoff = new Date(match.kickoffAt).getTime();
        return (
          ["NS", "TBD"].includes(String(match.status).toUpperCase()) &&
          kickoff > now &&
          kickoff <= now + 48 * 60 * 60 * 1000
        );
      })
      .sort((a: Match, b: Match) => Date.parse(a.kickoffAt) - Date.parse(b.kickoffAt))
      .slice(0, MAX_ODDS_FIXTURES_PER_DATE)
      .map((match: Match) => match.eventId),
  );
  let count = 0;
  for (const raw of fixtures) {
    const m = normalizeFixture(raw);
    const ref = db.collection("matches").doc(m.eventId);
    const existing = (await ref.get()).data() ?? {};
    const update: Record<string, any> = {
      ...m,
      externalProvider: "api-football",
      ...(isFinalStatus(m.status) && m.homeScore != null && m.awayScore != null
        ? { resultSource: "api-football", resultVerifiedAt: FieldValue.serverTimestamp() }
        : {}),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (oddsFixtureIds.has(m.eventId) && !hasFreshOdds(existing, now)) {
      try {
        const markets = normalizeOdds(await api("/odds", { fixture: m.eventId }));
        update.markets = markets;
        update.oddsFetchedAt = FieldValue.serverTimestamp();
        update.oddsSource = "api-football";
      } catch (error) {
        console.error("odds", m.eventId, error);
      }
    }
    await ref.set(update, { merge: true });
    count++;
  }
  return count;
}
function normalizeTeamForm(teamId: string, fixtures: any[]): TeamForm | null {
  const results = fixtures
    .map((item) => {
      const status = String(item?.fixture?.status?.short ?? "").toUpperCase();
      if (item?.goals?.home == null || item?.goals?.away == null) return null;
      const homeGoals = Number(item?.goals?.home);
      const awayGoals = Number(item?.goals?.away);
      const homeId = String(item?.teams?.home?.id ?? "");
      const awayId = String(item?.teams?.away?.id ?? "");
      if (
        !["FT", "AET", "PEN"].includes(status) ||
        !Number.isFinite(homeGoals) ||
        !Number.isFinite(awayGoals) ||
        ![homeId, awayId].includes(teamId)
      )
        return null;
      return {
        homeGoals,
        awayGoals,
        venue: (teamId === homeId ? "HOME" : "AWAY") as "HOME" | "AWAY",
        playedAt: new Date(item.fixture.date).getTime(),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => b.playedAt - a.playedAt)
    .slice(0, 5);
  if (!results.length) return null;
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  const form = results.map((result) => {
    const scored = result.venue === "HOME" ? result.homeGoals : result.awayGoals;
    const conceded = result.venue === "HOME" ? result.awayGoals : result.homeGoals;
    goalsFor += scored;
    goalsAgainst += conceded;
    if (scored > conceded) {
      wins++;
      return "W";
    }
    if (scored === conceded) {
      draws++;
      return "D";
    }
    losses++;
    return "L";
  });
  return {
    teamId,
    sampleSize: results.length,
    form: form.join("-").toUpperCase(),
    wins,
    draws,
    losses,
    scoredAverage: Number((goalsFor / results.length).toFixed(2)),
    concededAverage: Number((goalsAgainst / results.length).toFixed(2)),
    results: results.map(({ homeGoals, awayGoals, venue }) => ({ homeGoals, awayGoals, venue })),
  };
}
async function getTeamForm(teamId: string): Promise<TeamForm | null> {
  const ref = db.collection("team_form_cache").doc(teamId);
  const cachedSnapshot = await ref.get();
  const cached = cachedSnapshot.data();
  if (
    cached?.source === "api-football" &&
    timestampMillis(cached.fetchedAt) >= Date.now() - TEAM_FORM_CACHE_MS
  )
    return (cached.form as TeamForm | null) ?? null;
  const fixtures = await api("/fixtures", { team: teamId, last: "5" });
  const form = normalizeTeamForm(teamId, fixtures);
  await ref.set(
    { teamId, form, source: "api-football", fetchedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  return form;
}
async function runPredictionEngine() {
  const now = Date.now();
  const snapshot = await db
    .collection("matches")
    .where("kickoffAt", ">=", new Date(now).toISOString())
    .orderBy("kickoffAt", "asc")
    .limit(100)
    .get();
  const candidates = snapshot.docs
    .map((item) => ({ ...item.data(), id: item.id }))
    .filter(
      (match: any) =>
        !match.aiPrediction &&
        match.externalProvider === "api-football" &&
        hasFreshOdds(match, now) &&
        ["NS", "TBD"].includes(String(match.status).toUpperCase()) &&
        isUpcoming(match, now) &&
        match.homeId &&
        match.awayId,
    )
    .slice(0, 3);
  const formCache = new Map<string, TeamForm | null>();
  const getCachedForm = async (teamId: string) => {
    if (!formCache.has(teamId)) {
      try {
        formCache.set(teamId, await getTeamForm(teamId));
      } catch (error) {
        console.error("team form", teamId, error);
        formCache.set(teamId, null);
      }
    }
    return formCache.get(teamId) ?? null;
  };
  let created = 0;
  let skippedForInsufficientData = 0;
  for (const match of candidates as any[]) {
    const [homeForm, awayForm] = await Promise.all([
      getCachedForm(String(match.homeId)),
      getCachedForm(String(match.awayId)),
    ]);
    const pick = choosePrediction(
      {
        id: String(match.id),
        homeTeamName: String(match.homeTeamName),
        awayTeamName: String(match.awayTeamName),
        markets: Array.isArray(match.markets) ? match.markets : [],
      },
      homeForm,
      awayForm,
    );
    if (!pick) {
      skippedForInsufficientData++;
      continue;
    }
    const prediction = {
      ...pick,
      fixtureId: String(match.id),
      homeTeamName: match.homeTeamName,
      awayTeamName: match.awayTeamName,
      leagueName: match.leagueName,
      kickoffAt: match.kickoffAt,
      oddsSource: "api-football",
      oddsFetchedAt: match.oddsFetchedAt,
      statisticsSource: "api-football",
      homeFormSample: homeForm?.sampleSize ?? 0,
      awayFormSample: awayForm?.sampleSize ?? 0,
      status: "PENDING",
      createdAt: FieldValue.serverTimestamp(),
    };
    const matchRef = db.collection("matches").doc(String(match.id));
    const wasCreated = await db.runTransaction(async (transaction) => {
      const latest = await transaction.get(matchRef);
      if (!latest.exists || latest.data()?.aiPrediction) return false;
      transaction.update(matchRef, { aiPrediction: prediction });
      return true;
    });
    if (wasCreated) created++;
  }
  return { examined: candidates.length, created, skippedForInsufficientData };
}
export const generateAiPredictions = onSchedule(
  { schedule: "every 6 hours", timeZone: "Africa/Dar_es_Salaam", region: "europe-west1" },
  async () => {
    try {
      const result = await runPredictionEngine();
      await db.collection("api_logs").add({
        type: "ai-predictions",
        ok: true,
        result,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      console.error("AI predictions failed", error);
      await db.collection("api_logs").add({
        type: "ai-predictions",
        ok: false,
        error: String(error),
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  },
);
async function updateCreatorStats(uid: string) {
  const snap = await db.collection("tickets").where("creatorId", "==", uid).get();
  let won = 0,
    lost = 0,
    pending = 0,
    selectionWonCount = 0,
    selectionLostCount = 0;
  for (const d of snap.docs) {
    const status = String(d.data().status ?? "PENDING");
    if (status === "WON") won++;
    else if (status === "LOST") lost++;
    else if (status === "PENDING") pending++;
    const selections = await d.ref.collection("selections").get();
    for (const selection of selections.docs) {
      const selectionStatus = String(selection.data().status ?? "PENDING");
      if (selectionStatus === "WON") selectionWonCount++;
      else if (selectionStatus === "LOST") selectionLostCount++;
    }
  }
  const settledTicketCount = won + lost;
  const settledSelections = selectionWonCount + selectionLostCount;
  const winRate = settledTicketCount ? Number(((won / settledTicketCount) * 100).toFixed(2)) : 0;
  const selectionWinRate = settledSelections
    ? Number(((selectionWonCount / settledSelections) * 100).toFixed(2))
    : 0;
  const stats = {
    ticketCount: snap.size,
    settledTicketCount,
    wonCount: won,
    lostCount: lost,
    pendingCount: pending,
    winRate,
    selectionWonCount,
    selectionLostCount,
    selectionWinRate,
    predictorBadge:
      settledTicketCount < 10 ? "NEUTRAL" : winRate < 35 ? "RED" : winRate < 65 ? "BLUE" : "GREEN",
    updatedAt: FieldValue.serverTimestamp(),
  };
  await db.collection("users").doc(uid).set(stats, { merge: true });
  await db.collection("publicProfiles").doc(uid).set(stats, { merge: true });
}
function isFinalStatus(status: string) {
  return ["FT", "AET", "PEN"].includes(String(status).toUpperCase());
}
function isCancelledStatus(status: string) {
  return ["PST", "CANC", "ABD", "AWD", "WO"].includes(String(status).toUpperCase());
}
async function settlePredictions() {
  const pending = await db
    .collection("matches")
    .where("aiPrediction.status", "==", "PENDING")
    .limit(250)
    .get();
  const summaryRef = db.collection("matches").doc("ai_prediction_summary");
  let settled = 0;
  for (const matchDoc of pending.docs) {
    const match = matchDoc.data();
    const prediction = match.aiPrediction;
    const matchStatus = String(match.status ?? "").toUpperCase();
    if (!prediction || prediction.status !== "PENDING") continue;
    const isCancelled = isCancelledStatus(matchStatus) && match.externalProvider === "api-football";
    if (
      !isCancelled &&
      (!match.resultSource || !match.resultVerifiedAt || !isFinalStatus(matchStatus))
    )
      continue;
    const status: Status = isCancelled ? "CANCELLED" : outcome(prediction, match);
    if (status === "PENDING") continue;
    const applied = await db.runTransaction(async (transaction) => {
      const [currentSnapshot, summarySnapshot] = await Promise.all([
        transaction.get(matchDoc.ref),
        transaction.get(summaryRef),
      ]);
      const currentPrediction = currentSnapshot.data()?.aiPrediction;
      if (!currentSnapshot.exists || currentPrediction?.status !== "PENDING") return false;
      const summary = summarySnapshot.data() ?? {};
      const wonCount = Number(summary.wonCount ?? 0) + (status === "WON" ? 1 : 0);
      const lostCount = Number(summary.lostCount ?? 0) + (status === "LOST" ? 1 : 0);
      const voidCount = Number(summary.voidCount ?? 0) + (status === "VOID" ? 1 : 0);
      const cancelledCount = Number(summary.cancelledCount ?? 0) + (status === "CANCELLED" ? 1 : 0);
      const { decidedCount, accuracyPercent } = calculatePredictionAccuracy({
        wonCount,
        lostCount,
        voidCount,
        cancelledCount,
      });
      transaction.update(matchDoc.ref, {
        "aiPrediction.status": status,
        "aiPrediction.actualScore":
          match.homeScore == null || match.awayScore == null
            ? null
            : `${match.homeScore}-${match.awayScore}`,
        "aiPrediction.resultSource": isCancelled ? "api-football" : match.resultSource,
        "aiPrediction.resultVerifiedAt": match.resultVerifiedAt ?? FieldValue.serverTimestamp(),
        "aiPrediction.settledAt": FieldValue.serverTimestamp(),
      });
      transaction.set(
        summaryRef,
        {
          wonCount,
          lostCount,
          voidCount,
          cancelledCount,
          decidedCount,
          accuracyPercent,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return true;
    });
    if (applied) settled++;
  }
  return settled;
}
async function settle() {
  const snap = await db.collection("tickets").where("status", "==", "PENDING").limit(100).get();
  let settled = 0;
  for (const ticket of snap.docs) {
    const selections = await ticket.ref.collection("selections").get();
    const statuses: Status[] = [];
    for (const sel of selections.docs) {
      const s = sel.data();
      const matchSnap = await db.collection("matches").doc(String(s.matchId)).get();
      if (!matchSnap.exists) continue;
      const m = matchSnap.data();
      if (!m) continue;
      const matchStatus = String(m.status ?? "").toUpperCase();
      if (!m.resultSource || !m.resultVerifiedAt) {
        statuses.push("PENDING");
        continue;
      }
      if (isCancelledStatus(matchStatus)) {
        statuses.push("CANCELLED");
        if (s.status !== "CANCELLED")
          await sel.ref.update({ status: "CANCELLED", settledAt: FieldValue.serverTimestamp() });
        continue;
      }
      if (s.market !== "HALF_TIME" && !isFinalStatus(matchStatus)) {
        statuses.push("PENDING");
        continue;
      }
      const status = outcome(s, m);
      statuses.push(status);
      if (status !== s.status)
        await sel.ref.update({ status, settledAt: FieldValue.serverTimestamp() });
    }
    const active = statuses.filter((s) => s !== "VOID");
    const ticketStatus: Status = !active.length
      ? "VOID"
      : active.includes("LOST")
        ? "LOST"
        : active.includes("PENDING")
          ? "PENDING"
          : "WON";
    if (ticketStatus !== ticket.data().status) {
      await ticket.ref.update({ status: ticketStatus, updatedAt: FieldValue.serverTimestamp() });
      await updateCreatorStats(String(ticket.data().creatorId));
      settled++;
    }
  }
  await settlePredictions();
  return settled;
}

type AutoPickSettings = {
  enabled: boolean;
  minSelections: number;
  maxSelections: number;
  minOddsPerSelection: number;
  maxOddsPerSelection: number;
  minTotalOdds: number;
  maxTotalOdds: number;
  risk: "LOW" | "MEDIUM" | "HIGH";
  leagueIds?: string[];
  markets?: string[];
};
const defaultAutoPickSettings: AutoPickSettings = {
  enabled: true,
  minSelections: 2,
  maxSelections: 5,
  minOddsPerSelection: 1.4,
  maxOddsPerSelection: 1.8,
  minTotalOdds: 1,
  maxTotalOdds: 12,
  risk: "LOW",
};
function isUpcoming(match: any, now = Date.now()) {
  const kickoff = new Date(String(match.kickoffAt)).getTime();
  return Number.isFinite(kickoff) && kickoff > now && kickoff < now + 36 * 60 * 60 * 1000;
}
function chooseAutoOption(match: any, settings: AutoPickSettings) {
  const markets = Array.isArray(match.markets) ? match.markets : [];
  const preferred = settings.markets?.length
    ? settings.markets
    : settings.risk === "LOW"
      ? ["DOUBLE_CHANCE", "DRAW_NO_BET", "OVER_UNDER", "BTTS"]
      : ["DOUBLE_CHANCE", "1X2", "DRAW_NO_BET", "OVER_UNDER", "BTTS"];
  for (const marketName of preferred) {
    const market = markets.find((item: any) => item.market === marketName);
    const options = (market?.options ?? [])
      .map((option: any) => ({ ...option, odds: Number(option.odds) }))
      .filter(
        (option: any) =>
          option.odds >= settings.minOddsPerSelection &&
          option.odds <= settings.maxOddsPerSelection,
      )
      .sort((a: any, b: any) => a.odds - b.odds);
    if (options.length) return { market: marketName, ...options[0] };
  }
  return null;
}
async function runAutoTicket() {
  const configSnap = await db.collection("automation").doc("config").get();
  const settings = {
    ...defaultAutoPickSettings,
    ...(configSnap.data() ?? {}),
    // Kila selection lazima iwe ndani ya kiwango kilichoombwa.
    minOddsPerSelection: 1.4,
    maxOddsPerSelection: 1.8,
  } as AutoPickSettings;
  if (!settings.enabled) return { created: false, reason: "disabled" };
  const matchesSnap = await db.collection("matches").orderBy("kickoffAt", "asc").limit(80).get();
  const matches: any[] = matchesSnap.docs
    .map((item): any => ({ id: item.id, ...item.data() }))
    .filter(
      (match) =>
        isUpcoming(match) &&
        ["NS", "TBD"].includes(String(match.status).toUpperCase()) &&
        hasFreshOdds(match) &&
        (!settings.leagueIds?.length || settings.leagueIds.includes(String(match.leagueId))),
    );
  const selections: any[] = [];
  for (const match of matches) {
    const option = chooseAutoOption(match, settings);
    if (!option || selections.some((item) => item.matchId === match.id)) continue;
    selections.push({
      matchId: match.id,
      market: option.market,
      line: option.line ?? null,
      prediction: String(option.prediction),
      odds: option.odds,
      oddsSource: match.oddsSource,
      oddsFetchedAt: match.oddsFetchedAt,
      homeTeam: match.homeTeamName,
      awayTeam: match.awayTeamName,
      kickoffAt: match.kickoffAt,
      leagueName: match.leagueName,
      status: "PENDING",
    });
    if (selections.length >= Math.max(2, Math.min(5, settings.maxSelections))) break;
  }
  const totalOdds = selections.reduce((total, selection) => total * Number(selection.odds), 1);
  if (
    selections.length < Math.max(2, settings.minSelections) ||
    totalOdds < settings.minTotalOdds ||
    totalOdds > settings.maxTotalOdds
  )
    return { created: false, reason: "not-enough-qualifying-selections" };
  const windowKey = new Date().toISOString().slice(0, 13);
  const duplicate = await db
    .collection("tickets")
    .where("automationWindow", "==", windowKey)
    .limit(1)
    .get();
  if (!duplicate.empty)
    return { created: false, reason: "already-created", ticketId: duplicate.docs[0].id };
  const ticketRef = db.collection("tickets").doc();
  const batch = db.batch();
  batch.set(ticketRef, {
    creatorId: "AUTO_BOT",
    creatorUsername: "wazee_betting_tz",
    creatorName: "Wazee wa Betting Tz",
    creatorPhotoURL: null,
    title: `Mkeka wa Automatic • ${new Date().toLocaleDateString("sw-TZ")}`,
    description:
      "Mkeka huu umetengenezwa na mfumo kwa kutumia odds na ratiba kutoka Sports API. Hakuna uhakika wa ushindi; cheza kwa uwajibikaji.",
    sport: "Football",
    risk: settings.risk,
    visibility: "PUBLIC",
    access: "FREE",
    totalOdds: Number(totalOdds.toFixed(2)),
    oddsSource: "api-football",
    oddsVerifiedAt: FieldValue.serverTimestamp(),
    status: "PENDING",
    selectionCount: selections.length,
    automated: true,
    automationWindow: windowKey,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  selections.forEach((selection, index) =>
    batch.set(ticketRef.collection("selections").doc(String(index + 1)), {
      ...selection,
      kickoffAt: new Date(selection.kickoffAt),
      createdAt: FieldValue.serverTimestamp(),
    }),
  );
  await batch.commit();
  return { created: true, ticketId: ticketRef.id, selections: selections.length, totalOdds };
}
export const generateAutoTicket = onSchedule(
  { schedule: "every 24 hours", timeZone: "Africa/Dar_es_Salaam", region: "europe-west1" },
  async () => {
    try {
      const result = {
        created: false,
        reason: "daily-free-target-generator-owns-odds-3-5-10",
      };
      await db
        .collection("api_logs")
        .add({ type: "auto-ticket", ok: true, result, createdAt: FieldValue.serverTimestamp() });
    } catch (e) {
      console.error("auto ticket failed", e);
      await db.collection("api_logs").add({
        type: "auto-ticket",
        ok: false,
        error: String(e),
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  },
);
export const adminGenerateAutoTicket = onCall({ region: "europe-west1" }, async (request) => {
  await assertAdmin(request);
  return {
    created: false,
    reason: "free-target-tickets-3-5-10-run-through-daily-generator",
  };
});
export const syncSports = onSchedule(
  { schedule: "every 10 minutes", timeZone: "Africa/Dar_es_Salaam", region: "europe-west1" },
  async () => {
    const now = new Date();
    for (let i = -1; i < 3; i++) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() + i);
      const date = d.toISOString().slice(0, 10);
      try {
        await syncDate(date);
      } catch (e) {
        console.error("sync failed", date, e);
        await db.collection("api_logs").add({
          type: "sync",
          date,
          ok: false,
          error: String(e),
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    }
    try {
      await settle();
    } catch (e) {
      console.error("settlement failed", e);
      await db.collection("api_logs").add({
        type: "settlement",
        ok: false,
        error: String(e),
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  },
);
export const adminSync = onCall({ region: "europe-west1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
  const u = await db.collection("users").doc(request.auth.uid).get();
  if (!["ADMIN", "SUPER_ADMIN"].includes(u.data()?.role))
    throw new HttpsError("permission-denied", "Admin only.");
  try {
    const date = String(request.data?.date ?? new Date().toISOString().slice(0, 10));
    const count = await syncDate(date);
    const settled = await settle();
    await db.collection("api_logs").add({
      type: "manual-sync",
      date,
      count,
      settled,
      ok: true,
      by: request.auth.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { ok: true, count, settled };
  } catch (e) {
    await db.collection("api_logs").add({
      type: "manual-sync",
      ok: false,
      error: String(e),
      by: request.auth.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    throw new HttpsError("internal", "Sports synchronization failed.");
  }
});

function assertPrivileged(request: any) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
}
async function assertAdmin(request: any) {
  assertPrivileged(request);
  const u = await db.collection("users").doc(request.auth.uid).get();
  if (!["ADMIN", "SUPER_ADMIN"].includes(u.data()?.role))
    throw new HttpsError("permission-denied", "Admin only.");
}
export const adminResetUserPassword = onCall({ region: "europe-west1" }, async (request) => {
  await assertAdmin(request);
  const auth = request.auth!;
  const uid = String(request.data?.uid ?? "");
  const password = String(request.data?.password ?? "");
  if (!uid || password.length < 8)
    throw new HttpsError("invalid-argument", "UID na password ya angalau herufi 8 vinahitajika.");
  const target = await db.collection("users").doc(uid).get();
  if (!target.exists) throw new HttpsError("not-found", "User profile haipo.");
  if (target.data()?.role === "SUPER_ADMIN" && auth.uid !== uid)
    throw new HttpsError("permission-denied", "SUPER_ADMIN hawezi kubadilishwa na admin mwingine.");
  await getAuth().updateUser(uid, { password });
  await db
    .collection("passwordResets")
    .add({ targetUid: uid, actorUid: auth.uid, createdAt: FieldValue.serverTimestamp() });
  return { ok: true };
});

type AdminRole = "USER" | "ADMIN" | "SUPER_ADMIN";
type DashboardUser = {
  uid: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  phone?: string;
  email?: string;
  role: AdminRole;
  disabled: boolean;
  createdAt?: string;
  ticketCount?: number;
  winRate?: number;
};

export const adminDashboard = onCall({ region: "europe-west1" }, async (request) => {
  await assertAdmin(request);
  const [authUsers, profileSnap, ticketSnap, matchSnap, paymentSnap] = await Promise.all([
    getAuth().listUsers(1000),
    db.collection("users").limit(1000).get(),
    db.collection("tickets").limit(1000).get(),
    db.collection("matches").limit(1000).get(),
    db.collection("payments").limit(1000).get(),
  ]);
  const profiles = new Map(profileSnap.docs.map((item) => [item.id, item.data()]));
  const users: DashboardUser[] = authUsers.users.map((authUser) => {
    const profile = profiles.get(authUser.uid) ?? {};
    return {
      uid: authUser.uid,
      displayName: profile.displayName ?? authUser.displayName ?? undefined,
      firstName: profile.firstName,
      lastName: profile.lastName,
      username: profile.username,
      phone: profile.phone,
      email: profile.email ?? authUser.email,
      role: (profile.role ?? "USER") as AdminRole,
      disabled: authUser.disabled,
      createdAt: authUser.metadata.creationTime,
      ticketCount: Number(profile.ticketCount ?? 0),
      winRate: Number(profile.winRate ?? 0),
    };
  });
  const byStatus = (status: string) =>
    ticketSnap.docs.filter((item) => item.data().status === status).length;
  const revenue = paymentSnap.docs.reduce((sum, item) => {
    const value = Number(item.data().amount ?? 0);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
  const now = new Date();
  const registrationTrend = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() - (13 - index));
    const key = date.toISOString().slice(0, 10);
    return {
      label: date.toLocaleDateString("sw-TZ", { day: "2-digit", month: "short" }),
      count: users.filter((item) => item.createdAt?.slice(0, 10) === key).length,
    };
  });
  return {
    users,
    registrationTrend,
    metrics: {
      users: users.length,
      activeUsers: users.filter((item) => !item.disabled).length,
      tickets: ticketSnap.size,
      won: byStatus("WON"),
      lost: byStatus("LOST"),
      pending: byStatus("PENDING"),
      matches: matchSnap.size,
      revenue,
    },
  };
});

export const adminSetTipsterVerification = onCall({ region: "europe-west1" }, async (request) => {
  await assertAdmin(request);
  const uid = String(request.data?.uid ?? "");
  const verified = request.data?.verified;
  if (!uid || typeof verified !== "boolean")
    throw new HttpsError("invalid-argument", "UID na verification status vinahitajika.");
  const target = await db.collection("users").doc(uid).get();
  if (!target.exists) throw new HttpsError("not-found", "User profile haipo.");
  await db
    .collection("publicProfiles")
    .doc(uid)
    .set({ accountVerified: verified, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await db.collection("adminAudit").add({
    type: "tipster-verification",
    targetUid: uid,
    verified,
    actorUid: request.auth!.uid,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { ok: true, verified };
});
export const adminSetUserStatus = onCall({ region: "europe-west1" }, async (request) => {
  await assertAdmin(request);
  const uid = String(request.data?.uid ?? "");
  const disabled = request.data?.disabled;
  if (!uid || typeof disabled !== "boolean")
    throw new HttpsError("invalid-argument", "UID na status vinahitajika.");
  const target = await db.collection("users").doc(uid).get();
  if (!target.exists) throw new HttpsError("not-found", "User profile haipo.");
  if (target.data()?.role === "SUPER_ADMIN")
    throw new HttpsError("permission-denied", "SUPER_ADMIN hawezi kuzuiwa.");
  await getAuth().updateUser(uid, { disabled });
  await db
    .collection("users")
    .doc(uid)
    .set({ disabled, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true, disabled };
});

export const adminSetUserRole = onCall({ region: "europe-west1" }, async (request) => {
  await assertAdmin(request);
  const actor = await db.collection("users").doc(request.auth!.uid).get();
  if (actor.data()?.role !== "SUPER_ADMIN")
    throw new HttpsError("permission-denied", "SUPER_ADMIN only.");
  const uid = String(request.data?.uid ?? "");
  const role = String(request.data?.role ?? "") as AdminRole;
  if (!uid || !["USER", "ADMIN"].includes(role))
    throw new HttpsError("invalid-argument", "UID na role halali vinahitajika.");
  const target = await db.collection("users").doc(uid).get();
  if (!target.exists || target.data()?.role === "SUPER_ADMIN")
    throw new HttpsError("permission-denied", "Akaunti hii haiwezi kubadilishwa.");
  await db
    .collection("users")
    .doc(uid)
    .set({ role, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true, role };
});

export const adminMatchData = onCall({ region: "europe-west1" }, async (request) => {
  await assertAdmin(request);
  const [matchesSnap, configSnap, logsSnap] = await Promise.all([
    db.collection("matches").orderBy("kickoffAt", "asc").limit(200).get(),
    db.collection("automation").doc("config").get(),
    db.collection("api_logs").orderBy("createdAt", "desc").limit(50).get(),
  ]);
  return {
    matches: matchesSnap.docs.map((item) => ({ id: item.id, ...item.data() })),
    autoConfig: {
      ...defaultAutoPickSettings,
      ...(configSnap.data() ?? {}),
      minOddsPerSelection: 1.4,
      maxOddsPerSelection: 1.8,
    },
    logs: logsSnap.docs.map((item) => ({ id: item.id, ...item.data() })),
  };
});

export const adminSetAutoConfig = onCall({ region: "europe-west1" }, async (request) => {
  await assertAdmin(request);
  const raw = request.data ?? {};
  const config = {
    enabled: Boolean(raw.enabled),
    minSelections: Math.max(2, Math.min(10, Number(raw.minSelections ?? 2))),
    maxSelections: Math.max(2, Math.min(10, Number(raw.maxSelections ?? 5))),
    minOddsPerSelection: Math.max(1.01, Number(raw.minOddsPerSelection ?? 1.1)),
    maxOddsPerSelection: Math.max(1.01, Number(raw.maxOddsPerSelection ?? 1.65)),
    minTotalOdds: Math.max(1, Number(raw.minTotalOdds ?? 1)),
    maxTotalOdds: Math.max(1, Number(raw.maxTotalOdds ?? 12)),
    risk: ["LOW", "MEDIUM", "HIGH"].includes(raw.risk) ? raw.risk : "LOW",
    leagueIds: Array.isArray(raw.leagueIds) ? raw.leagueIds.map(String).slice(0, 50) : [],
    markets: Array.isArray(raw.markets) ? raw.markets.map(String).slice(0, 10) : [],
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: request.auth!.uid,
  };
  if (
    config.minSelections > config.maxSelections ||
    config.minOddsPerSelection > config.maxOddsPerSelection ||
    config.minTotalOdds > config.maxTotalOdds
  )
    throw new HttpsError("invalid-argument", "Kiwango cha chini hakiwezi kuzidi cha juu.");
  await db.collection("automation").doc("config").set(config, { merge: true });
  await db.collection("api_logs").add({
    type: "auto-ticket-config",
    ok: true,
    by: request.auth!.uid,
    config,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { ok: true, config };
});

export const adminCreateTicket = onCall({ region: "europe-west1" }, async (request) => {
  await assertAdmin(request);
  const input = request.data ?? {};
  const selections = Array.isArray(input.selections) ? input.selections : [];
  if (!String(input.title ?? "").trim() || selections.length < 1)
    throw new HttpsError("invalid-argument", "Title na selection angalau moja vinahitajika.");
  const uniqueMatches = new Set<string>();
  const validated: any[] = [];
  for (const selection of selections) {
    const matchId = String(selection.matchId ?? "");
    if (!matchId || uniqueMatches.has(matchId))
      throw new HttpsError("invalid-argument", "Tiketi haiwezi kuwa na mechi duplicate.");
    uniqueMatches.add(matchId);
    const matchSnap = await db.collection("matches").doc(matchId).get();
    if (!matchSnap.exists)
      throw new HttpsError("failed-precondition", "Mechi haipo kwenye Sports API data.");
    const match = matchSnap.data()!;
    if (!isUpcoming(match))
      throw new HttpsError("failed-precondition", "Mechi iliyopita au iliyofutwa hairuhusiwi.");
    const market = (match.markets ?? []).find(
      (item: any) => item.market === String(selection.market),
    );
    const option = (market?.options ?? []).find(
      (item: any) =>
        String(item.prediction) === String(selection.prediction) &&
        Number(item.odds) === Number(selection.odds),
    );
    if (!option)
      throw new HttpsError("failed-precondition", "Odds hii haijathibitishwa na Sports API.");
    validated.push({
      matchId,
      market: String(selection.market),
      line: option.line ?? null,
      prediction: String(option.prediction),
      odds: Number(option.odds),
      homeTeam: match.homeTeamName,
      awayTeam: match.awayTeamName,
      kickoffAt: match.kickoffAt,
      leagueName: match.leagueName,
      status: "PENDING",
    });
  }
  const title = String(input.title).trim();
  const ticketId = String(input.ticketId ?? "");
  const ticketRef = ticketId
    ? db.collection("tickets").doc(ticketId)
    : db.collection("tickets").doc();
  const existing = ticketId ? await ticketRef.get() : null;
  if (ticketId && !existing?.exists) throw new HttpsError("not-found", "Tiketi haipo.");
  const batch = db.batch();
  if (existing?.exists) {
    const oldSelections = await ticketRef.collection("selections").get();
    oldSelections.docs.forEach((item) => batch.delete(item.ref));
  }
  const totalOdds = validated.reduce((total, item) => total * item.odds, 1);
  batch.set(
    ticketRef,
    {
      ...(existing?.data() ?? {}),
      creatorId: request.auth!.uid,
      creatorName: "Admin",
      title,
      description: String(input.description ?? ""),
      sport: "Football",
      risk: String(input.risk ?? "MEDIUM"),
      visibility: input.visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC",
      access: "FREE",
      totalOdds: Number(totalOdds.toFixed(2)),
      status: "PENDING",
      selectionCount: validated.length,
      automated: false,
      source: "admin-verified-sports-api",
      updatedAt: FieldValue.serverTimestamp(),
      ...(existing?.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );
  validated.forEach((item, index) =>
    batch.set(ticketRef.collection("selections").doc(String(index + 1)), {
      ...item,
      kickoffAt: new Date(item.kickoffAt),
      createdAt: FieldValue.serverTimestamp(),
    }),
  );
  await batch.commit();
  await db.collection("api_logs").add({
    type: ticketId ? "admin-ticket-update" : "admin-ticket-create",
    ok: true,
    ticketId: ticketRef.id,
    by: request.auth!.uid,
    createdAt: FieldValue.serverTimestamp(),
  });
  return {
    ok: true,
    ticketId: ticketRef.id,
    totalOdds: Number(totalOdds.toFixed(2)),
    selectionCount: validated.length,
  };
});

async function writeAdminActivity(
  actorUid: string,
  action: string,
  targetUid?: string,
  details?: Record<string, unknown>,
) {
  await db.collection("adminActivityLogs").add({
    actorUid,
    action,
    ...(targetUid ? { targetUid } : {}),
    ...(details ? { details } : {}),
    createdAt: FieldValue.serverTimestamp(),
  });
}

type VirtualCoinReward = { label: string; amount: number; requiredWins: number };
type VirtualCoinSettings = {
  welcomeBonus: number;
  dailyGrant: number;
  dailyGrantEnabled: boolean;
  minBet: number;
  maxBet: number;
  rewards: VirtualCoinReward[];
};
const defaultVirtualCoinSettings: VirtualCoinSettings = {
  welcomeBonus: 100,
  dailyGrant: 25,
  dailyGrantEnabled: true,
  minBet: 1,
  maxBet: 1000,
  rewards: [
    { label: "Mshindi wa wiki", amount: 250, requiredWins: 5 },
    { label: "Mshindi wa mwezi", amount: 1000, requiredWins: 20 },
  ],
};
function coinWalletRef(uid: string) {
  return db.collection("coinBalances").doc(uid);
}
function coinTransactionRef(uid: string, idempotencyKey: string) {
  return db
    .collection("coinTransactions")
    .doc(`${uid}_${idempotencyKey}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 140));
}
function normalizeCoinSettings(raw: any): VirtualCoinSettings {
  const rewards = Array.isArray(raw?.rewards)
    ? raw.rewards
        .slice(0, 10)
        .map((item: any) => ({
          label: String(item?.label ?? "Reward")
            .trim()
            .slice(0, 80),
          amount: Math.max(0, Math.min(1000000, Math.floor(Number(item?.amount ?? 0)))),
          requiredWins: Math.max(0, Math.min(100000, Math.floor(Number(item?.requiredWins ?? 0)))),
        }))
        .filter((item: VirtualCoinReward) => item.label && item.amount > 0)
    : defaultVirtualCoinSettings.rewards;
  return {
    welcomeBonus: Math.max(
      0,
      Math.min(
        1000000,
        Math.floor(Number(raw?.welcomeBonus ?? defaultVirtualCoinSettings.welcomeBonus)),
      ),
    ),
    dailyGrant: Math.max(
      0,
      Math.min(
        1000000,
        Math.floor(Number(raw?.dailyGrant ?? defaultVirtualCoinSettings.dailyGrant)),
      ),
    ),
    dailyGrantEnabled: raw?.dailyGrantEnabled !== false,
    minBet: Math.max(
      1,
      Math.min(1000000, Math.floor(Number(raw?.minBet ?? defaultVirtualCoinSettings.minBet))),
    ),
    maxBet: Math.max(
      1,
      Math.min(1000000, Math.floor(Number(raw?.maxBet ?? defaultVirtualCoinSettings.maxBet))),
    ),
    rewards: rewards.length ? rewards : defaultVirtualCoinSettings.rewards,
  };
}
async function getVirtualCoinSettings() {
  const snap = await db.collection("coinSettings").doc("main").get();
  return normalizeCoinSettings(snap.data() ?? defaultVirtualCoinSettings);
}
export const getVirtualCoinWallet = onCall({ region: "europe-west1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
  const [walletSnap, txSnap, settings] = await Promise.all([
    coinWalletRef(request.auth.uid).get(),
    db.collection("coinTransactions").where("userId", "==", request.auth.uid).limit(50).get(),
    getVirtualCoinSettings(),
  ]);
  return {
    balance: Number(walletSnap.data()?.balance ?? 0),
    lifetimeEarned: Number(walletSnap.data()?.lifetimeEarned ?? 0),
    lifetimeSpent: Number(walletSnap.data()?.lifetimeSpent ?? 0),
    settings: { minBet: settings.minBet, maxBet: settings.maxBet },
    transactions: txSnap.docs.map((item) => ({ id: item.id, ...item.data() })),
  };
});
export const claimVirtualCoins = onCall({ region: "europe-west1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
  const uid = request.auth.uid;
  const kind = String(request.data?.kind ?? "daily").toLowerCase();
  const settings = await getVirtualCoinSettings();
  if (kind !== "daily" && kind !== "welcome")
    throw new HttpsError("invalid-argument", "Reward haijulikani.");
  if (kind === "daily" && !settings.dailyGrantEnabled)
    throw new HttpsError("failed-precondition", "Daily coins zimezimwa.");
  const amount = kind === "daily" ? settings.dailyGrant : settings.welcomeBonus;
  const key = kind === "daily" ? `daily-${new Date().toISOString().slice(0, 10)}` : "welcome";
  const txRef = coinTransactionRef(uid, key);
  const walletRef = coinWalletRef(uid);
  let claimed = false;
  await db.runTransaction(async (tx) => {
    const [existing, wallet] = await Promise.all([tx.get(txRef), tx.get(walletRef)]);
    if (existing.exists) return;
    if (kind === "welcome" && Number(wallet.data()?.lifetimeEarned ?? 0) > 0) return;
    if (amount < 1) return;
    const current = Number(wallet.data()?.balance ?? 0);
    tx.set(
      walletRef,
      {
        balance: current + amount,
        lifetimeEarned: Number(wallet.data()?.lifetimeEarned ?? 0) + amount,
        lifetimeSpent: Number(wallet.data()?.lifetimeSpent ?? 0),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    tx.create(txRef, {
      userId: uid,
      type: "REWARD",
      amount,
      reason: kind === "daily" ? "Daily free coins" : "Welcome bonus",
      idempotencyKey: key,
      createdAt: FieldValue.serverTimestamp(),
    });
    claimed = true;
  });
  return { ok: true, claimed, amount: claimed ? amount : 0, kind };
});
export const adminVirtualCoinOverview = onCall({ region: "europe-west1" }, async (request) => {
  await assertAdmin(request);
  const [walletSnap, txSnap, settingsSnap] = await Promise.all([
    db.collection("coinBalances").limit(1000).get(),
    db.collection("coinTransactions").orderBy("createdAt", "desc").limit(200).get(),
    db.collection("coinSettings").doc("main").get(),
  ]);
  const wallets = walletSnap.docs.map((item) => ({ uid: item.id, ...item.data() }));
  return {
    settings: normalizeCoinSettings(settingsSnap.data() ?? defaultVirtualCoinSettings),
    wallets,
    transactions: txSnap.docs.map((item) => ({ id: item.id, ...item.data() })),
    totals: {
      balance: wallets.reduce((sum, item: any) => sum + Number(item.balance ?? 0), 0),
      earned: wallets.reduce((sum, item: any) => sum + Number(item.lifetimeEarned ?? 0), 0),
      spent: wallets.reduce((sum, item: any) => sum + Number(item.lifetimeSpent ?? 0), 0),
    },
  };
});
export const adminSaveVirtualCoinSettings = onCall({ region: "europe-west1" }, async (request) => {
  await assertAdmin(request);
  const actor = await db.collection("users").doc(request.auth!.uid).get();
  if (actor.data()?.role !== "SUPER_ADMIN")
    throw new HttpsError("permission-denied", "SUPER_ADMIN only.");
  const settings = normalizeCoinSettings(request.data ?? {});
  if (settings.minBet > settings.maxBet)
    throw new HttpsError("invalid-argument", "Min bet haiwezi kuzidi max bet.");
  await db
    .collection("coinSettings")
    .doc("main")
    .set(
      { ...settings, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth!.uid },
      { merge: true },
    );
  await writeAdminActivity(request.auth!.uid, "virtual_coins.settings_updated", undefined, {
    dailyGrantEnabled: settings.dailyGrantEnabled,
  });
  return { ok: true, settings };
});
export const adminGrantVirtualCoins = onCall({ region: "europe-west1" }, async (request) => {
  await assertAdmin(request);
  const uid = String(request.data?.uid ?? "").trim();
  const amount = Math.floor(Number(request.data?.amount ?? 0));
  const reason = String(request.data?.reason ?? "Admin reward")
    .trim()
    .slice(0, 160);
  const idempotencyKey = String(request.data?.idempotencyKey ?? "").trim();
  if (
    !uid ||
    !idempotencyKey ||
    !Number.isSafeInteger(amount) ||
    amount < 1 ||
    amount > 1000000 ||
    !reason
  )
    throw new HttpsError("invalid-argument", "UID, kiasi, sababu na idempotency key vinahitajika.");
  const target = await db.collection("users").doc(uid).get();
  if (!target.exists) throw new HttpsError("not-found", "User profile haipo.");
  const txRef = coinTransactionRef(uid, idempotencyKey);
  const walletRef = coinWalletRef(uid);
  await db.runTransaction(async (tx) => {
    const [existing, wallet] = await Promise.all([tx.get(txRef), tx.get(walletRef)]);
    if (existing.exists) return;
    const current = Number(wallet.data()?.balance ?? 0);
    tx.set(
      walletRef,
      {
        balance: current + amount,
        lifetimeEarned: Number(wallet.data()?.lifetimeEarned ?? 0) + amount,
        lifetimeSpent: Number(wallet.data()?.lifetimeSpent ?? 0),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    tx.create(txRef, {
      userId: uid,
      type: "GRANT",
      amount,
      reason,
      idempotencyKey,
      actorUid: request.auth!.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  await writeAdminActivity(request.auth!.uid, "virtual_coins.granted", uid, { amount, reason });
  return { ok: true, idempotent: true };
});
export const placeVirtualBet = onCall({ region: "europe-west1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
  const amount = Math.floor(Number(request.data?.amount ?? 0));
  const idempotencyKey = String(request.data?.idempotencyKey ?? "").trim();
  const ticketId = String(request.data?.ticketId ?? "").trim();
  if (!ticketId || !idempotencyKey || !Number.isSafeInteger(amount))
    throw new HttpsError("invalid-argument", "Ticket, kiasi na idempotency key vinahitajika.");
  const settings = await getVirtualCoinSettings();
  if (amount < settings.minBet || amount > settings.maxBet)
    throw new HttpsError("invalid-argument", "Kiasi cha coins hakipo kwenye mipaka.");
  const ticket = await db.collection("tickets").doc(ticketId).get();
  if (!ticket.exists || ticket.data()?.status !== "PENDING")
    throw new HttpsError("failed-precondition", "Ticket haipokei virtual bet.");
  const txRef = coinTransactionRef(request.auth.uid, idempotencyKey);
  const walletRef = coinWalletRef(request.auth.uid);
  await db.runTransaction(async (tx) => {
    const [existing, wallet] = await Promise.all([tx.get(txRef), tx.get(walletRef)]);
    if (existing.exists) return;
    const balance = Number(wallet.data()?.balance ?? 0);
    if (balance < amount)
      throw new HttpsError("failed-precondition", "Salio la virtual coins halitoshi.");
    tx.update(walletRef, {
      balance: balance - amount,
      lifetimeSpent: Number(wallet.data()?.lifetimeSpent ?? 0) + amount,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(txRef, {
      userId: request.auth!.uid,
      type: "BET",
      amount: -amount,
      ticketId,
      idempotencyKey,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return { ok: true, amount, ticketId };
});
