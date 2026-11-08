export const AUTO_TARGETS = [
  { target: 1.5, min: 1.35, max: 1.7, key: "1.5" },
  { target: 3, min: 2.7, max: 3.4, key: "3" },
  { target: 5, min: 4.5, max: 5.7, key: "5" },
  { target: 10, min: 9, max: 11.5, key: "10" },
];

export function selectTargetCombination(candidates, target, minSelections = 2, maxSelections = 5) {
  let chosen = null;
  let visited = 0;
  const search = (from, picks, product) => {
    if (picks.length >= minSelections && product >= target.min && product <= target.max) {
      chosen = [...picks];
      return true;
    }
    if (product > target.max || picks.length >= maxSelections || visited++ > 12000) return false;
    for (let index = from; index < candidates.length; index++) {
      const candidate = candidates[index];
      if (picks.some((pick) => pick.match.id === candidate.match.id)) continue;
      if (search(index + 1, [...picks, candidate], product * candidate.odds)) return true;
    }
    return false;
  };
  search(0, [], 1);
  return chosen;
}
