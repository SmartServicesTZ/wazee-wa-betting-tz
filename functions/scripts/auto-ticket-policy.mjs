export const AUTO_ODDS_MIN = 1.4;
export const AUTO_ODDS_MAX = 1.8;

export function isAutoSelectionOddsValid(value) {
  const odds = Number(value);
  return Number.isFinite(odds) && odds >= AUTO_ODDS_MIN && odds <= AUTO_ODDS_MAX;
}

export function eligibleAutoOptions(options) {
  return (Array.isArray(options) ? options : [])
    .map((item) => ({ ...item, odds: Number(item.odds) }))
    .filter((item) => isAutoSelectionOddsValid(item.odds))
    .sort((left, right) => left.odds - right.odds);
}

export function autoTicketSelectionsMeetPolicy(selections) {
  return (
    Array.isArray(selections) &&
    selections.length >= 2 &&
    selections.length <= 5 &&
    selections.every((selection) => isAutoSelectionOddsValid(selection?.odds))
  );
}
