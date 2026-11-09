import assert from "node:assert/strict";
import test from "node:test";
import { shouldSyncFixtureStatus } from "./live-sync.mjs";

test("syncs active football statuses regardless of previous Firestore state", () => {
  const none = new Set();
  assert.equal(shouldSyncFixtureStatus("1H", "101", none), true);
  assert.equal(shouldSyncFixtureStatus("IN_PLAY", "102", none), true);
  assert.equal(shouldSyncFixtureStatus("SUSP", "103", none), true);
});

test("syncs fixtures that were live before so their final status and score can be updated", () => {
  const previouslyLive = new Set(["201"]);
  assert.equal(shouldSyncFixtureStatus("FT", "201", previouslyLive), true);
  assert.equal(shouldSyncFixtureStatus("PST", "201", previouslyLive), true);
  assert.equal(shouldSyncFixtureStatus("FT", "202", previouslyLive), false);
});

test("does not write unrelated scheduled fixtures during frequent live syncs", () => {
  assert.equal(shouldSyncFixtureStatus("NS", "301", new Set()), false);
});
