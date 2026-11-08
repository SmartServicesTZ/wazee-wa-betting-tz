import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTO_ODDS_MAX,
  AUTO_ODDS_MIN,
  autoTicketSelectionsMeetPolicy,
  eligibleAutoOptions,
  isAutoSelectionOddsValid,
} from "./auto-ticket-policy.mjs";

test("accepts the inclusive 1.40–1.80 odds boundaries", () => {
  assert.equal(isAutoSelectionOddsValid(AUTO_ODDS_MIN), true);
  assert.equal(isAutoSelectionOddsValid(AUTO_ODDS_MAX), true);
  assert.equal(isAutoSelectionOddsValid("1.40"), true);
});

test("rejects odds below/above range and malformed values", () => {
  for (const value of [1.39, 1.81, 1, 0, NaN, Infinity, "not-odds", null]) {
    assert.equal(isAutoSelectionOddsValid(value), false, `expected ${String(value)} to be rejected`);
  }
});

test("candidate options only contain valid odds and sort lowest-first", () => {
  const eligible = eligibleAutoOptions([
    { prediction: "too-low", odds: 1.2 },
    { prediction: "upper", odds: 1.8 },
    { prediction: "middle", odds: "1.55" },
    { prediction: "too-high", odds: 2.1 },
  ]);
  assert.deepEqual(
    eligible.map(({ prediction, odds }) => [prediction, odds]),
    [
      ["middle", 1.55],
      ["upper", 1.8],
    ],
  );
});

test("ticket verification requires 2–5 selections and every selection within range", () => {
  assert.equal(autoTicketSelectionsMeetPolicy([{ odds: 1.4 }, { odds: 1.8 }]), true);
  assert.equal(autoTicketSelectionsMeetPolicy([{ odds: 1.6 }]), false);
  assert.equal(autoTicketSelectionsMeetPolicy([{ odds: 1.6 }, { odds: 1.39 }]), false);
  assert.equal(autoTicketSelectionsMeetPolicy(Array.from({ length: 6 }, () => ({ odds: 1.6 }))), false);
});
