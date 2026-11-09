import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, ChevronUp, Search, Trophy } from "lucide-react";
import type { User } from "firebase/auth";
import { AppShell } from "../components/app-shell";
import { TicketFeedCard } from "../components/ticket-feed-card";
import { TeamLogo } from "../components/team-logo";
import { FreeSlipGallery } from "../components/free-slip-gallery";
import {
  listCurrentAndUpcomingMatches,
  listPublicTickets,
  type PublicTicket,
} from "../lib/firestore";
import { subscribeToAuth } from "../lib/firebase";

export const Route = createFileRoute("/")({ component: Home });

type MarketOption = { prediction: string; odds: number };
type MatchMarket = { market: string; options: MarketOption[] };
type Match = {
  id: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoffAt: string;
  status?: string;
  leagueName?: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  homeScore?: number | null;
  awayScore?: number | null;
  updatedAt?: unknown;
  homeLogo?: string;
  awayLogo?: string;
  markets?: MatchMarket[];
  featured?: boolean;
};

const LIVE_MATCH_STATUSES = new Set([
  "LIVE",
  "IN_PLAY",
  "1H",
  "HT",
  "2H",
  "ET",
  "BT",
  "P",
  "INT",
  "SUSP",
]);
const MARKET_TABS = [
  ["1X2", "1X2"],
  ["OVER_UNDER", "Chini/Juu 2.5"],
  ["DOUBLE_CHANCE", "Double Chance"],
  ["BTTS", "Timu zote kufunga"],
  ["HALF_TIME", "Kipindi cha kwanza"],
] as const;

function TeamBadge({ name, src }: { name: string; src?: string }) {
  return <TeamLogo name={name} src={src} className="gsb-team-badge" />;
}
function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [tickets, setTickets] = useState<PublicTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"LIVE" | "UPCOMING">("UPCOMING");
  const [day, setDay] = useState("ALL");
  const [sort, setSort] = useState("POPULAR");
  const [market, setMarket] = useState("1X2");
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [highlightsOpen, setHighlightsOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [slipOpen, setSlipOpen] = useState(false);

  useEffect(() => subscribeToAuth(setUser), []);

  useEffect(() => {
    let active = true;
    listCurrentAndUpcomingMatches(150)
      .then((rows) => {
        if (active) setMatches(rows as Match[]);
      })
      .catch((reason) => {
        if (active)
          setError(reason instanceof Error ? reason.message : "Imeshindikana kupakia mechi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    listPublicTickets(6)
      .then((rows) => {
        if (active) setTickets(rows);
      })
      .catch(() => {
        if (active) setTickets([]);
      })
      .finally(() => {
        if (active) setTicketsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const visible = useMemo(() => {
    const now = new Date();
    const rows = matches.filter((match) => {
      const text =
        `${match.homeTeamName} ${match.awayTeamName} ${match.leagueName ?? ""}`.toLowerCase();
      const date = new Date(match.kickoffAt);
      const sameDay = date.toDateString() === now.toDateString();
      const status = String(match.status ?? "").toUpperCase();
      const isLive = LIVE_MATCH_STATUSES.has(status);

      if (tab === "LIVE" && !isLive) return false;
      if (tab === "UPCOMING" && (isLive || date.getTime() <= now.getTime())) return false;
      if (day === "TODAY" && !sameDay) return false;
      if (day === "TOMORROW") {
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        if (date.toDateString() !== tomorrow.toDateString()) return false;
      }
      return text.includes(query.toLowerCase().trim());
    });

    if (sort === "TIME")
      rows.sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime());
    if (sort === "LEAGUE")
      rows.sort((a, b) => String(a.leagueName ?? "").localeCompare(String(b.leagueName ?? "")));
    if (sort === "POPULAR") {
      const priority = (name = "") =>
        /champions league|premier league|la liga|serie a|bundesliga|europa league|afcon|world cup/i.test(
          name,
        )
          ? 1
          : 0;
      rows.sort(
        (a, b) =>
          Number(Boolean(b.featured)) - Number(Boolean(a.featured)) ||
          priority(b.leagueName) - priority(a.leagueName) ||
          new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime(),
      );
    }
    return rows;
  }, [matches, tab, day, sort, query]);

  const selections = useMemo(
    () =>
      Object.entries(chosen)
        .map(([key, prediction]) => {
          const [matchId, selectedMarket] = key.split("::");
          const match = matches.find((item) => item.id === matchId);
          const option = match?.markets
            ?.find((item) => item.market === selectedMarket)
            ?.options.find((item) => item.prediction === prediction);
          return match && option ? { match, option, key } : null;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
    [chosen, matches],
  );

  const toggle = (match: Match, prediction: string) => {
    setChosen((current) => {
      const key = `${match.id}::${market}`;
      if (current[key] === prediction) {
        const next = { ...current };
        delete next[key];
        return next;
      }
      return { ...current, [key]: prediction };
    });
  };

  const getMarket = (match: Match) =>
    match.markets?.find((item) => item.market === market) ??
    match.markets?.find((item) => item.market === "1X2") ??
    match.markets?.find((item) => item.market === "FULL_TIME");
  const formatTime = (date: string) =>
    new Date(date).toLocaleTimeString("sw-TZ", { hour: "2-digit", minute: "2-digit" });

  return (
    <AppShell user={user}>
      <div className="gsb-page">
        <section className="gsb-feature-strip" aria-label="Mechi zilizo karibu">
          <div className="gsb-feature-title">
            <span>W</span>
            <b>{tab === "LIVE" ? "MECHI ZA LIVE" : "MECHI ZINAZOKARIBIA"}</b>
          </div>
          {visible.slice(0, 4).map((match) => {
            const selectedMarket = getMarket(match);
            return (
              <article className="gsb-feature-card" key={match.id}>
                <small>
                  {match.leagueName || "Football"} · {formatTime(match.kickoffAt)}
                </small>
                <div className="gsb-feature-teams">
                  <div>
                    <TeamBadge
                      name={match.homeTeamName}
                      src={match.homeTeamLogo || match.homeLogo}
                    />
                    <b>{match.homeTeamName}</b>
                  </div>
                  <i>VS</i>
                  <div>
                    <TeamBadge
                      name={match.awayTeamName}
                      src={match.awayTeamLogo || match.awayLogo}
                    />
                    <b>{match.awayTeamName}</b>
                  </div>
                </div>
                <div className="gsb-feature-odds">
                  {(selectedMarket?.options ?? []).slice(0, 3).map((option) => (
                    <span key={option.prediction}>
                      {option.prediction}
                      <b>{Number(option.odds).toFixed(2)}</b>
                    </span>
                  ))}
                </div>
              </article>
            );
          })}
          {!loading && visible.length === 0 && (
            <div className="gsb-feature-empty">
              {tab === "LIVE"
                ? "Hakuna mechi zinazoendelea sasa."
                : "Hakuna mechi zijazo kwenye kichujio hiki."}
            </div>
          )}
        </section>

        <section className="gsb-home-community" aria-labelledby="community-heading">
          <div className="gsb-home-community-head">
            <div>
              <span className="gsb-section-label">JAMII YA WAZEE</span>
              <h2 id="community-heading">Mikeka mipya</h2>
            </div>
            <Link to="/community">Tazama yote</Link>
          </div>
          {ticketsLoading ? (
            <div className="gsb-community-empty">Inapakia mikeka ya jamii...</div>
          ) : tickets.length ? (
            <div className="gsb-home-ticket-list">
              {tickets.map((ticket) => (
                <TicketFeedCard key={ticket.id} ticket={ticket} currentUser={user} compact />
              ))}
            </div>
          ) : (
            <div className="gsb-community-empty">
              Bado hakuna mikeka ya umma. <Link to="/create-ticket">Chapisha mkeka wa kwanza</Link>
            </div>
          )}
        </section>

        <FreeSlipGallery />
        <div className="gsb-main-tabs" role="tablist" aria-label="Chagua aina ya mechi">
          {(
            [
              ["LIVE", "Live"],
              ["UPCOMING", "Zijazo"],
            ] as const
          ).map(([value, label]) => (
            <button
              className={tab === value ? "active" : ""}
              key={value}
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="gsb-filter-row">
          <select
            value={day}
            onChange={(event) => setDay(event.target.value)}
            aria-label="Chuja kwa tarehe"
          >
            <option value="ALL">Tarehe zote</option>
            <option value="TODAY">Leo</option>
            <option value="TOMORROW">Kesho</option>
          </select>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            aria-label="Panga mechi"
          >
            <option value="POPULAR">Maarufu</option>
            <option value="TIME">Kwa muda</option>
            <option value="LEAGUE">Kwa ligi</option>
          </select>
          <Link className="gsb-create-link" to="/create-ticket">
            Tengeneza mkeka
          </Link>
          <button onClick={() => setSearchOpen((value) => !value)} aria-label="Fungua utafutaji">
            <Search size={17} />
          </button>
        </div>
        {searchOpen && (
          <label className="gsb-search">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tafuta timu au mashindano..."
            />
          </label>
        )}

        <div className="gsb-market-tabs" role="tablist" aria-label="Aina ya odds">
          {MARKET_TABS.map(([value, label]) => (
            <button
              key={value}
              className={market === value ? "active" : ""}
              role="tab"
              aria-selected={market === value}
              onClick={() => setMarket(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <button className="gsb-highlights" onClick={() => setHighlightsOpen((value) => !value)}>
          <span>{tab === "LIVE" ? "Mechi zinazoendelea" : "Mechi zijazo"}</span>
          {highlightsOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {highlightsOpen && (
          <div className="gsb-match-list">
            {loading ? (
              <div className="gsb-empty">Inapakia mechi...</div>
            ) : error ? (
              <div className="gsb-empty">
                {error}
                <button onClick={() => window.location.reload()}>Jaribu tena</button>
              </div>
            ) : visible.length === 0 ? (
              <div className="gsb-empty">
                <Trophy size={28} />
                <b>
                  {tab === "LIVE"
                    ? "Hakuna mechi za Live sasa."
                    : "Hakuna mechi zijazo kwa kichujio hiki."}
                </b>
                <span>Badilisha tarehe au utafute timu nyingine.</span>
              </div>
            ) : (
              visible.map((match) => {
                const selectedMarket = match.markets?.find((item) => item.market === market);
                const options = selectedMarket?.options ?? [];
                return (
                  <article className="gsb-match-row" key={match.id}>
                    <div className="gsb-league-line">
                      <span>{match.leagueName || "Mashindano"}</span>
                      <small>
                        {LIVE_MATCH_STATUSES.has(String(match.status ?? "").toUpperCase())
                          ? "LIVE"
                          : formatTime(match.kickoffAt)}
                      </small>
                    </div>
                    <div className="gsb-match-content">
                      <div className="gsb-team-names">
                        <div>
                          <TeamBadge
                            name={match.homeTeamName}
                            src={match.homeTeamLogo || match.homeLogo}
                          />
                          <b>{match.homeTeamName}</b>
                        </div>
                        <div>
                          <TeamBadge
                            name={match.awayTeamName}
                            src={match.awayTeamLogo || match.awayLogo}
                          />
                          <b>{match.awayTeamName}</b>
                        </div>
                        <small>
                          {new Date(match.kickoffAt).toLocaleDateString("sw-TZ", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}{" "}
                          · {formatTime(match.kickoffAt)}
                        </small>
                      </div>
                      {LIVE_MATCH_STATUSES.has(String(match.status ?? "").toUpperCase()) &&
                        match.homeScore != null &&
                        match.awayScore != null && (
                          <div className="gsb-live-score" aria-label="Alama ya moja kwa moja">
                            LIVE{" "}
                            <strong>
                              {match.homeScore} - {match.awayScore}
                            </strong>
                          </div>
                        )}
                      <div className="gsb-odds-area">
                        {options.length ? (
                          options.slice(0, 3).map((option, index) => {
                            const label =
                              market === "1X2"
                                ? (["1", "X", "2"][index] ?? option.prediction)
                                : option.prediction;
                            const key = `${match.id}::${market}`;
                            const selected = chosen[key] === option.prediction;
                            return (
                              <button
                                key={option.prediction}
                                className={selected ? "selected" : ""}
                                onClick={() => toggle(match, option.prediction)}
                              >
                                <small>{label}</small>
                                <b>{Number(option.odds).toFixed(2)}</b>
                              </button>
                            );
                          })
                        ) : (
                          <span className="gsb-no-odds">Odds hazijapatikana</span>
                        )}
                        <Link to="/create-ticket" className="gsb-more-odds">
                          +{Math.max(0, (match.markets?.length ?? 0) - 1)} markets
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        )}

        <div className="gsb-bottom-spacer" />
        <button
          className={`gsb-slip-fab${slipOpen ? " open" : ""}`}
          onClick={() => setSlipOpen((value) => !value)}
        >
          Mkeka <b>{selections.length}</b>
        </button>
        {slipOpen && (
          <aside className="gsb-slip-panel">
            <div className="gsb-slip-head">
              <b>Mkeka ({selections.length})</b>
              <button onClick={() => setSlipOpen(false)} aria-label="Funga mkeka">
                ×
              </button>
            </div>
            {selections.length ? (
              selections.map((selection) => (
                <div className="gsb-slip-item" key={selection.key}>
                  <b>
                    {selection.match.homeTeamName} - {selection.match.awayTeamName}
                  </b>
                  <span>
                    {selection.option.prediction} · {Number(selection.option.odds).toFixed(2)}
                  </span>
                  <button
                    onClick={() =>
                      setChosen((current) => {
                        const next = { ...current };
                        delete next[selection.key];
                        return next;
                      })
                    }
                  >
                    Ondoa
                  </button>
                </div>
              ))
            ) : (
              <p>Chagua odds kwenye mechi ili kuongeza kwenye mkeka.</p>
            )}
            <Link className="gsb-slip-create" to="/create-ticket">
              Tengeneza mkeka
            </Link>
          </aside>
        )}
      </div>
    </AppShell>
  );
}
