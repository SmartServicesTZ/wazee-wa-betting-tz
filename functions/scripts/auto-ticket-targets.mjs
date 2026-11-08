export const MIN_SELECTION_ODDS = 1.4;
export const MAX_SELECTION_ODDS = 1.8;

export function isEligibleSelectionOdds(value) {
  const odds = Number(value);
  return Number.isFinite(odds) && odds >= MIN_SELECTION_ODDS && odds <= MAX_SELECTION_ODDS;
}

export const AUTO_TARGETS = [
  { target: 2, min: 1.96, max: 2.35, key: "2" },
  { target: 3, min: 2.7, max: 3.4, key: "3" },
  { target: 5, min: 4.5, max: 5.7, key: "5" },
  { target: 10, min: 9, max: 11.5, key: "10" },
];

export function selectTargetCombination(candidates, target, minSelections = 2, maxSelections = 5) {
  let chosen = null;
  let visited = 0;
  const epsilon = 1e-9;
  const search = (from, picks, product) => {
    if (
      picks.length >= minSelections &&
      product >= target.min - epsilon &&
      product <= target.max + epsilon
    ) {
      chosen = [...picks];
      return true;
    }
    if (product > target.max + epsilon || picks.length >= maxSelections || visited++ > 12000)
      return false;
    for (let index = from; index < candidates.length; index++) {
      const candidate = candidates[index];
      if (!isEligibleSelectionOdds(candidate.odds)) continue;
      if (picks.some((pick) => pick.match.id === candidate.match.id)) continue;
      if (search(index + 1, [...picks, candidate], product * candidate.odds)) return true;
    }
    return false;
  };
  search(0, [], 1);
  return chosen;
}
