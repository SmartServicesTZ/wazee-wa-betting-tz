import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Plus,
  Trash2,
  ShieldCheck,
  ChevronLeft,
  Search,
  ImageDown,
  Share2,
  CalendarDays,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { User } from "firebase/auth";
import { AppShell } from "../components/app-shell";
import { subscribeToAuth } from "../lib/firebase";
import { createTicket, getUserProfile, listUpcomingMatches } from "../lib/firestore";
import { calculateTotalOdds, type MarketKey, type Selection } from "../lib/betting";
import { TeamLogo } from "../components/team-logo";

export const Route = createFileRoute("/create-ticket")({ component: CreateTicket });
const marketLabels: Record<MarketKey, string> = {
  "1X2": "Matokeo (1X2)",
  DOUBLE_CHANCE: "Double Chance",
  OVER_UNDER: "Over / Under",
  BTTS: "Magoli timu zote",
  DRAW_NO_BET: "Draw No Bet",
  HANDICAP: "Handicap",
  HALF_TIME: "Kipindi cha kwanza",
  FULL_TIME: "Full Time",
};

function drawTicketImage(title: string, selections: Selection[], totalOdds: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = Math.max(1350, 430 + selections.length * 112 + 250);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Kifaa hakiwezi kutengeneza picha.");
  const bg = ctx.createLinearGradient(0, 0, 1080, canvas.height);
  bg.addColorStop(0, "#11182b");
  bg.addColorStop(1, "#080d18");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1080, canvas.height);
  ctx.fillStyle = "#a78bfa";
  ctx.fillRect(0, 0, 1080, 18);
  ctx.fillStyle = "#f5f7ff";
  ctx.font = "bold 48px Arial";
  ctx.fillText("WAZEE WA BETTING TZ", 64, 105);
  ctx.fillStyle = "#67e8f9";
  ctx.font = "bold 26px Arial";
  ctx.fillText((title || "MKeka WANGU").toUpperCase().slice(0, 35), 64, 160);
  ctx.fillStyle = "#a2abc6";
  ctx.font = "22px Arial";
  ctx.fillText("MKeka wa jamii • Odds zilizoonyeshwa wakati wa kuchagua", 64, 208);
  let y = 290;
  selections.forEach((s, i) => {
    ctx.fillStyle = "#171f35";
    ctx.beginPath();
    ctx.roundRect(55, y, 970, 88, 18);
    ctx.fill();
    ctx.fillStyle = "#67e8f9";
    ctx.font = "bold 22px Arial";
    ctx.fillText(String(i + 1).padStart(2, "0"), 78, y + 34);
    ctx.fillStyle = "#f5f7ff";
    ctx.font = "bold 25px Arial";
    ctx.fillText((s.homeTeam + " vs " + s.awayTeam).slice(0, 48), 140, y + 35);
    ctx.fillStyle = "#a2abc6";
    ctx.font = "20px Arial";
    ctx.fillText((s.leagueName || "Mechi") + " • " + s.prediction, 140, y + 67);
    ctx.fillStyle = "#d7ff45";
    ctx.font = "bold 25px Arial";
    ctx.textAlign = "right";
    ctx.fillText(Number(s.odds).toFixed(2), 990, y + 51);
    ctx.textAlign = "left";
    y += 108;
  });
  ctx.fillStyle = "#1c2941";
  ctx.beginPath();
  ctx.roundRect(55, y + 12, 970, 145, 20);
  ctx.fill();
  ctx.fillStyle = "#a2abc6";
  ctx.font = "24px Arial";
  ctx.fillText("JUMLA YA ODDS", 85, y + 65);
  ctx.fillStyle = "#d7ff45";
  ctx.font = "bold 62px Arial";
  ctx.fillText(totalOdds.toFixed(2), 85, y + 128);
  ctx.fillStyle = "#a2abc6";
  ctx.font = "19px Arial";
  ctx.fillText("Odds zinaweza kubadilika. Hakikisha kabla ya kuweka dau.", 55, canvas.height - 70);
  ctx.fillStyle = "#67e8f9";
  ctx.font = "bold 20px Arial";
  ctx.fillText("smartservicestz.github.io/wazee-wa-betting-tz", 55, canvas.height - 35);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Picha haikutengenezwa."))),
      "image/png",
    ),
  );
}
function CreateTicket() {
  const nav = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sport, setSport] = useState("Football");
  const [risk, setRisk] = useState<"LOW" | "MEDIUM" | "HIGH">("MEDIUM");
  const [access, setAccess] = useState<"FREE" | "VIP">("FREE");
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");
  const [chosen, setChosen] = useState<Selection[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [league, setLeague] = useState("ALL");
  const [date, setDate] = useState("ALL");
  useEffect(() => subscribeToAuth(setUser), []);
  useEffect(() => {
    listUpcomingMatches(150)
      .then(setMatches)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Mechi hazijapatikana."))
      .finally(() => setLoading(false));
  }, []);
  const totalOdds = useMemo(() => calculateTotalOdds(chosen), [chosen]);
  const leagues = useMemo(
    () => Array.from(new Set(matches.map((m) => String(m.leagueName || "Ligi nyingine")))).sort(),
    [matches],
  );
  const visibleMatches = useMemo(
    () =>
      matches.filter((m) => {
        const text = (m.homeTeamName + " " + m.awayTeamName + " " + m.leagueName).toLowerCase();
        const day = new Date(m.kickoffAt).toISOString().slice(0, 10);
        return (
          text.includes(query.toLowerCase()) &&
          (league === "ALL" || String(m.leagueName || "Ligi nyingine") === league) &&
          (date === "ALL" || day === date)
        );
      }),
    [matches, query, league, date],
  );
  const add = (match: any, market: MarketKey, option: any) => {
    const item: Selection = {
      matchId: match.id,
      market,
      line: option.line ?? null,
      prediction: option.prediction,
      odds: Number(option.odds),
      homeTeam: match.homeTeamName,
      awayTeam: match.awayTeamName,
      homeTeamLogo: match.homeTeamLogo ?? match.teams?.home?.logo ?? null,
      awayTeamLogo: match.awayTeamLogo ?? match.teams?.away?.logo ?? null,
      kickoffAt: match.kickoffAt,
      leagueName: match.leagueName,
    };
    if (!item.odds || item.odds <= 1) {
      toast.error("Odds ya selection hii haipo kwenye Sports API.");
      return;
    }
    setChosen((current) => {
      const sameMarket = current.find(
        (x) => x.matchId === item.matchId && x.market === item.market,
      );
      if (sameMarket?.prediction === item.prediction) return current;
      if (sameMarket) {
        toast.info("Uchaguzi wa soko hili umebadilishwa kwa mechi hiyo.");
        return current.map((x) => (x === sameMarket ? item : x));
      }
      return [...current, item];
    });
  };
  const exportImage = async (share: boolean) => {
    try {
      const blob = await drawTicketImage(title, chosen, totalOdds);
      const file = new File([blob], "wazee-wa-betting-mkeka.png", { type: "image/png" });
      if (share && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Mkeka wangu - Wazee wa Betting TZ" });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "wazee-wa-betting-mkeka.png";
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Picha ya mkeka imehifadhiwa.");
      }
    } catch (e) {
      if (e instanceof Error) toast.error(e.message);
    }
  };
  return (
    <AppShell user={user}>
      <div className="page ticket-builder-page">
        <Link className="back-link" to="/">
          <ChevronLeft size={17} /> Nyumbani
        </Link>
        <div className="page-title">
          <div>
            <span className="eyebrow">TICKET STUDIO</span>
            <h1>Tengeneza mkeka wako</h1>
            <p>
              Tafuta mechi nyingi, chagua masoko na tengeneza picha ya mkeka wako tayari kushiriki.
            </p>
          </div>
          <div className="odds-box">
            <small>Jumla ya odds</small>
            <b>{totalOdds.toFixed(2)}</b>
            <span>{chosen.length} selections</span>
          </div>
        </div>
        {!user && (
          <div className="alert">
            <ShieldCheck size={18} /> Ingia kwanza ili kuhifadhi na kuchapisha mkeka.{" "}
            <Link to="/login">Ingia</Link>
          </div>
        )}
        <div className="builder-grid">
          <section className="panel match-picker">
            <div className="panel-head">
              <div>
                <span className="eyebrow">LIVE MATCH CENTRE</span>
                <h3>1. Chagua mechi</h3>
              </div>
              <span className="match-count">
                {visibleMatches.length} / {matches.length} mechi
              </span>
            </div>
            <div className="match-filters">
              <label className="search">
                <Search size={17} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Tafuta timu au ligi..."
                />
              </label>
              <select value={league} onChange={(e) => setLeague(e.target.value)}>
                <option value="ALL">Ligi zote</option>
                {leagues.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <select value={date} onChange={(e) => setDate(e.target.value)}>
                <option value="ALL">Tarehe zote</option>
                {Array.from(
                  new Set(matches.map((m) => new Date(m.kickoffAt).toISOString().slice(0, 10))),
                )
                  .sort()
                  .map((d) => (
                    <option key={d} value={d}>
                      {new Date(d + "T12:00:00").toLocaleDateString("sw-TZ", {
                        day: "numeric",
                        month: "short",
                      })}
                    </option>
                  ))}
              </select>
            </div>
            {loading ? (
              <div className="empty">Inapakia mechi kutoka Sports API...</div>
            ) : visibleMatches.length === 0 ? (
              <div className="empty">
                <CalendarDays size={28} />
                <b>
                  {matches.length
                    ? "Hakuna mechi zinazolingana na utafutaji."
                    : "Hakuna mechi zilizosawazishwa bado."}
                </b>
                <span>
                  {matches.length
                    ? "Badilisha utafutaji au kichujio."
                    : "Mechi halisi zitaonekana baada ya Sports API kusawazishwa na admin."}
                </span>
              </div>
            ) : (
              <div className="match-builder">
                {visibleMatches.map((match) => (
                  <article className="match-builder-card" key={match.id}>
                    <div className="match-head">
                      <div>
                        <small>
                          {match.leagueName ?? "Ligi nyingine"} • {match.status ?? "SCHEDULED"}
                        </small>
                        <b className="team-line">
                          <TeamLogo
                            name={match.homeTeamName}
                            src={match.homeTeamLogo ?? match.teams?.home?.logo}
                          />
                          {match.homeTeamName}
                          <span>vs</span>
                          <TeamLogo
                            name={match.awayTeamName}
                            src={match.awayTeamLogo ?? match.teams?.away?.logo}
                          />
                          {match.awayTeamName}
                        </b>
                      </div>
                      <time>
                        {new Date(match.kickoffAt).toLocaleString("sw-TZ", {
                          hour: "2-digit",
                          minute: "2-digit",
                          day: "2-digit",
                          month: "short",
                        })}
                      </time>
                    </div>
                    <details className="market-accordion">
                      <summary>Angalia markets ({(match.markets ?? []).length})</summary>
                      <div className="market-grid">
                        {(match.markets ?? []).length === 0 ? (
                          <small className="brand-disclaimer">
                            Odds hazijapatikana kwenye Sports API.
                          </small>
                        ) : (
                          (match.markets ?? []).map((market: any) => (
                            <div className="market" key={market.market}>
                              <small>
                                {marketLabels[market.market as MarketKey] ?? market.market}
                              </small>
                              <div>
                                {(market.options ?? []).map((option: any) => (
                                  <button
                                    className={
                                      chosen.some(
                                        (s) =>
                                          s.matchId === match.id &&
                                          s.market === market.market &&
                                          s.prediction === option.prediction,
                                      )
                                        ? "selected-odd"
                                        : ""
                                    }
                                    key={option.prediction}
                                    onClick={() => add(match, market.market, option)}
                                  >
                                    <span>{option.prediction}</span>
                                    <b>{Number(option.odds).toFixed(2)}</b>
                                    <Plus size={14} />
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </details>
                  </article>
                ))}
              </div>
            )}
          </section>
          <aside className="panel ticket-side">
            <div className="panel-head">
              <div>
                <span className="eyebrow">YOUR BET SLIP</span>
                <h3>2. Mkeka wako</h3>
              </div>
              <span>{chosen.length} mechi</span>
            </div>
            <label>
              Kichwa cha mkeka
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Mfano: Weekend accumulator"
              />
            </label>
            <label>
              Maelezo
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Maelezo mafupi (si lazima)"
              />
            </label>
            <div className="form-grid">
              <label>
                Risk
                <select value={risk} onChange={(e) => setRisk(e.target.value as any)}>
                  <option value="LOW">Ndogo</option>
                  <option value="MEDIUM">Kati</option>
                  <option value="HIGH">Juu</option>
                </select>
              </label>
              <label>
                Aina ya mkeka
                <select value={access} onChange={(e) => setAccess(e.target.value as any)}>
                  <option value="FREE">Bure (FREE)</option>
                  <option value="VIP">VIP</option>
                </select>
                <small className="ticket-access-help">
                  Hii huweka lebo ya mkeka tu. Malipo au kufunga mikeka ya VIP bado hakujawashwa.
                </small>
              </label>
            </div>
            <label>
              Visibility
              <select value={visibility} onChange={(e) => setVisibility(e.target.value as any)}>
                <option value="PUBLIC">Public</option>
                <option value="PRIVATE">Private</option>
              </select>
            </label>
            <div className="selected-list">
              {chosen.length ? (
                chosen.map((item, i) => (
                  <div key={i}>
                    <div>
                      <b>
                        {item.homeTeam} vs {item.awayTeam}
                      </b>
                      <small>
                        {marketLabels[item.market]} • {item.prediction}
                      </small>
                    </div>
                    <strong>{item.odds.toFixed(2)}</strong>
                    <button
                      aria-label="Ondoa selection"
                      onClick={() => setChosen((c) => c.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))
              ) : (
                <div className="empty compact">Chagua mechi na odds upande wa kushoto.</div>
              )}
            </div>
            <div className="ticket-image-actions">
              <button
                className="btn btn-secondary"
                disabled={!chosen.length}
                onClick={() => exportImage(false)}
              >
                <ImageDown size={17} /> Pakua picha
              </button>
              <button
                className="btn btn-secondary"
                disabled={!chosen.length}
                onClick={() => exportImage(true)}
              >
                <Share2 size={17} /> Shiriki picha
              </button>
            </div>
            <button
              className="btn btn-primary full"
              disabled={!user || !title.trim() || chosen.length === 0 || busy}
              onClick={async () => {
                if (!user) return;
                setBusy(true);
                try {
                  const profile = await getUserProfile(user.uid);
                  if (!profile) throw new Error("Profile haijapatikana.");
                  const id = await createTicket({
                    uid: user.uid,
                    username: String(profile.username ?? user.email?.split("@")[0] ?? "user"),
                    displayName: String(profile.displayName ?? user.displayName ?? "User"),
                    photoURL: profile.photoURL ?? user.photoURL ?? undefined,
                    title,
                    description,
                    sport,
                    risk,
                    visibility,
                    access,
                    selections: chosen,
                  });
                  toast.success("Mkeka umechapishwa.");
                  nav({ to: "/tickets/$ticketId", params: { ticketId: id } });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Imeshindikana kuchapisha.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Inachapisha..." : "Chapisha mkeka"}
            </button>
            <small className="fine-print">
              Picha inatengenezwa kutokana na selections zako halisi. Odds zinaweza kubadilika kabla
              ya kuweka dau.
            </small>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
