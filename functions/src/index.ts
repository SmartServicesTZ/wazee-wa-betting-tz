import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
initializeApp();
const db = getFirestore();
const API_BASE = process.env.SPORTS_API_BASE_URL ?? "https://v3.football.api-sports.io";
const SPORTS_API_KEY = defineSecret("SPORTS_API_KEY");
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
  if (!SPORTS_API_KEY.value())
    throw new Error("SPORTS_API_KEY haijawekwa kwenye Firebase Secret Manager.");
}
async function api(path: string, params: Record<string, string> = {}) {
  assertApi();
  const savedApi = await db.collection("siteSettings").doc("main").get();
  const baseValue = String(savedApi.data()?.sportsApiBaseUrl ?? API_BASE);
  const base = baseValue.endsWith("/") ? baseValue : baseValue + "/";
  const url = new URL(path, base);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, {
    headers: { "x-apisports-key": SPORTS_API_KEY.value(), Accept: "application/json" },
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
    try {
      markets = normalizeOdds(await api("/odds", { fixture: m.eventId }));
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
  let won = 0, lost = 0, pending = 0, selectionWonCount = 0, selectionLostCount = 0;
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
  const selectionWinRate = settledSelections ? Number(((selectionWonCount / settledSelections) * 100).toFixed(2)) : 0;
  const stats = {
    ticketCount: snap.size, settledTicketCount, wonCount: won, lostCount: lost, pendingCount: pending,
    winRate, selectionWonCount, selectionLostCount, selectionWinRate,
    predictorBadge: settledTicketCount < 10 ? "NEUTRAL" : winRate < 35 ? "RED" : winRate < 65 ? "BLUE" : "GREEN",
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
      homeTeam: match.homeTeamName,
      awayTeam: match.awayTeamName,
      kickoffAt: match.kickoffAt,
      leagueName: match.leagueName,
      status: "PENDING",
    });
    if (selections.length >= Math.max(2, Math.min(10, settings.maxSelections))) break;
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
  {
    schedule: "every 30 minutes",
    timeZone: "Africa/Dar_es_Salaam",
    region: "europe-west1",
    secrets: [SPORTS_API_KEY],
  },
  async () => {
    try {
      const result = await runAutoTicket();
      if (result.created)
        await writeAdminActivity("SYSTEM", "automation.ticket_created", undefined, {
          ticketId: result.ticketId,
        });
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
  try {
    const result = await runAutoTicket();
    if (result.created)
      await writeAdminActivity(request.auth!.uid, "automation.ticket_created", undefined, {
        ticketId: result.ticketId,
      });
    return result;
  } catch (e) {
    console.error("manual auto ticket failed", e);
    throw new HttpsError("internal", "Auto ticket imeshindikana.");
  }
});
export const syncSports = onSchedule(
  {
    schedule: "every 10 minutes",
    timeZone: "Africa/Dar_es_Salaam",
    region: "europe-west1",
    secrets: [SPORTS_API_KEY],
  },
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
export const adminSync = onCall(
  { region: "europe-west1", secrets: [SPORTS_API_KEY] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const u = await db.collection("users").doc(request.auth.uid).get();
    if (!["ADMIN", "SUPER_ADMIN"].includes(u.data()?.role))
      throw new HttpsError("permission-denied", "Admin only.");
    try {
      const date = String(request.data?.date ?? new Date().toISOString().slice(0, 10));
      const count = await syncDate(date);
      const settled = await settle();
      await writeAdminActivity(request.auth.uid, "sports.sync_completed", undefined, {
        date,
        count,
        settled,
      });
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
  },
);

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
  await writeAdminActivity(auth.uid, "user.password_reset", uid);
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
  await writeAdminActivity(request.auth!.uid, disabled ? "user.disabled" : "user.enabled", uid);
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
  await writeAdminActivity(
    request.auth!.uid,
    role === "ADMIN" ? "user.admin_granted" : "user.admin_revoked",
    uid,
  );
  return { ok: true, role };
});

type SiteSettingsInput = {
  siteName: string;
  logoUrl: string;
  supportWhatsApp: string;
  terms: string;
  notifications: { ticketUpdates: boolean; results: boolean; announcements: boolean };
  announcement: {
    enabled: boolean;
    title: string;
    message: string;
    tone: "info" | "success" | "warning";
  };
  sportsApi: { configured?: boolean; baseUrl: string };
};
const defaultSiteSettings: SiteSettingsInput = {
  siteName: "WAZEE WA BETTING TZ",
  logoUrl: "",
  supportWhatsApp: "+255698232313",
  terms: "",
  notifications: { ticketUpdates: true, results: true, announcements: true },
  announcement: { enabled: false, title: "", message: "", tone: "info" },
  sportsApi: { baseUrl: "https://v3.football.api-sports.io" },
};
export const adminGetSiteSettings = onCall(
  { region: "europe-west1", secrets: [SPORTS_API_KEY] },
  async (request) => {
    await assertAdmin(request);
    const snap = await db.collection("siteSettings").doc("main").get();
    const raw = snap.data() ?? {};
    const value = { ...defaultSiteSettings, ...raw };
    return {
      siteName: String(value.siteName),
      logoUrl: String(value.logoUrl),
      supportWhatsApp: String(value.supportWhatsApp),
      terms: String(value.terms),
      notifications: { ...defaultSiteSettings.notifications, ...(value.notifications ?? {}) },
      announcement: { ...defaultSiteSettings.announcement, ...(value.announcement ?? {}) },
      sportsApi: {
        configured: Boolean(SPORTS_API_KEY.value()),
        baseUrl: String(
          raw.sportsApiBaseUrl ??
            process.env.SPORTS_API_BASE_URL ??
            defaultSiteSettings.sportsApi.baseUrl,
        ),
      },
    };
  },
);
export const adminSaveSiteSettings = onCall(
  { region: "europe-west1", secrets: [SPORTS_API_KEY] },
  async (request) => {
    await assertAdmin(request);
    const raw = (request.data ?? {}) as Partial<SiteSettingsInput>;
    const siteName = String(raw.siteName ?? "")
      .trim()
      .slice(0, 80);
    const logoUrl = String(raw.logoUrl ?? "").trim();
    const supportWhatsApp = String(raw.supportWhatsApp ?? "").trim();
    const terms = String(raw.terms ?? "").slice(0, 20000);
    const baseUrl = String(raw.sportsApi?.baseUrl ?? "").trim();
    if (!siteName || !/^\+?255\d{9}$/.test(supportWhatsApp.replace(/[\s()-]/g, "")))
      throw new HttpsError(
        "invalid-argument",
        "Jina la website na namba sahihi ya WhatsApp vinahitajika.",
      );
    if (logoUrl && (!logoUrl.startsWith("https://") || logoUrl.length > 2048))
      throw new HttpsError("invalid-argument", "Logo lazima iwe URL salama ya HTTPS.");
    let parsedBase: URL;
    try {
      parsedBase = new URL(baseUrl);
    } catch {
      throw new HttpsError("invalid-argument", "Sports API URL si sahihi.");
    }
    if (parsedBase.protocol !== "https:" || parsedBase.username || parsedBase.password)
      throw new HttpsError(
        "invalid-argument",
        "Sports API itumie HTTPS bila credentials kwenye URL.",
      );
    const notifications = {
      ticketUpdates: Boolean(raw.notifications?.ticketUpdates),
      results: Boolean(raw.notifications?.results),
      announcements: Boolean(raw.notifications?.announcements),
    };
    const tone = ["info", "success", "warning"].includes(String(raw.announcement?.tone))
      ? raw.announcement!.tone
      : "info";
    const announcement = {
      enabled: Boolean(raw.announcement?.enabled),
      title: String(raw.announcement?.title ?? "")
        .trim()
        .slice(0, 120),
      message: String(raw.announcement?.message ?? "")
        .trim()
        .slice(0, 1000),
      tone,
    };
    const settings = {
      siteName,
      logoUrl,
      supportWhatsApp,
      terms,
      notifications,
      announcement,
      sportsApiBaseUrl: parsedBase.toString(),
    };
    const updateFields = {
      ...settings,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: request.auth!.uid,
    };
    await db.collection("siteSettings").doc("main").set(updateFields, { merge: true });
    await db.collection("publicSiteContent").doc("main").set(
      {
        siteName,
        logoUrl,
        supportWhatsApp,
        terms,
        announcement,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    await writeAdminActivity(request.auth!.uid, "settings.updated", undefined, {
      changedFields: [
        "siteName",
        "logoUrl",
        "supportWhatsApp",
        "terms",
        "notifications",
        "announcement",
        "sportsApiBaseUrl",
      ],
      announcementEnabled: announcement.enabled,
    });
    return {
      ok: true,
      settings: {
        ...settings,
        sportsApi: {
          baseUrl: settings.sportsApiBaseUrl,
          configured: Boolean(SPORTS_API_KEY.value()),
        },
      },
    };
  },
);

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
  await writeAdminActivity(request.auth!.uid, "automation.config_updated", undefined, {
    enabled: config.enabled,
  });
  await db.collection("api_logs").add({
    type: "auto-ticket-config",
    ok: true,
    by: request.auth!.uid,
    config,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { ok: true, config };
});

export const adminUpdateTicket = onCall({ region: "europe-west1" }, async (request) => {
  await assertAdmin(request);
  const ticketId = String(request.data?.ticketId ?? "");
  const action = String(request.data?.action ?? "");
  if (!ticketId || !["visibility", "title"].includes(action))
    throw new HttpsError("invalid-argument", "Ticket na kitendo halali vinahitajika.");
  const ref = db.collection("tickets").doc(ticketId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Tiketi haipo.");
  if (action === "visibility") {
    const visibility = request.data?.visibility === "PUBLIC" ? "PUBLIC" : "PRIVATE";
    await ref.update({ visibility, updatedAt: FieldValue.serverTimestamp() });
    await writeAdminActivity(request.auth!.uid, "ticket.visibility_changed", undefined, {
      ticketId,
      visibility,
    });
    return { ok: true, visibility };
  }
  const title = String(request.data?.title ?? "")
    .trim()
    .slice(0, 120);
  if (!title) throw new HttpsError("invalid-argument", "Jina la tiketi linahitajika.");
  await ref.update({ title, updatedAt: FieldValue.serverTimestamp() });
  await writeAdminActivity(request.auth!.uid, "ticket.updated", undefined, { ticketId });
  return { ok: true, title };
});
export const adminDeleteTicket = onCall({ region: "europe-west1" }, async (request) => {
  await assertAdmin(request);
  const ticketId = String(request.data?.ticketId ?? "");
  if (!ticketId) throw new HttpsError("invalid-argument", "Ticket ID inahitajika.");
  const ref = db.collection("tickets").doc(ticketId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Tiketi haipo.");
  const selections = await ref.collection("selections").get();
  const batch = db.batch();
  selections.docs.forEach((item) => batch.delete(item.ref));
  batch.delete(ref);
  await batch.commit();
  await writeAdminActivity(request.auth!.uid, "ticket.deleted", undefined, { ticketId });
  return { ok: true };
});
export const adminAuditEvent = onCall({ region: "europe-west1" }, async (request) => {
  await assertAdmin(request);
  const action = String(request.data?.action ?? "");
  if (action !== "report.exported") throw new HttpsError("invalid-argument", "Tukio haliruhusiwi.");
  await writeAdminActivity(request.auth!.uid, action);
  return { ok: true };
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
  await writeAdminActivity(
    request.auth!.uid,
    ticketId ? "ticket.updated" : "ticket.created",
    undefined,
    { ticketId: ticketRef.id },
  );
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
