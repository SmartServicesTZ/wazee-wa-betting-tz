import test from "node:test";
import assert from "node:assert/strict";
import engine from "../lib/prediction-engine.js";

const { choosePrediction, isSelectionOddsEligible } = engine;

function teamForm(teamId, venue, outcomes) {
  const results = outcomes.map((result) => {
    if (venue === "HOME") {
      return result === "W"
        ? { venue, homeGoals: 3, awayGoals: 0 }
        : result === "D"
          ? { venue, homeGoals: 2, awayGoals: 2 }
          : { venue, homeGoals: 0, awayGoals: 3 };
    }
    return result === "W"
      ? { venue, homeGoals: 0, awayGoals: 3 }
      : result === "D"
        ? { venue, homeGoals: 2, awayGoals: 2 }
        : { venue, homeGoals: 3, awayGoals: 0 };
  });
  return {
    teamId,
    sampleSize: results.length,
    form: outcomes.join("-"),
    wins: outcomes.filter((item) => item === "W").length,
    draws: outcomes.filter((item) => item === "D").length,
    losses: outcomes.filter((item) => item === "L").length,
    scoredAverage: 1.2,
    concededAverage: 0.8,
    results,
  };
}

const matchup = (markets) => ({
  id: "fixture-123",
  homeTeamName: "Dar City",
  awayTeamName: "Coast United",
  markets,
});
const strongHomeForm = teamForm("home", "HOME", ["W", "W", "W", "W", "D"]);
const weakAwayForm = teamForm("away", "AWAY", ["L", "L", "L", "L", "D"]);
const oneXTwo = (homeOdds = 1.6) => [
  {
    market: "1X2",
    options: [
      { prediction: "Home", odds: homeOdds },
      { prediction: "Draw", odds: 3.8 },
      { prediction: "Away", odds: 5.2 },
    ],
  },
];

test("combines the actual quoted odds with recent home and away form", () => {
  const pick = choosePrediction(matchup(oneXTwo()), strongHomeForm, weakAwayForm);
  assert.ok(pick);
  assert.equal(pick.market, "1X2");
  assert.equal(pick.prediction, "Home");
  assert.equal(pick.odds, 1.6);
  assert.equal(pick.modelVersion, "odds-form-v1");
  assert.equal(pick.statsSampleCount, 10);
  assert.ok(pick.confidence > 50 && pick.confidence < 100);
  assert.match(pick.reason, /Odds za API 1\.60/);
  assert.match(pick.reason, /fomu ya Dar City/);
});

test("accepts the inclusive 1.40 and 1.80 boundaries only", () => {
  assert.equal(isSelectionOddsEligible(1.4), true);
  assert.equal(isSelectionOddsEligible(1.8), true);
  assert.equal(isSelectionOddsEligible(1.399), false);
  assert.equal(isSelectionOddsEligible(1.801), false);
  assert.equal(isSelectionOddsEligible("not odds"), false);
});

test("does not return a prediction if the API quote is outside the allowed band", () => {
  const markets = [
    {
      market: "1X2",
      options: [
        { prediction: "Home", odds: 1.39 },
        { prediction: "Draw", odds: 3.8 },
        { prediction: "Away", odds: 1.81 },
      ],
    },
  ];
  assert.equal(choosePrediction(matchup(markets), strongHomeForm, weakAwayForm), null);
});

test("does not produce confidence when one team's real recent form is insufficient", () => {
  const insufficient = teamForm("new-team", "AWAY", ["W", "L"]);
  assert.equal(choosePrediction(matchup(oneXTwo()), strongHomeForm, insufficient), null);
  assert.equal(choosePrediction(matchup(oneXTwo()), null, weakAwayForm), null);
});

test("only offers result outcomes that can be scored against completed fixtures", () => {
  const markets = [
    {
      market: "OVER_UNDER",
      options: [
        { prediction: "Over 2.5", odds: 1.7, line: 2.5 },
        { prediction: "Under 2.5", odds: 2.1, line: 2.5 },
      ],
    },
  ];
  const pick = choosePrediction(matchup(markets), strongHomeForm, weakAwayForm);
  assert.ok(pick);
  assert.equal(pick.market, "OVER_UNDER");
  assert.equal(pick.line, 2.5);
  assert.ok(pick.odds >= 1.4 && pick.odds <= 1.8);
});

test("calculates totals probability from the over/under pair at the same line only", () => {
  const markets = [
    {
      market: "OVER_UNDER",
      options: [
        { prediction: "Over 1.5", odds: 1.8, line: 1.5 },
        { prediction: "Under 1.5", odds: 2.2, line: 1.5 },
        { prediction: "Over 2.5", odds: 2, line: 2.5 },
        { prediction: "Under 2.5", odds: 1.8, line: 2.5 },
      ],
    },
  ];
  const pick = choosePrediction(matchup(markets), strongHomeForm, weakAwayForm);
  assert.ok(pick);
  assert.equal(pick.prediction, "Over 1.5");
  assert.equal(pick.marketProbability, 0.55);
});
