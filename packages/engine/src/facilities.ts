import { footballQuote } from './world';

/**
 * The stadium and training ground (→ECON-12): twenty levels, each `growth` dearer than the last
 * from `base` units for the first, so the early steps come quickly and the top takes a career.
 * Building and upkeep are units on the football index (→ECON-26), so the ladder keeps its weight
 * against football's income in every era. Each level holds 5,000 more spectators.
 */
export const MAX_FACILITIES = 20;
/**
 * Facility prices on the football index (→ECON-12): 1.58 a level makes the full ladder about
 * 4 million units, 25+ seasons of a top-flight club's net result (→ECON-29).
 */
export const FACILITY_CONFIG = {
  base: 250,
  growth: 1.58,
  /** Annual upkeep: `fixed` + `linear` × level + `square` × level². */
  upkeep: { fixed: 180, linear: 40, square: 5 },
};
export function facilityCostUnits(level: number) {
  return FACILITY_CONFIG.base * FACILITY_CONFIG.growth ** (level - 1);
}
/** Annual upkeep in units: it grows with the square of the level. */
export function facilityUpkeepUnits(level: number) {
  const { fixed, linear, square } = FACILITY_CONFIG.upkeep;
  return fixed + level * linear + level * level * square;
}
/** What building `level` costs in `code` and `year` money. */
export function facilityCost(code: string, year: number, level: number) {
  return footballQuote(code, year, facilityCostUnits(level));
}
/** A year's upkeep of facilities at `level` in `code` and `year` money. */
export function facilityUpkeep(code: string, year: number, level: number) {
  return footballQuote(code, year, facilityUpkeepUnits(level));
}
