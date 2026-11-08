import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
initializeApp();
const db = getFirestore();
const API_BASE = process.env.SPORTS_API_BASE_URL ?? "https://v3.football.api-sports.io";
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
  homeTeamLogo?: string | null;
  awayTeamLogo?: string | null;
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
    homeTeamLogo: t.home.logo ?? null,
    awayTeamLogo: t.away.logo ?? null,
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
  const first = response?.[0];
  const bets = first?.bookmakers?.[0]?.bets ?? [];
  for (const bet of bets) {
    const name = String(bet.name).toLowerCase();
    const values = (bet.values ?? [])
      .map((v: any) => ({
        prediction: String(v.value),
        odds: Number(v.odd),
        line: v.handicap ? Number(v.handicap) : null,
      }))
      .filter((v: any) => Number.isFinite(v.odds));
    let market: any = null;
    if (name.includes("match winner")) market = { market: "1X2", options: values };
    else if (name.includes("double chance")) market = { market: "DOUBLE_CHANCE", options: values };
    else if (name.includes("both teams score")) market = { market: "BTTS", options: values };
    else if (name.includes("goals over/under")) market = { market: "OVER_UNDER", options: values };
    else if (name.includes("draw no bet")) market = { market: "DRAW_NO_BET", options: values };
    else if (name.includes("asian handicap") || name.includes("handicap"))
      market = { market: "HANDICAP", options: values };
    if (market && market.options.length) markets.push(market);
  }
  return markets;
}
async function syncDate(date: string) {
  const fixtures = await api("/fixtures", { date });
  let count = 0;
  for (const raw of fixtures) {
    const m = normalizeFixture(raw);
    let markets: any[] = [];
    let oddsSynced = false;
    try {
      markets = normalizeOdds(await api("/odds", { fixture: m.eventId }));
      oddsSynced = true;
    } catch (e) {
      console.error("odds", m.eventId, e);
    }
    await db
      .collection("matches")
      .doc(m.eventId)
      .set(
        {
          ...m,
          markets,
          externalProvider: "api-football",
          ...(oddsSynced
            ? { oddsSource: "api-football", oddsFetchedAt: FieldValue.serverTimestamp() }
            : {}),
          ...(isFinalStatus(m.status) && m.homeScore != null && m.awayScore != null
            ? { resultSource: "api-football", resultVerifiedAt: FieldValue.serverTimestamp() }
            : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    count++;
  }
  return count;
}
function outcome(selection: any, match: any): Status {
  const hs = selection.market === "HALF_TIME" ? match.halfHomeScore : match.homeScore;
  const as = selection.market === "HALF_TIME" ? match.halfAwayScore : match.awayScore;
  if (hs == null || as == null) return "PENDING";
  const p = String(selection.prediction).toUpperCase().replaceAll(" ", "");
  const market = selection.market;
  if (market === "BTTS") return (hs > 0 && as > 0) === (p === "YES" || p === "GG") ? "WON" : "LOST";
  if (market === "1X2" || market === "HALF_TIME") {
    const r = hs > as ? "HOME" : hs < as ? "AWAY" : "DRAW";
    return (
      p.includes("HOME") || p === "1"
        ? r === "HOME"
        : p.includes("AWAY") || p === "2"
          ? r === "AWAY"
          : r === "DRAW"
    )
      ? "WON"
      : "LOST";
  }
  if (market === "DOUBLE_CHANCE") {
    const r = hs > as ? "1" : hs < as ? "2" : "X";
    return (p.includes("1X") && r !== "2") ||
      (p.includes("X2") && r !== "1") ||
      (p.includes("12") && r !== "X")
      ? "WON"
      : "LOST";
  }
  if (market === "OVER_UNDER") {
    const line = Number(selection.line);
    const total = hs + as;
    const isOver = p.startsWith("OVER") || p.startsWith("O");
    return (isOver ? total > line : total < line) ? "WON" : total === line ? "VOID" : "LOST";
  }
  if (market === "DRAW_NO_BET") {
    if (hs === as) return "VOID";
    const home = p.includes("HOME") || p === "1";
    return (home && hs > as) || (!home && as > hs) ? "WON" : "LOST";
  }
  if (market === "HANDICAP") {
    const line = Number(selection.line);
    const home = p.includes("HOME") || p === "1";
    const adjusted = home ? hs + line : as + line;
    const other = home ? as : hs;
    return adjusted === other ? "VOID" : adjusted > other ? "WON" : "LOST";
  }
  return "PENDING";
}
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
const AUTO_TARGETS = [
  { target: 1.5, min: 1.35, max: 1.7, key: "1.5", minute: "15" },
  { target: 3, min: 2.7, max: 3.4, key: "3", minute: "0" },
  { target: 5, min: 4.5, max: 5.7, key: "5", minute: "45" },
  { target: 10, min: 9, max: 11.5, key: "10", minute: "30" },
] as const;
function tanzaniaDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Dar_es_Salaam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
async function runAutoTicket(target?: (typeof AUTO_TARGETS)[number]) {
  const configSnap = await db.collection("automation").doc("config").get();
  const settings = { ...defaultAutoPickSettings, ...(configSnap.data() ?? {}) } as AutoPickSettings;
  if (!settings.enabled) return { created: false, reason: "disabled" };
  const targets = target ? [target] : AUTO_TARGETS;
  const allResults = [];
  for (const spec of targets) {
    const idempotencyKey = `auto-ticket-${tanzaniaDate()}-${spec.key}`;
    const ticketRef = db.collection("tickets").doc(idempotencyKey);
    const existing = await ticketRef.get();
    if (existing.exists) {
      allResults.push({
        target: spec.target,
        created: false,
        reason: "already-created",
        ticketId: ticketRef.id,
      });
      continue;
    }
    const matchesSnap = await db.collection("matches").orderBy("kickoffAt", "asc").limit(200).get();
    const candidates: any[] = [];
    for (const doc of matchesSnap.docs) {
      const match: any = { id: doc.id, ...doc.data() };
      if (
        !isUpcoming(match) ||
        (settings.leagueIds?.length && !settings.leagueIds.includes(String(match.leagueId)))
      )
        continue;
      const oddsFetchedMillis =
        match.oddsFetchedAt?.toMillis?.() ?? new Date(match.oddsFetchedAt).getTime();
      if (
        match.oddsSource !== "api-football" ||
        !Number.isFinite(oddsFetchedMillis) ||
        Date.now() - oddsFetchedMillis > 6 * 60 * 60 * 1000 ||
        !Array.isArray(match.markets)
      )
        continue;
      for (const market of match.markets)
        for (const option of market.options ?? []) {
          const odds = Number(option.odds);
          if (
            Number.isFinite(odds) &&
            odds > 1 &&
            odds <= 4 &&
            (!settings.markets?.length || settings.markets.includes(market.market))
          )
            candidates.push({
              match,
              market: market.market,
              prediction: String(option.prediction),
              line: option.line ?? null,
              odds,
              oddsSource: match.oddsSource,
              oddsFetchedAt: match.oddsFetchedAt,
            });
        }
    }
    // Bounded deterministic search: each match can occur once; no synthetic odds.
    let chosen: any[] | null = null;
    let visited = 0;
    const search = (from: number, picks: any[], product: number) => {
      if (product >= spec.min && product <= spec.max) {
        chosen = [...picks];
        return true;
      }
      if (product > spec.max || picks.length >= 10 || visited++ > 12000) return false;
      for (let i = from; i < candidates.length; i++) {
        const candidate = candidates[i];
        if (picks.some((pick) => pick.match.id === candidate.match.id)) continue;
        if (search(i + 1, [...picks, candidate], product * candidate.odds)) return true;
      }
      return false;
    };
    search(0, [], 1);
    if (!chosen) {
      const result = {
        created: false,
        reason: candidates.length
          ? "no-odds-combination-in-target-range"
          : "no-fixtures-or-fresh-odds",
        target: spec.target,
      };
      allResults.push(result);
      await db.collection("api_logs").add({
        type: "auto-ticket-target",
        targetOdds: spec.target,
        idempotencyKey,
        ok: false,
        result,
        createdAt: FieldValue.serverTimestamp(),
      });
      continue;
    }
    const picks: any[] = chosen;
    const totalOdds = Number(picks.reduce((total, pick) => total * pick.odds, 1).toFixed(2));
    const latestSync = picks
      .map((pick) => pick.oddsFetchedAt)
      .sort((a, b) => {
        const get = (v: any) => v?.toMillis?.() ?? new Date(v).getTime();
        return get(b) - get(a);
      })[0];
    const batch = db.batch();
    batch.create(ticketRef, {
      creatorId: "AUTO_BOT",
      creatorUsername: "wazee_betting_tz",
      creatorName: "Wazee wa Betting TZ",
      creatorPhotoURL: null,
      creatorAccountVerified: true,
      automated: true,
      automatedDisclosure: "Mkeka wa mfumo — Wazee wa Betting TZ",
      title: `Mkeka wa Leo — Odds ${spec.target}`,
      description:
        "Mkeka wa mfumo — Wazee wa Betting TZ. Hakuna uhakika wa ushindi. Cheza kwa uwajibikaji.",
      sport: "Football",
      risk: settings.risk,
      visibility: "PUBLIC",
      access: "FREE",
      totalOdds,
      actualTotalOdds: totalOdds,
      targetOdds: spec.target,
      oddsSource: "api-football",
      oddsSyncedAt: latestSync,
      idempotencyKey,
      status: "PENDING",
      selectionCount: picks.length,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    picks.forEach((pick, index) =>
      batch.set(ticketRef.collection("selections").doc(String(index + 1)), {
        matchId: pick.match.id,
        market: pick.market,
        line: pick.line,
        prediction: pick.prediction,
        odds: pick.odds,
        oddsSource: pick.oddsSource,
        oddsFetchedAt: pick.oddsFetchedAt,
        homeTeam: pick.match.homeTeamName,
        awayTeam: pick.match.awayTeamName,
        homeTeamLogo: pick.match.homeTeamLogo ?? null,
        awayTeamLogo: pick.match.awayTeamLogo ?? null,
        kickoffAt: new Date(pick.match.kickoffAt),
        leagueName: pick.match.leagueName,
        status: "PENDING",
        createdAt: FieldValue.serverTimestamp(),
      }),
    );
    await batch.commit();
    const result = {
      created: true,
      target: spec.target,
      ticketId: ticketRef.id,
      selections: picks.length,
      totalOdds,
    };
    allResults.push(result);
    await db.collection("api_logs").add({
      type: "auto-ticket-target",
      targetOdds: spec.target,
      idempotencyKey,
      ok: true,
      result,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  return target ? allResults[0] : { results: allResults };
}
async function runScheduledAutoTarget(target: (typeof AUTO_TARGETS)[number]) {
  try {
    await runAutoTicket(target);
  } catch (error) {
    console.error("scheduled auto ticket failed", target.target, error);
    await db.collection("api_logs").add({
      type: "auto-ticket-target",
      targetOdds: target.target,
      idempotencyKey: `auto-ticket-${tanzaniaDate()}-${target.key}`,
      ok: false,
      error: String(error),
      result: { created: false, reason: "generation-error", target: target.target },
      createdAt: FieldValue.serverTimestamp(),
    });
  }
}
export const generateAutoTicket15 = onSchedule(
  { schedule: "15 1 * * *", timeZone: "Africa/Dar_es_Salaam", region: "europe-west1" },
  async () => runScheduledAutoTarget(AUTO_TARGETS[0]),
);
export const generateAutoTicket3 = onSchedule(
  { schedule: "0 2 * * *", timeZone: "Africa/Dar_es_Salaam", region: "europe-west1" },
  async () => runScheduledAutoTarget(AUTO_TARGETS[1]),
);
export const generateAutoTicket5 = onSchedule(
  { schedule: "45 2 * * *", timeZone: "Africa/Dar_es_Salaam", region: "europe-west1" },
  async () => runScheduledAutoTarget(AUTO_TARGETS[2]),
);
export const generateAutoTicket10 = onSchedule(
  { schedule: "30 3 * * *", timeZone: "Africa/Dar_es_Salaam", region: "europe-west1" },
  async () => runScheduledAutoTarget(AUTO_TARGETS[3]),
);
export const adminGenerateAutoTicket = onCall({ region: "europe-west1" }, async (request) => {
  await assertAdmin(request);
  try {
    return await runAutoTicket();
  } catch (e) {
    console.error("manual auto ticket failed", e);
    throw new HttpsError("internal", "Auto ticket imeshindikana.");
  }
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
