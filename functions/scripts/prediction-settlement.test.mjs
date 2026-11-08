import test from "node:test";
import assert from "node:assert/strict";
import settlement from "../lib/prediction-settlement.js";

const { evaluatePredictionOutcome, calculatePredictionAccuracy } = settlement;
const score = (homeScore, awayScore, extra = {}) => ({ homeScore, awayScore, ...extra });
const pick = (market, prediction, line) => ({ market, prediction, line });

test("settles 1X2 and double-chance picks against the official full-time score", () => {
  const finalScore = score(2, 1);
  assert.equal(evaluatePredictionOutcome(pick("1X2", "Home"), finalScore), "WON");
  assert.equal(evaluatePredictionOutcome(pick("1X2", "DRAW"), finalScore), "LOST");
  assert.equal(evaluatePredictionOutcome(pick("DOUBLE_CHANCE", "1X"), finalScore), "WON");
  assert.equal(evaluatePredictionOutcome(pick("DOUBLE_CHANCE", "X2"), finalScore), "LOST");
});

test("settles BTTS and half-time picks using their corresponding score fields", () => {
  const finalScore = score(1, 2, { halfHomeScore: 1, halfAwayScore: 0 });
  assert.equal(evaluatePredictionOutcome(pick("BTTS", "YES"), finalScore), "WON");
  assert.equal(evaluatePredictionOutcome(pick("BTTS", "NO"), finalScore), "LOST");
  assert.equal(evaluatePredictionOutcome(pick("HALF_TIME", "HOME"), finalScore), "WON");
  assert.equal(evaluatePredictionOutcome(pick("HALF_TIME", "AWAY"), finalScore), "LOST");
});

test("treats total-goals pushes and draw-no-bet draws as void", () => {
  const finalScore = score(1, 1);
  assert.equal(evaluatePredictionOutcome(pick("OVER_UNDER", "Over 2.0", 2), finalScore), "VOID");
  assert.equal(evaluatePredictionOutcome(pick("DRAW_NO_BET", "HOME"), finalScore), "VOID");
});

test("settles over/under and handicap outcomes, including handicap pushes", () => {
  assert.equal(evaluatePredictionOutcome(pick("OVER_UNDER", "Over 2.5", 2.5), score(2, 1)), "WON");
  assert.equal(
    evaluatePredictionOutcome(pick("OVER_UNDER", "Under 2.5", 2.5), score(2, 1)),
    "LOST",
  );
  assert.equal(evaluatePredictionOutcome(pick("HANDICAP", "HOME", -1), score(2, 1)), "VOID");
  assert.equal(evaluatePredictionOutcome(pick("HANDICAP", "AWAY", 0), score(2, 1)), "LOST");
});

test("does not grade missing scores, unsupported markets, or unsupported outcomes", () => {
  assert.equal(evaluatePredictionOutcome(pick("1X2", "HOME"), score(null, null)), "PENDING");
  assert.equal(evaluatePredictionOutcome(pick("1X2", "UNKNOWN"), score(1, 0)), "PENDING");
  assert.equal(evaluatePredictionOutcome(pick("TENNIS", "HOME"), score(1, 0)), "PENDING");
});

test("accuracy uses only decided WON/LOST counts, excluding pending, void and cancelled picks", () => {
  assert.deepEqual(
    calculatePredictionAccuracy({
      wonCount: 3,
      lostCount: 1,
      voidCount: 2,
      cancelledCount: 4,
      pendingCount: 5,
    }),
    {
      decidedCount: 4,
      accuracyPercent: 75,
    },
  );
});

test("accuracy is zero with no decided outcomes and clamps invalid counts", () => {
  assert.deepEqual(calculatePredictionAccuracy({ wonCount: 0, lostCount: 0 }), {
    decidedCount: 0,
    accuracyPercent: 0,
  });
  assert.deepEqual(calculatePredictionAccuracy({ wonCount: -3, lostCount: Number.NaN }), {
    decidedCount: 0,
    accuracyPercent: 0,
  });
});
