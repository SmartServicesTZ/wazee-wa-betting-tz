import { createFileRoute, Link } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import type { User } from "firebase/auth";
import { useCallback, useEffect, useState } from "react";
import "./matches-predictions.css";
import { AppShell } from "../components/app-shell";
import { TeamLogo } from "../components/team-logo";
import {
  getAiPredictionSummary,
  listAiPredictions,
  listMatches,
  LIVE_MATCH_STATUSES,
} from "../lib/firestore";
import { subscribeToAuth } from "../lib/firebase";

export const Route = createFileRoute("/matches")({ component: Matches });

type PredictionData = {
  status?: string;
  market?: string;
  prediction?: string;
  line?: number | null;
  odds?: number;
  confidence?: number;
  statsSampleCount?: number;
  actualScore?: string | null;
  reason?: string;
  leagueName?: string;
  kickoffAt?: unknown;
  oddsFetchedAt?: unknown;
  settledAt?: unknown;
  modelVersion?: string;
  resultSource?: string;
};

type MatchRow = {
  id: string;
  status?: string;
  leagueName?: string;
  kickoffAt?: string;
  homeTeamName?: string;
  awayTeamName?: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  homeScore?: number | null;
  awayScore?: number | null;
  updatedAt?: unknown;
  teams?: { home?: { logo?: string }; away?: { logo?: string } };
  aiPrediction?: PredictionData;
};

type PredictionSummary = {
  wonCount?: number;
  lostCount?: number;
  decidedCount?: number;
  accuracyPercent?: number;
};

function dateFrom(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") return new Date(value);
  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === "function") return toDate.call(value) as Date;
  }
  return new Date(Number.NaN);
}

function dateLabel(value: unknown) {
  const date = dateFrom(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("sw-TZ", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function timestampMillis(value: unknown) {
  const date = dateFrom(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function Matches() {
  const [user, setUser] = useState<User | null>(null);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [aiPredictions, setAiPredictions] = useState<MatchRow[]>([]);
  const [predictionSummary, setPredictionSummary] = useState<PredictionSummary>({});
  const [sort, setSort] = useState("popular");
  const [refreshing, setRefreshing] = useState(false);
  const [matchesError, setMatchesError] = useState("");
  const refreshMatches = useCallback(async () => {
    setRefreshing(true);
    setMatchesError("");
    const [matchRows, predictionRows, summary] = await Promise.all([
      listMatches(100).catch((error) => {
        setMatchesError(error instanceof Error ? error.message : "Imeshindikana kusoma mechi kutoka Firebase.");
        return [];
      }),
      listAiPredictions(200).catch(() => []),
      getAiPredictionSummary().catch(() => ({})),
    ]);
    setMatches(matchRows as MatchRow[]);
    setAiPredictions(predictionRows as MatchRow[]);
    setPredictionSummary(summary as PredictionSummary);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    subscribeToAuth(setUser);
    void refreshMatches();
  }, [refreshMatches]);

  const isLive = (match: MatchRow) =>
    LIVE_MATCH_STATUSES.includes(String(match.status ?? "").toUpperCase());
  const ranked = [...matches].sort((a, b) => {
    if (sort === "popular" && isLive(a) !== isLive(b)) return isLive(a) ? -1 : 1;
    if (sort === "league")
      return String(a.leagueName ?? "").localeCompare(String(b.leagueName ?? ""));
    return timestampMillis(a.kickoffAt) - timestampMillis(b.kickoffAt);
  });
  const liveMatches = matches.filter(isLive);
  const latestUpdatedAt = liveMatches
    .map((match) => match.updatedAt)
    .filter(Boolean)
    .sort((a, b) => timestampMillis(b) - timestampMillis(a))[0];
  const updatedDate = latestUpdatedAt ? dateFrom(latestUpdatedAt) : null;
  const upcomingPredictions = aiPredictions
    .filter((match) => match.aiPrediction?.status === "PENDING")
    .sort(
      (a, b) =>
        timestampMillis(a.aiPrediction?.kickoffAt) - timestampMillis(b.aiPrediction?.kickoffAt),
    )
    .slice(0, 10);
  const predictionHistory = aiPredictions
    .filter((match) => match.aiPrediction && match.aiPrediction.status !== "PENDING")
    .sort(
      (a, b) =>
        timestampMillis(b.aiPrediction?.settledAt) - timestampMillis(a.aiPrediction?.settledAt),
    )
    .slice(0, 10);
  const wonCount = Number(predictionSummary.wonCount ?? 0);
  const lostCount = Number(predictionSummary.lostCount ?? 0);
  const decidedCount = Number(predictionSummary.decidedCount ?? wonCount + lostCount);
  const accuracy = decidedCount
    ? `${Number(predictionSummary.accuracyPercent ?? 0).toFixed(1)}%`
    : "—";
  const statusLabel: Record<string, string> = {
    PENDING: "Inasubiri matokeo",
    WON: "Sahihi",
    LOST: "Haikufanikiwa",
    VOID: "Void",
    CANCELLED: "Mechi imefutwa",
  };
  const renderPrediction = (match: MatchRow) => {
    const prediction = match.aiPrediction ?? {};
    return (
      <article className="prediction-card" key={match.id}>
        <div className="prediction-card-head">
          <small>
            {prediction.leagueName || "Football"} · {dateLabel(prediction.kickoffAt)}
          </small>
          <span className={`status status-${String(prediction.status).toLowerCase()}`}>
            {statusLabel[String(prediction.status)] ?? prediction.status}
          </span>
        </div>
        <h3>
          {match.homeTeamName} <span>vs</span> {match.awayTeamName}
        </h3>
        <p className="prediction-market">
          {prediction.market} · {prediction.prediction}
          {prediction.line != null ? ` ${prediction.line}` : ""}
        </p>
        <div className="prediction-values">
          <span>
            Odds <b>{Number(prediction.odds).toFixed(2)}</b>
          </span>
          <span>
            Confidence <b>{Number(prediction.confidence).toFixed(0)}%</b>
          </span>
          <span>
            Sampuli za form <b>{prediction.statsSampleCount ?? 0}</b>
          </span>
          {prediction.actualScore && (
            <span>
              Alama ya mwisho <b>{prediction.actualScore}</b>
            </span>
          )}
        </div>
        <p className="prediction-reason">{prediction.reason}</p>
        <small className="prediction-source">
          Odds na form: Sports API · {dateLabel(prediction.oddsFetchedAt)} ·{" "}
          {prediction.modelVersion}
          {prediction.resultSource ? ` · Matokeo: ${prediction.resultSource}` : ""}
        </small>
      </article>
    );
  };

  return (
    <AppShell user={user}>
      <div className="page narrow">
        <div className="page-title">
          <div>
            <span className="eyebrow">SPORTS DATA</span>
            <h1>Ratiba & results</h1>
            <p>
              Mechi na matokeo kutoka Sports API.
              {updatedDate && !Number.isNaN(updatedDate.getTime())
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

        <section className="panel prediction-section" aria-labelledby="prediction-heading">
          <div className="prediction-heading">
            <div>
              <span className="eyebrow">AI-ASSISTED · API DATA</span>
              <h2 id="prediction-heading">Makadirio na historia</h2>
            </div>
            <div
              className="prediction-accuracy"
              aria-label="Accuracy ya predictions zilizohukumiwa"
            >
              <strong>{accuracy}</strong>
              <small>
                {decidedCount} zimehukumiwa · {wonCount} sahihi · {lostCount} si sahihi
              </small>
            </div>
          </div>
          <p className="prediction-notice">
            Haya ni makadirio ya odds na form ya mechi za karibuni, si uhakikisho wa ushindi. Odds
            huhifadhiwa kutoka Sports API; accuracy huhesabiwa baada ya score rasmi kuthibitishwa.
          </p>
          <h3>Makadirio yajayo</h3>
          {upcomingPredictions.length ? (
            <div className="prediction-grid">{upcomingPredictions.map(renderPrediction)}</div>
          ) : (
            <div className="empty">
              Hakuna prediction iliyothibitishwa kwa sasa; mfumo husubiri odds na form za kutosha.
            </div>
          )}
          <h3>Historia iliyohukumiwa</h3>
          {predictionHistory.length ? (
            <div className="prediction-grid">{predictionHistory.map(renderPrediction)}</div>
          ) : (
            <div className="empty">
              Bado hakuna matokeo ya prediction yaliyohukumiwa na Sports API.
            </div>
          )}
        </section>

        <div className="panel">
          <div className="match-list">
            {ranked.length ? (
              ranked.map((match) => (
                <Link
                  className="match"
                  to="/matches/$matchId"
                  params={{ matchId: String(match.id) }}
                  key={match.id}
                >
                  <div>
                    <small>
                      {match.leagueName} • {match.status}
                      {isLive(match) ? " • LIVE" : ""}
                    </small>
                    <b className="team-line">
                      <TeamLogo
                        name={match.homeTeamName ?? "Home team"}
                        src={match.homeTeamLogo ?? match.teams?.home?.logo}
                      />
                      {match.homeTeamName}
                      <span>vs</span>
                      <TeamLogo
                        name={match.awayTeamName ?? "Away team"}
                        src={match.awayTeamLogo ?? match.teams?.away?.logo}
                      />
                      {match.awayTeamName}
                    </b>
                  </div>
                  <time>
                    {match.homeScore != null
                      ? match.homeScore + " - " + match.awayScore
                      : dateFrom(match.kickoffAt).toLocaleString("sw-TZ", {
                          hour: "2-digit",
                          minute: "2-digit",
                          day: "2-digit",
                          month: "short",
                        })}
                  </time>
                </Link>
              ))
            ) : (
              <div className="empty">{matchesError || "Hakuna mechi zilizosawazishwa bado."}</div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
