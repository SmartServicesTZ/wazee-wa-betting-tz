export type PredictionSettlementStatus = "PENDING" | "WON" | "LOST" | "VOID";

export type PredictionSelection = {
  market: string;
  prediction: string;
  line?: number | string | null;
};

export type OfficialMatchScore = {
  homeScore: number | null | undefined;
  awayScore: number | null | undefined;
  halfHomeScore?: number | null;
  halfAwayScore?: number | null;
};

/**
 * Settle a supported football market against the score supplied by the caller.
 * Callers must verify that the score is final and comes from the official sports API.
 */
export function evaluatePredictionOutcome(
  selection: Partial<PredictionSelection>,
  match: Partial<OfficialMatchScore>,
): PredictionSettlementStatus {
  const isHalfTime = selection.market === "HALF_TIME";
  const homeScore = isHalfTime ? match.halfHomeScore : match.homeScore;
  const awayScore = isHalfTime ? match.halfAwayScore : match.awayScore;
  if (
    typeof homeScore !== "number" ||
    typeof awayScore !== "number" ||
    !Number.isFinite(homeScore) ||
    !Number.isFinite(awayScore)
  ) {
    return "PENDING";
  }

  const prediction = String(selection.prediction)
    .toUpperCase()
    .replace(/[\s_-]+/g, "");
  const market = selection.market;
  if (market === "1X2" || market === "HALF_TIME") {
    const result = homeScore > awayScore ? "HOME" : homeScore < awayScore ? "AWAY" : "DRAW";
    const selected = ["HOME", "1"].includes(prediction)
      ? "HOME"
      : ["AWAY", "2"].includes(prediction)
        ? "AWAY"
        : ["DRAW", "X"].includes(prediction)
          ? "DRAW"
          : null;
    return selected ? (selected === result ? "WON" : "LOST") : "PENDING";
  }

  if (market === "BTTS") {
    if (!["YES", "GG", "NO", "NG"].includes(prediction)) return "PENDING";
    const bothScored = homeScore > 0 && awayScore > 0;
    const selectedYes = prediction === "YES" || prediction === "GG";
    return bothScored === selectedYes ? "WON" : "LOST";
  }

  if (market === "DOUBLE_CHANCE") {
    const result = homeScore > awayScore ? "1" : homeScore < awayScore ? "2" : "X";
    const selected = ["1X", "X2", "12"].find((value) => prediction === value);
    if (!selected) return "PENDING";
    const won =
      (selected === "1X" && result !== "2") ||
      (selected === "X2" && result !== "1") ||
      (selected === "12" && result !== "X");
    return won ? "WON" : "LOST";
  }

  if (market === "OVER_UNDER") {
    const line = Number(selection.line);
    if (!Number.isFinite(line)) return "PENDING";
    const total = homeScore + awayScore;
    if (total === line) return "VOID";
    if (prediction.startsWith("OVER") || prediction === "O") return total > line ? "WON" : "LOST";
    if (prediction.startsWith("UNDER") || prediction === "U") return total < line ? "WON" : "LOST";
    return "PENDING";
  }

  if (market === "DRAW_NO_BET") {
    if (!["HOME", "1", "AWAY", "2"].includes(prediction)) return "PENDING";
    if (homeScore === awayScore) return "VOID";
    const selectedHome = prediction === "HOME" || prediction === "1";
    return (selectedHome && homeScore > awayScore) || (!selectedHome && awayScore > homeScore)
      ? "WON"
      : "LOST";
  }

  if (market === "HANDICAP") {
    const line = Number(selection.line);
    if (!Number.isFinite(line) || !["HOME", "1", "AWAY", "2"].includes(prediction))
      return "PENDING";
    const selectedHome = prediction === "HOME" || prediction === "1";
    const selectedScore = (selectedHome ? homeScore : awayScore) + line;
    const otherScore = selectedHome ? awayScore : homeScore;
    if (selectedScore === otherScore) return "VOID";
    return selectedScore > otherScore ? "WON" : "LOST";
  }

  return "PENDING";
}

export type PredictionStatusCounts = {
  wonCount?: number;
  lostCount?: number;
  voidCount?: number;
  cancelledCount?: number;
  pendingCount?: number;
};

/** Accuracy is computed only from predictions that were graded WON or LOST. */
export function calculatePredictionAccuracy(counts: PredictionStatusCounts) {
  const wins = Number.isFinite(counts.wonCount) ? Math.max(0, Math.floor(counts.wonCount!)) : 0;
  const losses = Number.isFinite(counts.lostCount) ? Math.max(0, Math.floor(counts.lostCount!)) : 0;
  const decidedCount = wins + losses;
  return {
    decidedCount,
    accuracyPercent: decidedCount ? Number(((wins / decidedCount) * 100).toFixed(2)) : 0,
  };
}
