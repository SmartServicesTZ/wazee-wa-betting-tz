import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTO_TARGETS,
  isEligibleSelectionOdds,
  selectTargetCombination,
} from "./auto-ticket-targets.mjs";

const candidate = (id, odds) => ({ match: { id }, odds });

test("defines only the three daily free-ticket target bands", () => {
  assert.deepEqual(
    AUTO_TARGETS.map(({ target }) => target),
    [3, 5, 10],
  );
});

test("accepts only each-selection odds from 1.35 through 1.60", () => {
  for (const odds of [1.35, 1.45, 1.6]) assert.equal(isEligibleSelectionOdds(odds), true);
  for (const odds of [1.34, 1.61, 4, NaN, Infinity])
    assert.equal(isEligibleSelectionOdds(odds), false);
});

test("never includes an out-of-range selection even if the caller supplies it", () => {
  const candidates = [
    candidate("too-low", 1.34),
    candidate("valid-a", 1.5),
    candidate("valid-b", 1.5),
    candidate("too-high", 1.61),
  ];
  const picks = selectTargetCombination(candidates, { min: 2.2, max: 2.3 }, 2, 2);
  assert.deepEqual(
    picks?.map((item) => item.match.id),
    ["valid-a", "valid-b"],
  );
  assert.ok(picks?.every((item) => item.odds >= 1.35 && item.odds <= 1.6));
});

test("selects real-odds combinations inside each target band without reusing a match", () => {
  const odds = [
    [1.45, 1.45, 1.45],
    [1.5, 1.5, 1.5, 1.5],
    [1.6, 1.6, 1.6, 1.6, 1.6],
  ];
  for (let i = 0; i < AUTO_TARGETS.length; i++) {
    const candidates = odds[i].map((value, index) => candidate(`fixture-${i}-${index}`, value));
    const picks = selectTargetCombination(candidates, AUTO_TARGETS[i]);
    assert.ok(picks?.length >= 2, `target ${AUTO_TARGETS[i].target}`);
    const actual = picks.reduce((total, item) => total * item.odds, 1);
    assert.ok(actual >= AUTO_TARGETS[i].min && actual <= AUTO_TARGETS[i].max);
    assert.equal(new Set(picks.map((item) => item.match.id)).size, picks.length);
    assert.equal(picks.length, i + 3, `target ${AUTO_TARGETS[i].target} uses the fewest practical legs`);
  }
});

test("chooses the fewest possible matches needed for target odds", () => {
  const scenarios = [
    { target: AUTO_TARGETS[0], odds: 1.45, requiredSelections: 3 },
    { target: AUTO_TARGETS[1], odds: 1.5, requiredSelections: 4 },
    { target: AUTO_TARGETS[2], odds: 1.6, requiredSelections: 5 },
  ];
  for (const { target, odds, requiredSelections } of scenarios) {
    const candidates = Array.from({ length: 6 }, (_, index) => candidate(`m-${index}`, odds));
    const picks = selectTargetCombination(candidates, target);
    assert.equal(picks?.length, requiredSelections);
  }
});

test("does not fabricate a ticket when the target cannot be reached", () => {
  const picks = selectTargetCombination([candidate("one", 1.2)], AUTO_TARGETS[0]);
  assert.equal(picks, null);
});
