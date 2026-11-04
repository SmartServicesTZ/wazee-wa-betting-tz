import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT ?? "{}");
if (!serviceAccount.project_id) throw new Error("FIREBASE_SERVICE_ACCOUNT haipo au si JSON sahihi.");
if (!process.env.SPORTS_API_KEY) throw new Error("SPORTS_API_KEY haijawekwa.");

const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);
const apiBase = (process.env.SPORTS_API_BASE_URL ?? "https://v3.football.api-sports.io").replace(/\/$/, "");
const apiKey = process.env.SPORTS_API_KEY;
const maxOddsFixtures = Number(process.env.MAX_ODDS_FIXTURES ?? 6);

async function api(path, params = {}) {
  const url = new URL(`${apiBase}/${path.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { "x-apisports-key": apiKey, Accept: "application/json" } });
  if (!response.ok) throw new Error(`Sports API HTTP ${response.status}`);
  const body = await response.json();
  if (body.errors && Object.keys(body.errors).length) throw new Error(JSON.stringify(body.errors));
  return body.response ?? [];
}

function normalizeFixture(raw) {
  const f = raw.fixture, l = raw.league, t = raw.teams, g = raw.goals, s = raw.score;
  return {
    eventId: String(f.id), leagueId: String(l.id), leagueName: l.name ?? "Unknown",
    homeId: String(t.home.id), awayId: String(t.away.id), homeTeamName: t.home.name,
    awayTeamName: t.away.name, kickoffAt: new Date(f.date).toISOString(), status: f.status.short,
    homeScore: g.home ?? null, awayScore: g.away ?? null,
    halfHomeScore: s.halftime?.home ?? null, halfAwayScore: s.halftime?.away ?? null,
  };
}

function normalizeOdds(response) {
  const markets = [];
  const bets = response?.[0]?.bookmakers?.[0]?.bets ?? [];
  for (const bet of bets) {
    const name = String(bet.name).toLowerCase();
    const options = (bet.values ?? []).map((value) => ({ prediction: String(value.value), odds: Number(value.odd), line: value.handicap ? Number(value.handicap) : null })).filter((value) => Number.isFinite(value.odds));
    let market = null;
    if (name.includes("match winner")) market = "1X2";
    else if (name.includes("double chance")) market = "DOUBLE_CHANCE";
    else if (name.includes("both teams score")) market = "BTTS";
    else if (name.includes("goals over/under")) market = "OVER_UNDER";
    else if (name.includes("draw no bet")) market = "DRAW_NO_BET";
    else if (name.includes("asian handicap") || name.includes("handicap")) market = "HANDICAP";
    if (market && options.length) markets.push({ market, options });
  }
  return markets;
}

async function syncDate(date) {
  const fixtures = await api("fixtures", { date });
  let synced = 0;
  for (const raw of fixtures) {
    const match = normalizeFixture(raw);
    await db.collection("matches").doc(match.eventId).set({ ...match, externalProvider: "api-football", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    synced++;
  }
  for (const raw of fixtures.slice(0, maxOddsFixtures)) {
    const match = normalizeFixture(raw);
    try {
      await db.collection("matches").doc(match.eventId).set({ markets: normalizeOdds(await api("odds", { fixture: match.eventId })), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } catch (error) {
      console.error(`odds ${match.eventId}:`, error.message);
    }
  }
  return synced;
}

function upcoming(match) {
  const kickoff = new Date(String(match.kickoffAt)).getTime();
  return Number.isFinite(kickoff) && kickoff > Date.now() && kickoff < Date.now() + 36 * 60 * 60 * 1000;
}

function chooseOption(match, settings) {
  const preferred = settings.risk === "LOW" ? ["DOUBLE_CHANCE", "DRAW_NO_BET", "OVER_UNDER", "BTTS"] : ["DOUBLE_CHANCE", "1X2", "DRAW_NO_BET", "OVER_UNDER", "BTTS"];
  for (const marketName of preferred) {
    const market = (match.markets ?? []).find((item) => item.market === marketName);
    const option = (market?.options ?? []).map((item) => ({ ...item, odds: Number(item.odds) })).filter((item) => item.odds > 1 && item.odds <= settings.maxOddsPerSelection).sort((a, b) => a.odds - b.odds)[0];
    if (option) return { market: marketName, ...option };
  }
  return null;
}

async function generateTicket() {
  const config = (await db.collection("automation").doc("config").get()).data() ?? {};
  const settings = { enabled: true, maxSelections: 5, maxOddsPerSelection: 1.65, maxTotalOdds: 12, risk: "LOW", ...config };
  if (!settings.enabled) return { created: false, reason: "disabled" };
  const matches = (await db.collection("matches").orderBy("kickoffAt", "asc").limit(80).get()).docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter(upcoming);
  const selections = [];
  for (const match of matches) {
    const option = chooseOption(match, settings);
    if (!option || selections.some((item) => item.matchId === match.id)) continue;
    selections.push({ matchId: match.id, market: option.market, line: option.line ?? null, prediction: option.prediction, odds: option.odds, homeTeam: match.homeTeamName, awayTeam: match.awayTeamName, kickoffAt: match.kickoffAt, leagueName: match.leagueName, status: "PENDING" });
    if (selections.length >= Math.max(2, Math.min(10, Number(settings.maxSelections)))) break;
  }
  const totalOdds = selections.reduce((total, selection) => total * Number(selection.odds), 1);
  if (selections.length < 2 || totalOdds > Number(settings.maxTotalOdds)) return { created: false, reason: "not-enough-qualifying-selections" };
  const windowKey = new Date().toISOString().slice(0, 13);
  const existing = await db.collection("tickets").where("automationWindow", "==", windowKey).limit(1).get();
  if (!existing.empty) return { created: false, reason: "already-created", ticketId: existing.docs[0].id };
  const ticket = db.collection("tickets").doc();
  const batch = db.batch();
  batch.set(ticket, { creatorId: "AUTO_BOT", creatorUsername: "wazee_betting_tz", creatorName: "Wazee wa Betting Tz", creatorPhotoURL: null, title: `Mkeka wa Automatic • ${new Date().toLocaleDateString("sw-TZ")}`, description: "Mkeka huu umetengenezwa na mfumo kwa kutumia odds na ratiba kutoka Sports API. Hakuna uhakika wa ushindi; cheza kwa uwajibikaji.", sport: "Football", risk: settings.risk, visibility: "PUBLIC", access: "FREE", totalOdds: Number(totalOdds.toFixed(2)), status: "PENDING", selectionCount: selections.length, automated: true, automationWindow: windowKey, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  selections.forEach((selection, index) => batch.set(ticket.collection("selections").doc(String(index + 1)), { ...selection, kickoffAt: new Date(selection.kickoffAt), createdAt: FieldValue.serverTimestamp() }));
  await batch.commit();
  return { created: true, ticketId: ticket.id, selections: selections.length, totalOdds: Number(totalOdds.toFixed(2)) };
}

const today = new Date();
const dates = [0, 1].map((offset) => { const date = new Date(today); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10); });
const synced = (await Promise.all(dates.map(syncDate))).reduce((sum, count) => sum + count, 0);
const result = await generateTicket();
await db.collection("api_logs").add({ type: "github-auto-ticket", ok: true, synced, result, createdAt: FieldValue.serverTimestamp() });
console.log(JSON.stringify({ synced, result }));
