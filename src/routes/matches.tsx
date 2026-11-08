import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { AppShell } from "../components/app-shell";
import { TeamLogo } from "../components/team-logo";
import { listMatches, LIVE_MATCH_STATUSES } from "../lib/firestore";
import { subscribeToAuth } from "../lib/firebase";
export const Route = createFileRoute("/matches")({ component: Matches });
function Matches() {
  const [user, setUser] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [sort, setSort] = useState("popular");
  const [refreshing, setRefreshing] = useState(false);
  const refreshMatches = useCallback(async () => {
    setRefreshing(true);
    try {
      setMatches(await listMatches(100));
    } catch {
      setMatches([]);
    } finally {
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    subscribeToAuth(setUser);
    void refreshMatches();
  }, [refreshMatches]);
  const isLive = (match: any) =>
    LIVE_MATCH_STATUSES.includes(String(match.status ?? "").toUpperCase());
  const ranked = [...matches].sort((a, b) => {
    if (sort === "popular" && isLive(a) !== isLive(b)) return isLive(a) ? -1 : 1;
    if (sort === "league")
      return String(a.leagueName ?? "").localeCompare(String(b.leagueName ?? ""));
    return new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime();
  });
  const liveMatches = matches.filter(isLive);
  const latestUpdatedAt = liveMatches
    .map((m) => m.updatedAt)
    .filter(Boolean)
    .sort(
      (a: any, b: any) =>
        (b?.toMillis?.() ?? new Date(b).getTime()) - (a?.toMillis?.() ?? new Date(a).getTime()),
    )[0];
  const updatedDate =
    latestUpdatedAt?.toDate?.() ?? (latestUpdatedAt ? new Date(latestUpdatedAt) : null);
  return (
    <AppShell user={user}>
      <div className="page narrow">
        <div className="page-title">
          <div>
            <span className="eyebrow">SPORTS DATA</span>
            <h1>Ratiba & results</h1>
            <p>
              Mechi na matokeo kutoka Sports API.
              {updatedDate
                ? ` Live scores updated ${updatedDate.toLocaleTimeString("sw-TZ", { hour: "2-digit", minute: "2-digit" })}.`
                : " Hakuna mechi za live zinazoendelea kwa sasa. Pakia upya ili kuona sasisho la karibuni."}
            </p>
          </div>
          <div className="matches-page-actions">
            <button
              className="match-refresh"
              type="button"
              onClick={() => void refreshMatches()}
              disabled={refreshing}
            >
              <RefreshCw size={15} className={refreshing ? "spin" : ""} />
              {refreshing ? "Inapakia..." : "Pakia live upya"}
            </button>
            <select aria-label="Panga mechi" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="popular">Maarufu / LIVE</option>
              <option value="time">Kwa muda</option>
              <option value="league">Ligi</option>
            </select>
          </div>
        </div>
        <div className="panel">
          <div className="match-list">
            {ranked.length ? (
              ranked.map((m) => (
                <div className="match" key={m.id}>
                  <div>
                    <small>
                      {m.leagueName} • {m.status}
                      {["LIVE", "1H", "HT", "2H", "ET", "P", "INT"].includes(
                        String(m.status).toUpperCase(),
                      )
                        ? " • LIVE"
                        : ""}
                    </small>
                    <b className="team-line">
                      <TeamLogo name={m.homeTeamName} src={m.homeTeamLogo ?? m.teams?.home?.logo} />
                      {m.homeTeamName}
                      <span>vs</span>
                      <TeamLogo name={m.awayTeamName} src={m.awayTeamLogo ?? m.teams?.away?.logo} />
                      {m.awayTeamName}
                    </b>
                  </div>
                  <time>
                    {m.homeScore != null
                      ? m.homeScore + " - " + m.awayScore
                      : new Date(m.kickoffAt).toLocaleString("sw-TZ", {
                          hour: "2-digit",
                          minute: "2-digit",
                          day: "2-digit",
                          month: "short",
                        })}
                  </time>
                </div>
              ))
            ) : (
              <div className="empty">Hakuna mechi zilizosawazishwa bado.</div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
