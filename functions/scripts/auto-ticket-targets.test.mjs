import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTO_TARGETS,
  isEligibleSelectionOdds,
  selectTargetCombination,
} from "./auto-ticket-targets.mjs";

const candidate = (id, odds) => ({ match: { id }, odds });

test("defines the four daily target bands", () => {
  assert.deepEqual(
    AUTO_TARGETS.map(({ target }) => target),
    [2, 3, 5, 10],
  );
});

test("accepts only each-selection odds from 1.40 through 1.80", () => {
  for (const odds of [1.4, 1.5, 1.8]) assert.equal(isEligibleSelectionOdds(odds), true);
  for (const odds of [1.39, 1.81, 4, NaN, Infinity])
    assert.equal(isEligibleSelectionOdds(odds), false);
});

test("never includes an out-of-range selection even if the caller supplies it", () => {
  const candidates = [
    candidate("too-low", 1.39),
    candidate("valid-a", 1.4),
    candidate("valid-b", 1.4),
    candidate("too-high", 1.81),
  ];
  const picks = selectTargetCombination(candidates, { min: 1.96, max: 2.1 }, 2, 2);
  assert.deepEqual(
    picks?.map((item) => item.match.id),
    ["valid-a", "valid-b"],
  );
  assert.ok(picks?.every((item) => item.odds >= 1.4 && item.odds <= 1.8));
});

test("selects real-odds combinations inside each target band without reusing a match", () => {
  const odds = [
    [1.4, 1.5],
    [1.5, 1.8],
    [1.6, 1.7, 1.8],
    [1.6, 1.6, 1.6, 1.6, 1.6],
  ];
  for (let i = 0; i < AUTO_TARGETS.length; i++) {
    const candidates = odds[i].map((value, index) => candidate(`fixture-${i}-${index}`, value));
    const picks = selectTargetCombination(candidates, AUTO_TARGETS[i]);
    assert.ok(picks?.length >= 2, `target ${AUTO_TARGETS[i].target}`);
    const actual = picks.reduce((total, item) => total * item.odds, 1);
    assert.ok(actual >= AUTO_TARGETS[i].min && actual <= AUTO_TARGETS[i].max);
    assert.equal(new Set(picks.map((item) => item.match.id)).size, picks.length);
  }
});

test("does not fabricate a ticket when the target cannot be reached", () => {
  const picks = selectTargetCombination([candidate("one", 1.2)], AUTO_TARGETS[0]);
  assert.equal(picks, null);
});
