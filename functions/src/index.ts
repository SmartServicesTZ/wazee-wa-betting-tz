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
    pending = 0;
  for (const d of snap.docs) {
    const s = d.data().status;
    if (s === "WON") won++;
    else if (s === "LOST") lost++;
    else if (s === "PENDING") pending++;
  }
  const total = won + lost;
  await db
    .collection("users")
    .doc(uid)
    .set(
      {
        ticketCount: snap.size,
        wonCount: won,
        lostCount: lost,
        pendingCount: pending,
        winRate: total ? Number(((won / total) * 100).toFixed(2)) : 0,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  await db
    .collection("publicProfiles")
    .doc(uid)
    .set(
      {
        ticketCount: snap.size,
        wonCount: won,
        lostCount: lost,
        pendingCount: pending,
        winRate: total ? Number(((won / total) * 100).toFixed(2)) : 0,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
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
        await db
          .collection("api_logs")
          .add({
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
      await db
        .collection("api_logs")
        .add({
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
    await db
      .collection("api_logs")
      .add({
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
    await db
      .collection("api_logs")
      .add({
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
