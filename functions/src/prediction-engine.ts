export const MIN_SELECTION_ODDS = 1.4;
export const MAX_SELECTION_ODDS = 1.8;

export type RecentResult = {
  homeGoals: number;
  awayGoals: number;
  venue: "HOME" | "AWAY";
};

export type TeamForm = {
  teamId: string;
  sampleSize: number;
  form: string;
  wins: number;
  draws: number;
  losses: number;
  scoredAverage: number;
  concededAverage: number;
  results: RecentResult[];
};

type MarketOption = { prediction: string; odds: number; line?: number | null };
type Market = { market: string; options: MarketOption[] };
type PredictionMatch = {
  id: string;
  homeTeamName: string;
  awayTeamName: string;
  markets?: Market[];
};

export type PredictionPick = {
  market: string;
  prediction: string;
  line: number | null;
  odds: number;
  confidence: number;
  marketProbability: number;
  formProbability: number;
  statsSampleCount: number;
  reason: string;
  modelVersion: "odds-form-v1";
};

type Outcome = "HOME" | "DRAW" | "AWAY" | "YES" | "NO" | "OVER" | "UNDER";

export function isSelectionOddsEligible(value: unknown): boolean {
  const odds = Number(value);
  return Number.isFinite(odds) && odds >= MIN_SELECTION_ODDS && odds <= MAX_SELECTION_ODDS;
}

function canonicalResult(homeGoals: number, awayGoals: number): Outcome {
  return homeGoals > awayGoals ? "HOME" : homeGoals < awayGoals ? "AWAY" : "DRAW";
}

function parseOutcome(market: string, prediction: string): Outcome[] | null {
  const value = prediction
    .trim()
    .toUpperCase()
    .replace(/[ _-]+/g, "");
  if (market === "1X2" || market === "DRAW_NO_BET") {
    if (["1", "HOME", "H"].includes(value)) return ["HOME"];
    if (["X", "DRAW", "D"].includes(value)) return ["DRAW"];
    if (["2", "AWAY", "A"].includes(value)) return ["AWAY"];
  }
  if (market === "DOUBLE_CHANCE") {
    if (["1X", "HOME/DRAW", "HOMEDRAW"].includes(value)) return ["HOME", "DRAW"];
    if (["X2", "DRAW/AWAY", "DRAWAWAY"].includes(value)) return ["DRAW", "AWAY"];
    if (["12", "HOME/AWAY", "HOMEAWAY"].includes(value)) return ["HOME", "AWAY"];
  }
  if (market === "BTTS") {
    if (["YES", "GG", "BOTHYES"].includes(value)) return ["YES"];
    if (["NO", "NG", "BOTHNO"].includes(value)) return ["NO"];
  }
  if (market === "OVER_UNDER") {
    if (value.startsWith("OVER") || value.startsWith("O")) return ["OVER"];
    if (value.startsWith("UNDER") || value.startsWith("U")) return ["UNDER"];
  }
  return null;
}

function optionLine(option: MarketOption): number | null {
  if (option.line !== null && option.line !== undefined) {
    const explicit = Number(option.line);
    if (Number.isFinite(explicit)) return explicit;
  }
  const match = option.prediction.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function actualMatchesSelection(
  market: string,
  prediction: string,
  line: number | null,
  homeGoals: number,
  awayGoals: number,
): boolean | null {
  const outcomes = parseOutcome(market, prediction);
  if (!outcomes) return null;
  if (market === "1X2" || market === "DOUBLE_CHANCE" || market === "DRAW_NO_BET") {
    const result = canonicalResult(homeGoals, awayGoals);
    if (market === "DRAW_NO_BET" && result === "DRAW") return null;
    return outcomes.includes(result);
  }
  if (market === "BTTS") {
    const result = homeGoals > 0 && awayGoals > 0 ? "YES" : "NO";
    return outcomes.includes(result);
  }
  if (market === "OVER_UNDER") {
    if (line === null) return null;
    const total = homeGoals + awayGoals;
    if (total === line) return null;
    return outcomes.includes(total > line ? "OVER" : "UNDER");
  }
  return null;
}

function impliedProbability(
  markets: Market[],
  targetMarket: string,
  option: MarketOption,
): number | null {
  const targetOutcomes = parseOutcome(targetMarket, option.prediction);
  if (!targetOutcomes) return null;

  // Double-chance probabilities are derived from the mutually exclusive 1X2 prices when available.
  if (targetMarket === "DOUBLE_CHANCE") {
    const oneXTwo = markets.find((item) => item.market === "1X2");
    const outcomes = oneXTwo?.options
      .map((item) => ({ outcomes: parseOutcome("1X2", item.prediction), odds: Number(item.odds) }))
      .filter((item) => item.outcomes?.length === 1 && Number.isFinite(item.odds) && item.odds > 1);
    const hasCompleteResultPrices = ["HOME", "DRAW", "AWAY"].every((outcome) =>
      outcomes?.some((item) => item.outcomes?.includes(outcome as Outcome)),
    );
    if (outcomes?.length && hasCompleteResultPrices) {
      const raw = outcomes.map((item) => 1 / item.odds);
      const total = raw.reduce((sum, value) => sum + value, 0);
      if (total > 0) {
        return outcomes.reduce(
          (sum, item, index) =>
            sum + (targetOutcomes.includes(item.outcomes![0]) ? raw[index] / total : 0),
          0,
        );
      }
    }
    const quoted = 1 / Number(option.odds);
    return Number.isFinite(quoted) ? Math.min(0.95, quoted) : null;
  }

  const market = markets.find((item) => item.market === targetMarket);
  if (!market) return null;
  const targetLine = targetMarket === "OVER_UNDER" ? optionLine(option) : null;
  if (targetMarket === "OVER_UNDER" && targetLine === null) return null;
  const relevantOptions = market.options.filter(
    (item) => targetMarket !== "OVER_UNDER" || optionLine(item) === targetLine,
  );
  const valid = relevantOptions
    .map((item) => ({
      outcomes: parseOutcome(targetMarket, item.prediction),
      odds: Number(item.odds),
    }))
    .filter((item) => item.outcomes?.length && Number.isFinite(item.odds) && item.odds > 1);
  const requiredOutcomes: Outcome[] =
    targetMarket === "1X2"
      ? ["HOME", "DRAW", "AWAY"]
      : targetMarket === "BTTS"
        ? ["YES", "NO"]
        : targetMarket === "OVER_UNDER"
          ? ["OVER", "UNDER"]
          : ["HOME", "AWAY"];
  if (!requiredOutcomes.every((outcome) => valid.some((item) => item.outcomes?.includes(outcome))))
    return null;
  const raw = valid.map((item) => 1 / item.odds);
  const total = raw.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;
  const probability = valid.reduce(
    (sum, item, index) =>
      sum +
      (item.outcomes!.some((value) => targetOutcomes.includes(value)) ? raw[index] / total : 0),
    0,
  );
  return Number.isFinite(probability) ? probability : null;
}

function relevantResults(market: string, home: TeamForm, away: TeamForm): RecentResult[] {
  if (["1X2", "DOUBLE_CHANCE", "DRAW_NO_BET"].includes(market)) {
    return [
      ...home.results.filter((result) => result.venue === "HOME"),
      ...away.results.filter((result) => result.venue === "AWAY"),
    ];
  }
  return [...home.results, ...away.results];
}

function getFormProbability(
  market: string,
  option: MarketOption,
  home: TeamForm,
  away: TeamForm,
): { probability: number; sampleCount: number } | null {
  const line = market === "OVER_UNDER" ? optionLine(option) : null;
  const results = relevantResults(market, home, away);
  let sampleCount = 0;
  let hits = 0;
  for (const result of results) {
    const isHit = actualMatchesSelection(
      market,
      option.prediction,
      line,
      result.homeGoals,
      result.awayGoals,
    );
    if (isHit === null) continue;
    sampleCount++;
    if (isHit) hits++;
  }
  if (!sampleCount) return null;
  return { probability: hits / sampleCount, sampleCount };
}

function formLabel(form: TeamForm): string {
  return form.form || "haijapatikana";
}

export function choosePrediction(
  match: PredictionMatch,
  homeForm: TeamForm | null,
  awayForm: TeamForm | null,
): PredictionPick | null {
  if (!homeForm || !awayForm || homeForm.sampleSize < 3 || awayForm.sampleSize < 3) return null;
  const markets = Array.isArray(match.markets) ? match.markets : [];
  const candidates: PredictionPick[] = [];

  for (const market of markets) {
    if (!["1X2", "DOUBLE_CHANCE", "DRAW_NO_BET", "BTTS", "OVER_UNDER"].includes(market.market))
      continue;
    for (const option of market.options ?? []) {
      const odds = Number(option.odds);
      if (!isSelectionOddsEligible(odds)) continue;
      const marketChance = impliedProbability(markets, market.market, option);
      const formChance = getFormProbability(market.market, option, homeForm, awayForm);
      if (marketChance === null || !formChance || formChance.sampleCount < 4) continue;

      // Shrink small-sample form toward the odds benchmark, then blend with an equal model weight.
      const formWeight = 0.35 * Math.min(1, formChance.sampleCount / 10);
      const confidence = Math.max(
        0.01,
        Math.min(0.99, marketChance * (1 - formWeight) + formChance.probability * formWeight),
      );
      const line = market.market === "OVER_UNDER" ? optionLine(option) : null;
      const probabilityPct = (value: number) => `${Math.round(value * 100)}%`;
      const reason = `Odds za API ${odds.toFixed(2)} (soko ~${probabilityPct(marketChance)}); fomu ya ${match.homeTeamName}: ${formLabel(homeForm)} (${homeForm.sampleSize}), ${match.awayTeamName}: ${formLabel(awayForm)} (${awayForm.sampleSize}); matokeo ya form kwa chaguo hili ${hitsLabel(formChance)}.`;
      candidates.push({
        market: market.market,
        prediction: String(option.prediction),
        line,
        odds,
        confidence: Number((confidence * 100).toFixed(1)),
        marketProbability: Number(marketChance.toFixed(4)),
        formProbability: Number(formChance.probability.toFixed(4)),
        statsSampleCount: formChance.sampleCount,
        reason,
        modelVersion: "odds-form-v1",
      });
    }
  }
  return candidates.sort((a, b) => b.confidence - a.confidence || a.odds - b.odds)[0] ?? null;
}

function hitsLabel(form: { probability: number; sampleCount: number }): string {
  return `${Math.round(form.probability * form.sampleCount)}/${form.sampleCount}`;
}
