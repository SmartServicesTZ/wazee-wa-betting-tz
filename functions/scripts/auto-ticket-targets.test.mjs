import test from "node:test";
import assert from "node:assert/strict";
import { AUTO_TARGETS, selectTargetCombination } from "./auto-ticket-targets.mjs";

const candidate = (id, odds) => ({ match: { id }, odds });

test("defines the four daily target bands", () => {
  assert.deepEqual(
    AUTO_TARGETS.map(({ target }) => target),
    [1.5, 3, 5, 10],
  );
});

test("selects real-odds combinations inside each target band without reusing a match", () => {
  const odds = [
    [1.2, 1.25],
    [1.5, 2],
    [2, 2.5],
    [2.5, 4],
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
