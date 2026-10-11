/**
 * The stadium and training ground (→ECON-12): twenty levels, each 38% dearer than the last (250
 * price units for the first, about 4,500 for the tenth and 113,000 for the twentieth), so the
 * early steps come quickly and the top takes a career. Each level holds 5,000 more spectators.
 */
export const MAX_FACILITIES = 20;
export function facilityCostUnits(level: number) {
  return 250 * 1.38 ** (level - 1);
}
/** Annual upkeep in price units: it grows with the square of the level. */
export function facilityUpkeepUnits(level: number) {
  return 180 + level * 40 + level * level * 5;
}
