import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "../components/app-shell";
import { TeamLogo } from "../components/team-logo";
import { listMatches } from "../lib/firestore";
import { subscribeToAuth } from "../lib/firebase";
export const Route = createFileRoute("/matches")({ component: Matches });
function Matches() {
  const [user, setUser] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [sort, setSort] = useState("popular");
  useEffect(() => {
    subscribeToAuth(setUser);
    listMatches(100)
      .then(setMatches)
      .catch(() => setMatches([]));
  }, []);
  const ranked = [...matches].sort((a, b) => {
    const live = (m: any) =>
      ["LIVE", "1H", "HT", "2H", "ET", "P", "INT"].includes(String(m.status).toUpperCase());
    if (sort === "popular" && live(a) !== live(b)) return live(a) ? -1 : 1;
    if (sort === "league")
      return String(a.leagueName ?? "").localeCompare(String(b.leagueName ?? ""));
    return new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime();
  });
  return (
    <AppShell user={user}>
      <div className="page narrow">
        <div className="page-title">
          <div>
            <span className="eyebrow">SPORTS DATA</span>
            <h1>Ratiba & results</h1>
            <p>Mechi na matokeo kutoka Sports API.</p>
          </div>
          <select aria-label="Panga mechi" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="popular">Maarufu / LIVE</option>
            <option value="time">Kwa muda</option>
            <option value="league">Ligi</option>
          </select>
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
