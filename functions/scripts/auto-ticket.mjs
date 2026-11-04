import { createHash } from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT ?? "{}");
if (!serviceAccount.project_id) throw new Error("FIREBASE_SERVICE_ACCOUNT haipo au si JSON sahihi.");
if (!process.env.SPORTS_API_KEY) throw new Error("SPORTS_API_KEY haijawekwa.");

const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);
const apiBase = (process.env.SPORTS_API_BASE_URL ?? "https://v3.football.api-sports.io").replace(/\/$/, "");
const apiKey = process.env.SPORTS_API_KEY;
const oddsCacheMs = 6 * 60 * 60 * 1000;
const futureWindowMs = 36 * 60 * 60 * 1000;
const maxOddsFixtures = Math.max(1, Math.min(3, Number(process.env.MAX_ODDS_FIXTURES ?? 3)));
const maxApiRetries = 2;

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
    const response = await fetch(url, { headers: { "x-apisports-key": apiKey, Accept: "application/json" } });
    if (response.ok) {
      const body = await response.json();
      if (body.errors && Object.keys(body.errors).length) throw new Error(JSON.stringify(body.errors));
      return body.response ?? [];
    }
    if (response.status !== 429 || attempt === maxApiRetries) {
      throw new Error(`Sports API HTTP ${response.status}`);
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2500 * (attempt + 1);
    console.warn(`Sports API 429 for ${path}; retry ${attempt + 1}/${maxApiRetries} after ${delayMs}ms`);
    await sleep(delayMs);
  }
  throw new Error("Sports API request failed after retries.");
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

function isUpcoming(match, now = Date.now()) {
  const kickoff = new Date(String(match.kickoffAt)).getTime();
  return Number.isFinite(kickoff) && kickoff > now && kickoff < now + futureWindowMs;
}

function normalizeOdds(response) {
  const markets = [];
  const bets = response?.[0]?.bookmakers?.[0]?.bets ?? [];
  for (const bet of bets) {
    const name = String(bet.name).toLowerCase();
    const options = (bet.values ?? []).map((value) => ({ prediction: String(value.value), odds: Number(value.odd), line: value.handicap ? Number(value.handicap) : null })).filter((value) => Number.isFinite(value.odds) && value.odds > 1);
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

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  const millis = new Date(value).getTime();
  return Number.isFinite(millis) ? millis : 0;
}

function hasFreshOdds(match) {
  return Array.isArray(match.markets) && match.markets.length > 0 && timestampMillis(match.oddsFetchedAt) >= Date.now() - oddsCacheMs;
}

async function syncDate(date) {
  const fixtures = await api("fixtures", { date });
  const futureFixtures = fixtures.map(normalizeFixture).filter(isUpcoming).sort((a, b) => new Date(a.kickoffAt) - new Date(b.kickoffAt));
  for (const match of futureFixtures) {
    await db.collection("matches").doc(match.eventId).set({ ...match, externalProvider: "api-football", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  let oddsFetched = 0;
  for (const match of futureFixtures.slice(0, maxOddsFixtures)) {
    const ref = db.collection("matches").doc(match.eventId);
    const existing = await ref.get();
    const existingData = existing.data() ?? {};
    if (hasFreshOdds(existingData)) continue;
    try {
      const markets = normalizeOdds(await api("odds", { fixture: match.eventId }));
      await ref.set({ markets, oddsFetchedAt: FieldValue.serverTimestamp(), oddsSource: "api-football", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      oddsFetched++;
    } catch (error) {
      await writeLog({ type: "odds-fetch", ok: false, matchId: match.eventId, kickoffAt: match.kickoffAt, error: String(error) });
      console.error(`odds ${match.eventId}:`, error.message);
    }
  }
  return { synced: futureFixtures.length, oddsFetched };
}

function chooseOption(match, settings) {
  const preferred = settings.risk === "LOW" ? ["DOUBLE_CHANCE", "DRAW_NO_BET", "OVER_UNDER", "BTTS"] : ["DOUBLE_CHANCE", "1X2", "DRAW_NO_BET", "OVER_UNDER", "BTTS"];
  for (const marketName of preferred) {
    const market = (match.markets ?? []).find((item) => item.market === marketName);
    const option = (market?.options ?? []).map((item) => ({ ...item, odds: Number(item.odds) })).filter((item) => item.odds > 1 && item.odds <= Number(settings.maxOddsPerSelection)).sort((a, b) => a.odds - b.odds)[0];
    if (option) return { market: marketName, ...option };
  }
  return null;
}

async function generateTicket() {
  const config = (await db.collection("automation").doc("config").get()).data() ?? {};
  const settings = { enabled: true, maxSelections: 5, maxOddsPerSelection: 1.65, maxTotalOdds: 12, risk: "LOW", ...config };
  if (!settings.enabled) return { created: false, reason: "disabled" };
  const matches = (await db.collection("matches").orderBy("kickoffAt", "asc").limit(80).get()).docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((match) => isUpcoming(match) && hasFreshOdds(match));
  const selections = [];
  for (const match of matches) {
    const option = chooseOption(match, settings);
    if (!option || selections.some((item) => item.matchId === match.id)) continue;
    selections.push({ matchId: match.id, market: option.market, line: option.line ?? null, prediction: option.prediction, odds: option.odds, homeTeam: match.homeTeamName, awayTeam: match.awayTeamName, kickoffAt: match.kickoffAt, leagueName: match.leagueName, status: "PENDING" });
    if (selections.length >= Math.max(2, Math.min(10, Number(settings.maxSelections)))) break;
  }
  const totalOdds = selections.reduce((total, selection) => total * Number(selection.odds), 1);
  if (selections.length < 2 || totalOdds > Number(settings.maxTotalOdds)) return { created: false, reason: "not-enough-qualifying-selections", qualifyingSelections: selections.length };
  const fingerprint = createHash("sha256").update(selections.map((item) => `${item.matchId}:${item.market}:${item.prediction}:${item.odds}`).sort().join("|"), "utf8").digest("hex");
  const duplicate = await db.collection("tickets").where("automationFingerprint", "==", fingerprint).limit(1).get();
  if (!duplicate.empty) return { created: false, reason: "duplicate-fingerprint", ticketId: duplicate.docs[0].id };
  const windowKey = new Date().toISOString().slice(0, 13);
  const sameWindow = await db.collection("tickets").where("automationWindow", "==", windowKey).limit(1).get();
  if (!sameWindow.empty) return { created: false, reason: "already-created-this-window", ticketId: sameWindow.docs[0].id };
  const ticket = db.collection("tickets").doc();
  const batch = db.batch();
  batch.set(ticket, { creatorId: "AUTO_BOT", creatorUsername: "wazee_betting_tz", creatorName: "Wazee wa Betting Tz", creatorPhotoURL: null, title: `Mkeka wa Automatic • ${new Date().toLocaleDateString("sw-TZ")}`, description: "Mkeka huu umetengenezwa na mfumo kwa kutumia odds zilizothibitishwa kutoka Sports API. Hakuna uhakika wa ushindi; cheza kwa uwajibikaji.", sport: "Football", risk: settings.risk, visibility: "PUBLIC", access: "FREE", totalOdds: Number(totalOdds.toFixed(2)), status: "PENDING", selectionCount: selections.length, automated: true, automationWindow: windowKey, automationFingerprint: fingerprint, oddsVerifiedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  selections.forEach((selection, index) => batch.set(ticket.collection("selections").doc(String(index + 1)), { ...selection, kickoffAt: new Date(selection.kickoffAt), createdAt: FieldValue.serverTimestamp() }));
  await batch.commit();
  return { created: true, ticketId: ticket.id, selections: selections.length, totalOdds: Number(totalOdds.toFixed(2)), fingerprint };
}

async function main() {
  const today = new Date();
  const dates = [0, 1].map((offset) => { const date = new Date(today); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10); });
  const syncResults = [];
  for (const date of dates) syncResults.push({ date, ...(await syncDate(date)) });
  const result = await generateTicket();
  await writeLog({ type: "github-auto-ticket", ok: true, syncResults, result, quotaPolicy: { maxOddsFixtures, oddsCacheHours: 6, maxApiRetries } });
  console.log(JSON.stringify({ syncResults, result }));
}

try {
  await main();
} catch (error) {
  await writeLog({ type: "github-auto-ticket", ok: false, error: String(error), quotaPolicy: { maxOddsFixtures, oddsCacheHours: 6, maxApiRetries } });
  console.error(error);
  process.exitCode = 1;
}
