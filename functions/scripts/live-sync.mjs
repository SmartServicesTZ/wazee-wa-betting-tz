export const LIVE_MATCH_STATUSES = Object.freeze([
  "LIVE",
  "IN_PLAY",
  "1H",
  "HT",
  "2H",
  "ET",
  "BT",
  "P",
  "INT",
  "SUSP",
]);

const liveStatusSet = new Set(LIVE_MATCH_STATUSES);

export function shouldSyncFixtureStatus(status, eventId, previouslyLiveIds) {
  const normalizedStatus = String(status ?? "").toUpperCase();
  const normalizedId = String(eventId ?? "");
  return liveStatusSet.has(normalizedStatus) || previouslyLiveIds.has(normalizedId);
}
