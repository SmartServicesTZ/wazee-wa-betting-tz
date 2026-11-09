import { Link } from "@tanstack/react-router";
import type { User } from "firebase/auth";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock3,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "./app-shell";
import { FreeSlipGallery } from "./free-slip-gallery";
import { TeamLogo } from "./team-logo";
import { TicketFeedCard } from "./ticket-feed-card";
import { subscribeToAuth } from "../lib/firebase";
import {
  listCurrentAndUpcomingMatches,
  listPublicTickets,
  type PublicTicket,
} from "../lib/firestore";

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
  homeLogo?: string;
  awayLogo?: string;
  homeScore?: number | string | null;
  awayScore?: number | string | null;
  elapsed?: number | string | null;
  minute?: number | string | null;
  period?: string | null;
  featured?: boolean;
  markets?: MatchMarket[];
};
type DayFilter = "ALL" | "TODAY" | "TOMORROW";

const LIVE_STATUSES = new Set([
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
const MARKETS = [
  ["1X2", "Matokeo"],
  ["OVER_UNDER", "Chini/Juu 2.5"],
  ["DOUBLE_CHANCE", "Double chance"],
  ["BTTS", "Timu zote kufunga"],
  ["HALF_TIME", "Kipindi cha kwanza"],
] as const;

function isLiveMatch(match: Match) {
  return LIVE_STATUSES.has(String(match.status ?? "").toUpperCase());
}

function liveStatusLabel(match: Match) {
  const status = String(match.status ?? "LIVE").toUpperCase();
  const minute = match.elapsed ?? match.minute;
  if (minute !== null && minute !== undefined && String(minute).trim()) return `${minute}'`;
  if (status === "HT") return "Mapumziko";
  if (status === "SUSP") return "Imesimama";
  return "LIVE";
}

function dateKey(date: Date) {
  return date.toLocaleDateString("en-CA", { timeZone: "Africa/Dar_es_Salaam" });
}

function formatKickoff(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Muda haujathibitishwa";
  return date.toLocaleString("sw-TZ", {
    timeZone: "Africa/Dar_es_Salaam",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatClock(value: Date) {
  return value.toLocaleTimeString("sw-TZ", {
    timeZone: "Africa/Dar_es_Salaam",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatOdds(value: number) {
  const odds = Number(value);
  return Number.isFinite(odds) && odds > 0 ? odds.toFixed(2) : "—";
}

function marketFor(match: Match, market: string) {
  return (
    match.markets?.find((item) => item.market === market) ??
    match.markets?.find((item) => item.market === "1X2") ??
    match.markets?.[0]
  );
}

export function Homepage() {
  const [user, setUser] = useState<User | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [tickets, setTickets] = useState<PublicTicket[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [matchesError, setMatchesError] = useState("");
  const [ticketsError, setTicketsError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [dayFilter, setDayFilter] = useState<DayFilter>("ALL");
  const [market, setMarket] = useState<string>("1X2");
  const [sortBy, setSortBy] = useState<"TIME" | "LEAGUE" | "POPULAR">("POPULAR");
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [slipOpen, setSlipOpen] = useState(false);
  const [liveExpanded, setLiveExpanded] = useState(true);
  const [safetyOpen, setSafetyOpen] = useState(false);

  useEffect(() => subscribeToAuth(setUser), []);

  useEffect(() => {
    let active = true;

    const loadMatches = async () => {
      try {
        const rows = await listCurrentAndUpcomingMatches(150);
        if (active) {
          setMatches(rows as Match[]);
          setLastUpdated(new Date());
          setMatchesError("");
        }
      } catch (error) {
        if (active) {
          setMatchesError(error instanceof Error ? error.message : "Mechi hazijaweza kupakiwa.");
        }
      } finally {
        if (active) setMatchesLoading(false);
      }
    };

    const loadTickets = async () => {
      try {
        const rows = await listPublicTickets(6);
        if (active) {
          setTickets(rows);
          setTicketsError("");
        }
      } catch (error) {
        if (active) {
          setTicketsError(error instanceof Error ? error.message : "Mikeka ya jamii haijapakia.");
        }
      } finally {
        if (active) setTicketsLoading(false);
      }
    };

    void loadMatches();
    void loadTickets();
    const interval = window.setInterval(() => void loadMatches(), 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const refreshMatches = async () => {
    setRefreshing(true);
    try {
      const rows = await listCurrentAndUpcomingMatches(150);
      setMatches(rows as Match[]);
      setLastUpdated(new Date());
      setMatchesError("");
    } catch (error) {
      setMatchesError(error instanceof Error ? error.message : "Imeshindikana kusasisha mechi.");
    } finally {
      setRefreshing(false);
    }
  };

  const liveMatches = useMemo(() => matches.filter(isLiveMatch), [matches]);
  const upcomingMatches = useMemo(
    () =>
      matches
        .filter((match) => !isLiveMatch(match) && new Date(match.kickoffAt).getTime() > Date.now())
        .sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime()),
    [matches],
  );
  const spotlightMatch = liveMatches[0] ?? upcomingMatches[0];

  const visibleMatches = useMemo(() => {
    const now = new Date();
    const todayKey = dateKey(now);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = dateKey(tomorrow);
    const term = search.trim().toLowerCase();
    const rows = upcomingMatches.filter((match) => {
      const matchDay = dateKey(new Date(match.kickoffAt));
      const text =
        `${match.homeTeamName} ${match.awayTeamName} ${match.leagueName ?? ""}`.toLowerCase();
      if (dayFilter === "TODAY" && matchDay !== todayKey) return false;
      if (dayFilter === "TOMORROW" && matchDay !== tomorrowKey) return false;
      return !term || text.includes(term);
    });

    if (sortBy === "TIME") {
      rows.sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime());
    } else if (sortBy === "LEAGUE") {
      rows.sort((a, b) => String(a.leagueName ?? "").localeCompare(String(b.leagueName ?? "")));
    } else {
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
  }, [upcomingMatches, dayFilter, search, sortBy]);

  const selections = useMemo(
    () =>
      Object.entries(chosen)
        .map(([key, prediction]) => {
          const [matchId, chosenMarket] = key.split("::");
          const match = matches.find((item) => item.id === matchId);
          const option = match?.markets
            ?.find((item) => item.market === chosenMarket)
            ?.options.find((item) => item.prediction === prediction);
          return match && option && Number.isFinite(Number(option.odds))
            ? { key, match, option, market: chosenMarket }
            : null;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
    [chosen, matches],
  );
  const combinedOdds = selections.reduce((total, item) => total * Number(item.option.odds), 1);

  const toggleSelection = (match: Match, prediction: string) => {
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

  return (
    <AppShell user={user}>
      <div className="home-v2">
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero-grid">
            <div className="home-hero-copy">
              <div className="home-brandline">
                <span className="home-brandmark">W</span>
                <span>Wazee wa Betting TZ</span>
              </div>
              <p className="home-overline">JAMII YA SOKA TANZANIA</p>
              <h1 id="home-title">
                Mechi za leo.
                <br />
                <em>Maoni ya jamii.</em>
              </h1>
              <p className="home-hero-description">
                Fuata ratiba na matokeo halisi, gundua mikeka inayoshirikiwa na jenga chaguo lako
                kwa taarifa.
              </p>
              <div className="home-hero-actions">
                <Link to="/matches" className="home-button home-button-primary">
                  Angalia mechi <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link to="/community" className="home-button home-button-quiet">
                  Tembelea jamii <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </div>

            <article className="home-spotlight">
              <div className="home-spotlight-head">
                <span>
                  {spotlightMatch && isLiveMatch(spotlightMatch)
                    ? "INAENDELEA SASA"
                    : "MECHI INAYOKARIBIA"}
                </span>
                {spotlightMatch && isLiveMatch(spotlightMatch) ? (
                  <b className="home-live-pill">
                    <i /> LIVE
                  </b>
                ) : (
                  <span className="home-spotlight-icon">
                    <Sparkles size={15} aria-hidden="true" />
                  </span>
                )}
              </div>
              {spotlightMatch ? (
                <>
                  <p className="home-spotlight-league">
                    {spotlightMatch.leagueName || "Mashindano"}
                  </p>
                  <div className="home-spotlight-teams">
                    <div className="home-spotlight-team">
                      <TeamLogo
                        name={spotlightMatch.homeTeamName}
                        src={spotlightMatch.homeTeamLogo || spotlightMatch.homeLogo || null}
                      />
                      <b>{spotlightMatch.homeTeamName}</b>
                    </div>
                    <div className="home-spotlight-score">
                      {isLiveMatch(spotlightMatch)
                        ? `${spotlightMatch.homeScore ?? "–"} : ${spotlightMatch.awayScore ?? "–"}`
                        : "VS"}
                    </div>
                    <div className="home-spotlight-team away">
                      <TeamLogo
                        name={spotlightMatch.awayTeamName}
                        src={spotlightMatch.awayTeamLogo || spotlightMatch.awayLogo || null}
                      />
                      <b>{spotlightMatch.awayTeamName}</b>
                    </div>
                  </div>
                  <div className="home-spotlight-foot">
                    <span>
                      <Clock3 size={14} aria-hidden="true" />
                      {isLiveMatch(spotlightMatch)
                        ? liveStatusLabel(spotlightMatch)
                        : formatKickoff(spotlightMatch.kickoffAt)}
                    </span>
                    <Link to="/matches">
                      Ratiba <ArrowUpRight size={14} aria-hidden="true" />
                    </Link>
                  </div>
                </>
              ) : (
                <div className="home-spotlight-empty">
                  <Trophy size={24} aria-hidden="true" />
                  <b>Ratiba mpya zitaonekana hapa.</b>
                  <span>Tunaonyesha taarifa zilizopatikana kutoka kwenye mfumo.</span>
                </div>
              )}
            </article>
          </div>
          <div className="home-hero-stats" aria-label="Muhtasari wa sasa">
            <div>
              <span>MECHI LIVE</span>
              <b>{liveMatches.length.toString().padStart(2, "0")}</b>
            </div>
            <div>
              <span>MECHI ZIJAZO</span>
              <b>{upcomingMatches.length.toString().padStart(2, "0")}</b>
            </div>
            <div>
              <span>MIKEKA MIPYA</span>
              <b>{tickets.length.toString().padStart(2, "0")}</b>
            </div>
            <p>Hakuna matokeo au takwimu za kubuni.</p>
          </div>
        </section>

        <div className="home-editorial-grid">
          <section className="home-live-panel" aria-labelledby="home-live-heading">
            <div className="home-section-head home-live-head">
              <div>
                <span className="home-kicker">
                  <Radio size={14} aria-hidden="true" /> LIVE CENTRE
                </span>
                <h2 id="home-live-heading">Matokeo ya moja kwa moja</h2>
                <p>Scores husasishwa kutoka kwenye data ya mechi.</p>
              </div>
              <button
                type="button"
                className="home-refresh"
                onClick={() => void refreshMatches()}
                disabled={refreshing}
                aria-label="Sasisha matokeo ya moja kwa moja"
              >
                <RefreshCw size={15} className={refreshing ? "home-spin" : ""} aria-hidden="true" />
                {refreshing ? "Inasasisha" : "Sasisha"}
              </button>
            </div>
            <div className="home-live-meta">
              <span>
                <i className="home-live-dot" /> {liveMatches.length} mechi live
              </span>
              <span>
                {lastUpdated ? `Imesasishwa ${formatClock(lastUpdated)}` : "Inatafuta updates…"}
              </span>
              <button
                type="button"
                onClick={() => setLiveExpanded((value) => !value)}
                aria-expanded={liveExpanded}
              >
                {liveExpanded ? "Funga" : "Fungua"}
                {liveExpanded ? (
                  <ChevronUp size={15} aria-hidden="true" />
                ) : (
                  <ChevronDown size={15} aria-hidden="true" />
                )}
              </button>
            </div>
            {liveExpanded &&
              (matchesLoading ? (
                <div className="home-live-empty" role="status">
                  Inapakia scores…
                </div>
              ) : liveMatches.length ? (
                <div className="home-live-list">
                  {liveMatches.slice(0, 3).map((match) => (
                    <article className="home-live-match" key={match.id}>
                      <div className="home-live-match-top">
                        <span>{match.leagueName || "Mashindano"}</span>
                        <b>
                          <i className="home-live-dot" /> {liveStatusLabel(match)}
                        </b>
                      </div>
                      <div className="home-live-teams">
                        <div>
                          <TeamLogo
                            name={match.homeTeamName}
                            src={match.homeTeamLogo || match.homeLogo || null}
                          />
                          <b>{match.homeTeamName}</b>
                        </div>
                        <span className="home-live-score" aria-label="Alama ya mechi">
                          {match.homeScore ?? "–"}
                          <i>:</i>
                          {match.awayScore ?? "–"}
                        </span>
                        <div className="away">
                          <TeamLogo
                            name={match.awayTeamName}
                            src={match.awayTeamLogo || match.awayLogo || null}
                          />
                          <b>{match.awayTeamName}</b>
                        </div>
                      </div>
                      <div className="home-live-period">
                        {match.period || "Taarifa za moja kwa moja"}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="home-live-empty">
                  <Radio size={22} aria-hidden="true" />
                  <b>Hakuna mechi live kwa sasa.</b>
                  <span>Mechi zitaonekana hapa zikianza.</span>
                  {matchesError && <small>{matchesError}</small>}
                </div>
              ))}
            <div className="home-live-bottom">
              <Link to="/matches">
                Ona mechi zote <ArrowRight size={14} aria-hidden="true" />
              </Link>
              <span>Refresh ya kiotomatiki kila sekunde 30</span>
            </div>
          </section>

          <section className="home-community-panel" aria-labelledby="home-community-heading">
            <div className="home-section-head">
              <div>
                <span className="home-kicker">SAUTI ZA JAMII</span>
                <h2 id="home-community-heading">Mikeka mipya</h2>
                <p>Chunguza chaguo zilizoshirikiwa na wanajamii.</p>
              </div>
              <Link to="/community" className="home-icon-link" aria-label="Fungua jamii">
                <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
            </div>
            {ticketsLoading ? (
              <div className="home-community-empty" role="status">
                Inapakia mikeka ya jamii…
              </div>
            ) : ticketsError ? (
              <div className="home-community-empty">{ticketsError}</div>
            ) : tickets.length ? (
              <div className="home-community-feed">
                {tickets.slice(0, 3).map((ticket) => (
                  <TicketFeedCard key={ticket.id} ticket={ticket} currentUser={user} compact />
                ))}
              </div>
            ) : (
              <div className="home-community-empty">
                <span className="home-community-mark" aria-hidden="true">
                  W
                </span>
                <b>Hakuna mikeka ya umma kwa sasa.</b>
                <Link to="/create-ticket">Anza kwa kushiriki wako</Link>
              </div>
            )}
            <Link to="/community" className="home-community-more">
              Nenda kwenye jamii <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </section>
        </div>

        <section className="home-fixtures" aria-labelledby="home-fixtures-heading">
          <div className="home-section-head home-fixtures-head">
            <div>
              <span className="home-kicker">
                <CalendarDays size={14} aria-hidden="true" /> RATIBA YA MECHI
              </span>
              <h2 id="home-fixtures-heading">Chagua mechi kwa taarifa</h2>
              <p>Angalia muda na masoko yaliyopatikana. Odds zinaweza kubadilika.</p>
            </div>
            <Link to="/matches" className="home-outline-link">
              Ratiba nzima <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </div>

          <div className="home-fixture-toolbar">
            <div className="home-day-tabs" role="tablist" aria-label="Chuja ratiba kwa siku">
              {(
                [
                  ["ALL", "Zote"],
                  ["TODAY", "Leo"],
                  ["TOMORROW", "Kesho"],
                ] as const
              ).map(([value, label]) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={dayFilter === value}
                  className={dayFilter === value ? "active" : ""}
                  key={value}
                  onClick={() => setDayFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="home-search">
              <Search size={16} aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tafuta timu au ligi…"
                aria-label="Tafuta timu au ligi"
              />
            </label>
            <label className="home-sort">
              <span>Panga</span>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as "TIME" | "LEAGUE" | "POPULAR")}
                aria-label="Panga mechi"
              >
                <option value="POPULAR">Zinazopendekezwa</option>
                <option value="TIME">Kwa muda</option>
                <option value="LEAGUE">Kwa ligi</option>
              </select>
            </label>
          </div>

          <div className="home-market-tabs" role="tablist" aria-label="Chagua aina ya soko">
            {MARKETS.map(([value, label]) => (
              <button
                type="button"
                role="tab"
                aria-selected={market === value}
                className={market === value ? "active" : ""}
                key={value}
                onClick={() => setMarket(value)}
              >
                {label}
              </button>
            ))}
          </div>

          {matchesLoading ? (
            <div className="home-fixture-empty" role="status">
              Inapakia ratiba…
            </div>
          ) : matchesError && !matches.length ? (
            <div className="home-fixture-empty home-fixture-error">
              <b>Ratiba haijapakia.</b>
              <span>{matchesError}</span>
              <button type="button" onClick={() => void refreshMatches()}>
                Jaribu tena
              </button>
            </div>
          ) : visibleMatches.length ? (
            <div className="home-match-grid">
              {visibleMatches.slice(0, 8).map((match) => {
                const selected = marketFor(match, market);
                const options = selected?.options ?? [];
                return (
                  <article className="home-match-card" key={match.id}>
                    <div className="home-match-card-head">
                      <span>{match.leagueName || "Mashindano"}</span>
                      <span>
                        <Clock3 size={13} aria-hidden="true" /> {formatKickoff(match.kickoffAt)}
                      </span>
                    </div>
                    <div className="home-match-teams">
                      <div>
                        <TeamLogo
                          name={match.homeTeamName}
                          src={match.homeTeamLogo || match.homeLogo || null}
                        />
                        <b>{match.homeTeamName}</b>
                      </div>
                      <span>VS</span>
                      <div className="away">
                        <TeamLogo
                          name={match.awayTeamName}
                          src={match.awayTeamLogo || match.awayLogo || null}
                        />
                        <b>{match.awayTeamName}</b>
                      </div>
                    </div>
                    {options.length ? (
                      <div className="home-match-odds">
                        {options.slice(0, 3).map((option, index) => {
                          const label =
                            market === "1X2"
                              ? (["1", "X", "2"][index] ?? option.prediction)
                              : option.prediction;
                          const key = `${match.id}::${market}`;
                          const active = chosen[key] === option.prediction;
                          return (
                            <button
                              type="button"
                              key={option.prediction}
                              className={active ? "selected" : ""}
                              aria-pressed={active}
                              onClick={() => toggleSelection(match, option.prediction)}
                            >
                              <span>{label}</span>
                              <b>{formatOdds(option.odds)}</b>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="home-no-odds">Odds za soko hili hazijapatikana.</div>
                    )}
                    <div className="home-match-card-foot">
                      <span>{match.markets?.length ?? 0} masoko</span>
                      <Link to="/create-ticket">
                        Ongeza kwenye mkeka <ArrowRight size={13} aria-hidden="true" />
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="home-fixture-empty">
              <CalendarDays size={23} aria-hidden="true" />
              <b>
                {search
                  ? "Hakuna mechi zinazolingana na utafutaji."
                  : "Hakuna mechi kwenye kichujio hiki."}
              </b>
              <span>Jaribu siku nyingine au futa utafutaji.</span>
            </div>
          )}
          {visibleMatches.length > 8 && (
            <div className="home-more-fixtures">
              <span>
                Mechi {Math.min(8, visibleMatches.length)} kati ya {visibleMatches.length}
              </span>
              <Link to="/matches">
                Fungua ratiba yote <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          )}
        </section>

        <FreeSlipGallery />

        <section className="home-testimonials" aria-labelledby="home-testimonials-heading">
          <div className="home-testimonials-mark" aria-hidden="true">
            “
          </div>
          <div>
            <span className="home-kicker">SAUTI YA JAMII</span>
            <h2 id="home-testimonials-heading">Ushuhuda wa wanajamii</h2>
            <p>
              Tunachapisha maoni kwa ruhusa pekee na hatutoi madai ya ushindi wa uhakika. Kwa sasa,
              hakuna ushuhuda uliothibitishwa wa kuchapisha.
            </p>
            <a
              href="https://wa.me/255698232313?text=Habari%2C%20ningependa%20kutoa%20maoni%20kuhusu%20Wazee%20wa%20Betting%20TZ.%20Ninaruhusu%20maoni%20yangu%20kuchapishwa%3A%20ndiyo%2Fhapana."
              target="_blank"
              rel="noopener noreferrer"
              className="home-testimonials-link"
            >
              Toa maoni kwa hiari yako <ArrowUpRight size={15} aria-hidden="true" />
            </a>
            <small>Usitume taarifa binafsi au za akaunti kwenye ushuhuda wa umma.</small>
          </div>
        </section>

        <section className="home-responsible-note" aria-labelledby="home-responsible-heading">
          <span className="home-responsible-icon">
            <ShieldCheck size={19} aria-hidden="true" />
          </span>
          <div className="home-responsible-copy">
            <b id="home-responsible-heading">Chagua kwa taarifa. Cheza kwa uwajibikaji.</b>
            <p>
              Mikeka ni utabiri tu, si dhamana ya ushindi. Coins za tovuti ni za majaribio; hakuna
              kuweka au kutoa pesa halisi.
            </p>
            <div id="home-responsible-tips" hidden={!safetyOpen}>
              <ul>
                <li>Weka muda wa kutumia tovuti na pumzika mara kwa mara.</li>
                <li>Usikopeshe wala kutumia fedha za mahitaji muhimu kwa kubashiri.</li>
                <li>
                  Ukihisi betting inakuletea msongo, simama na tafuta msaada kutoka kwa mtu
                  unayemwamini.
                </li>
              </ul>
            </div>
          </div>
          <button
            type="button"
            className="home-safety-toggle"
            aria-expanded={safetyOpen}
            aria-controls="home-responsible-tips"
            onClick={() => setSafetyOpen((open) => !open)}
          >
            {safetyOpen ? "Funga vidokezo" : "Vidokezo"}
          </button>
          <Link to="/terms" className="home-safety-link">
            Mwongozo <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </section>

        {selections.length > 0 && (
          <>
            <button
              type="button"
              className="home-slip-fab"
              onClick={() => setSlipOpen(true)}
              aria-label={`Fungua mkeka wenye chaguo ${selections.length}`}
            >
              <span>Mkeka wangu</span>
              <b>{selections.length}</b>
              <ArrowUpRight size={16} aria-hidden="true" />
            </button>
            {slipOpen && (
              <>
                <div className="home-slip-backdrop" aria-hidden="true" />
                <aside
                  className="home-slip-panel"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="home-slip-title"
                >
                  <div className="home-slip-head">
                    <div>
                      <span className="home-kicker">CHAGUO ZAKO</span>
                      <h2 id="home-slip-title">
                        Mkeka wako <small>({selections.length})</small>
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSlipOpen(false)}
                      aria-label="Funga mkeka"
                    >
                      <X size={20} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="home-slip-list">
                    {selections.map((item) => (
                      <article key={item.key} className="home-slip-item">
                        <div>
                          <b>
                            {item.match.homeTeamName} — {item.match.awayTeamName}
                          </b>
                          <span>
                            {item.option.prediction} · {formatOdds(item.option.odds)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setChosen((current) => {
                              const next = { ...current };
                              delete next[item.key];
                              return next;
                            })
                          }
                          aria-label="Ondoa chaguo"
                        >
                          <X size={15} aria-hidden="true" />
                        </button>
                      </article>
                    ))}
                  </div>
                  <div className="home-slip-total">
                    <span>Odds jumla (makadirio)</span>
                    <b>{combinedOdds.toFixed(2)}</b>
                  </div>
                  <p>Chaguo hizi ni za kupanga tu; hazitoi au kupokea pesa.</p>
                  <Link to="/create-ticket" className="home-button home-button-primary">
                    Endelea kutengeneza mkeka <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                </aside>
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
