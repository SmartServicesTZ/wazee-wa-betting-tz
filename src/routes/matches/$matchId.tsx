import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, ArrowLeft, CircleAlert, ShieldCheck, Swords } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../components/app-shell";
import { TeamLogo } from "../../components/team-logo";
import { subscribeToAuth } from "../../lib/firebase";
import { getMatch, type MatchRecord, type MatchStatistic } from "../../lib/firestore";

export const Route = createFileRoute("/matches/$matchId")({ component: MatchDetails });
const LIVE_STATUSES = new Set(["LIVE", "IN_PLAY", "1H", "HT", "2H", "ET", "BT", "P", "INT", "SUSP"]);

function valueFor(statistics: MatchStatistic[], teamName: string, label: string) {
  const team = statistics.find((item) => item.team?.name === teamName);
  const row = team?.statistics?.find((item) => String(item.type).toLowerCase() === label.toLowerCase());
  return row?.value ?? "—";
}

function MatchDetails() {
  const { matchId } = Route.useParams();
  const [user, setUser] = useState<any>(null);
  const [match, setMatch] = useState<MatchRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => subscribeToAuth(setUser), []);
  useEffect(() => {
    let active = true;
    const load = () => {
      setLoading(true);
      return getMatch(matchId)
      .then((value) => {
        if (!active) return;
        setMatch(value);
        if (!value) setError("Mechi haijapatikana.");
      })
      .catch(() => active && setError("Taarifa za mechi hazijapatikana kwa sasa."))
      .finally(() => active && setLoading(false));
    };
    void load();
    const refresh = window.setInterval(() => void load(), 60_000);
    return () => {
      active = false;
      window.clearInterval(refresh);
    };
  }, [matchId]);
  const live = LIVE_STATUSES.has(String(match?.status ?? "").toUpperCase());
  const statistics = match?.statistics ?? [];
  const events = useMemo(() => match?.events ?? [], [match?.events]);
  const statusLabel = live ? "LIVE" : String(match?.status ?? "");
  return (
    <AppShell user={user}>
      <div className="page narrow match-details-page">
        <Link className="back-link" to="/matches"><ArrowLeft size={16} /> Rudi kwenye mechi</Link>
        {loading ? <div className="panel empty">Inapakia taarifa za mechi...</div> : error ? <div className="panel empty"><CircleAlert size={24} /><b>{error}</b></div> : match ? (
          <>
            <section className="panel match-hero-detail">
              <div className="match-detail-league"><span>{match.leagueName ?? "Football"}</span><b className={live ? "live-pill" : "status-pill"}>{statusLabel || "SCHEDULED"}</b></div>
              <div className="match-detail-teams">
                <div><TeamLogo name={match.homeTeamName ?? "Home"} src={match.homeTeamLogo} /><strong>{match.homeTeamName}</strong></div>
                <div className="match-detail-score"><small>{live ? "LIVE" : new Date(match.kickoffAt).toLocaleString("sw-TZ", { dateStyle: "medium", timeStyle: "short" })}</small><b>{match.homeScore ?? "—"} <span>-</span> {match.awayScore ?? "—"}</b>{match.halfHomeScore != null && <small>HT {match.halfHomeScore} - {match.halfAwayScore}</small>}</div>
                <div><TeamLogo name={match.awayTeamName ?? "Away"} src={match.awayTeamLogo} /><strong>{match.awayTeamName}</strong></div>
              </div>
              <p className="fine-print">Taarifa zinaonyeshwa kutoka kwenye data iliyothibitishwa ya Sports API. Kipengele kisipoonekana, provider bado hajatoa data hiyo.</p>
            </section>
            <section className="panel"><div className="panel-head"><h2><Activity size={19} /> Maendeleo ya mechi</h2><span>{events.length} events</span></div>{events.length ? <div className="match-events">{events.map((event, index) => <div className="match-event" key={`${event.time?.elapsed}-${event.player?.name}-${index}`}><b>{event.time?.elapsed ?? "—"}'</b><span>{event.type === "Card" ? "🟨/🟥" : event.type === "subst" ? "↔" : "⚽"}</span><div><strong>{event.player?.name ?? event.detail ?? event.type ?? "Event"}</strong><small>{event.team?.name ?? ""}{event.assist?.name ? ` · assist ${event.assist.name}` : ""}</small></div></div>)}</div> : <div className="empty compact">Hakuna events zilizotolewa bado.</div>}</section>
            <section className="panel"><div className="panel-head"><h2><Swords size={19} /> Mashambulizi na statistics</h2></div>{statistics.length ? <div className="match-stat-table">{["Ball Possession", "Total Shots", "Shots on Goal", "Corner Kicks", "Offsides", "Fouls", "Yellow Cards", "Red Cards"].map((label) => <div className="match-stat-row" key={label}><b>{valueFor(statistics, match.homeTeamName ?? "", label)}</b><span>{label}</span><b>{valueFor(statistics, match.awayTeamName ?? "", label)}</b></div>)}</div> : <div className="empty compact">Statistics za mashambulizi, possession na cards hazijapatikana bado.</div>}</section>
            <section className="panel"><div className="panel-head"><h2><ShieldCheck size={19} /> Clean sheet na hali ya ulinzi</h2></div><div className="predictor-stats-grid"><div className="predictor-stat"><small>{match.homeTeamName} clean sheet</small><strong>{match.awayScore === 0 ? "YES" : match.awayScore == null ? "—" : "NO"}</strong></div><div className="predictor-stat"><small>{match.awayTeamName} clean sheet</small><strong>{match.homeScore === 0 ? "YES" : match.homeScore == null ? "—" : "NO"}</strong></div><div className="predictor-stat"><small>Cards</small><strong>{statistics.length ? `${valueFor(statistics, match.homeTeamName ?? "", "Yellow Cards")} / ${valueFor(statistics, match.awayTeamName ?? "", "Yellow Cards")}` : "—"}</strong></div><div className="predictor-stat"><small>Updated</small><strong>{match.updatedAt && typeof match.updatedAt === "object" && "toDate" in match.updatedAt ? (match.updatedAt as { toDate: () => Date }).toDate().toLocaleTimeString("sw-TZ", { hour: "2-digit", minute: "2-digit" }) : "—"}</strong></div></div></section>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
