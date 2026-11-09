import { ChevronRight, RefreshCw, Table2 } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { AppShell } from "../components/app-shell";
import { subscribeToAuth } from "../lib/firebase";
import { listPublicStandings, type PublicStandingsGroup } from "../lib/firestore";

export const Route = createFileRoute("/point-tables")({ component: PointTables });

const providerRegions = [
  ["🌍", "International"],
  ["🏴", "England"],
  ["🇪🇸", "Spain"],
  ["🇩🇪", "Germany"],
  ["🇮🇹", "Italy"],
  ["🇫🇷", "France"],
  ["🇹🇷", "Turkey"],
  ["🇳🇱", "Holland"],
  ["🇧🇪", "Belgium"],
  ["🇵🇹", "Portugal"],
  ["🇷🇺", "Russia"],
  ["🇺🇦", "Ukraine"],
  ["🏴", "Scotland"],
  ["🇮🇪", "Ireland"],
  ["🇬🇷", "Greece"],
  ["🇸🇪", "Sweden"],
  ["🇩🇰", "Denmark"],
  ["🇳🇴", "Norway"],
  ["🇨🇭", "Switzerland"],
  ["🇨🇿", "Czechia"],
  ["🇭🇷", "Croatia"],
  ["🇦🇹", "Austria"],
  ["🇧🇬", "Bulgaria"],
] as const;

function PointTables() {
  const [user, setUser] = useState<User | null>(null);
  const [groups, setGroups] = useState<PublicStandingsGroup[]>([]);
  const [selected, setSelected] = useState<PublicStandingsGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => subscribeToAuth(setUser), []);
  const load = () => {
    setLoading(true);
    setError("");
    listPublicStandings()
      .then((rows) => {
        setGroups(rows);
        setSelected(rows[0] ?? null);
      })
      .catch((reason) => {
        setGroups([]);
        setSelected(null);
        setError(reason instanceof Error ? reason.message : "Standings hazijasomeka.");
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => load(), []);
  const availableCountries = useMemo(() => new Set(groups.map((group) => group.countryName.toLowerCase())), [groups]);
  return (
    <AppShell user={user}>
      <div className="page point-tables-page">
        <div className="page-title">
          <div>
            <span className="eyebrow">SPORTS DATA · API CACHE</span>
            <h1>Point Tables</h1>
            <p>Misimamo kutoka kwa provider wa sports data. Hakuna point inayowekwa kwa kubuni.</p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={16} className={loading ? "spin" : ""} /> Refresh
          </button>
        </div>
        <div className="point-tables-layout">
          <section className="panel country-list-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">COMPETITIONS</span>
                <h3>Nchi na mashirikisho</h3>
              </div>
              <Table2 size={20} />
            </div>
            <div className="country-list">
              {providerRegions.map(([flag, country]) => {
                const group = groups.find((item) => item.countryName.toLowerCase() === country.toLowerCase());
                const active = selected?.countryName.toLowerCase() === country.toLowerCase();
                return (
                  <button
                    type="button"
                    className={`country-row ${active ? "is-selected" : ""}`}
                    key={country}
                    onClick={() => setSelected(group ?? null)}
                  >
                    <span className="country-flag" aria-hidden="true">{flag}</span>
                    <span><b>{country}</b><small>{group?.leagueName ?? (availableCountries.has(country.toLowerCase()) ? "Standings available" : "Waiting for API sync")}</small></span>
                    <ChevronRight size={16} />
                  </button>
                );
              })}
            </div>
          </section>
          <section className="panel standings-panel">
            {loading ? (
              <div className="empty"><Table2 size={28} /><b>Inapakia standings...</b></div>
            ) : error ? (
              <div className="empty"><b>Standings hazijapatikana.</b><span>{error}</span><button type="button" className="btn btn-secondary" onClick={load}>Jaribu tena</button></div>
            ) : selected?.rows.length ? (
              <>
                <div className="panel-head">
                  <div><span className="eyebrow">{selected.countryName}</span><h3>{selected.leagueName ?? "League standings"}</h3></div>
                  <small>{selected.rows.length} teams</small>
                </div>
                <div className="standings-table-wrap">
                  <table className="standings-table">
                    <thead><tr><th>#</th><th>Timu</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>PTS</th></tr></thead>
                    <tbody>{selected.rows.map((row) => <tr key={row.id}><td>{row.rank}</td><td><span className="standing-team">{row.teamLogo ? <img src={row.teamLogo} alt="" /> : null}<b>{row.teamName ?? "Team"}</b></span></td><td>{row.played}</td><td>{row.won}</td><td>{row.drawn}</td><td>{row.lost}</td><td>{row.goalDifference}</td><td><strong>{row.points}</strong></td></tr>)}</tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="empty"><Table2 size={28} /><b>Standings bado hazijasawazishwa.</b><span>Provider hajatoa point tables kwa sasa. Ukurasa huu hautaonyesha point za kubuni.</span></div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
