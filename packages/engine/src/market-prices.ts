import type { Player, World } from '../../contracts/src/types';
import { clamp } from './primitives';
import { clubOf, overall } from './player-state';
import { footballQuote } from './quotes';

/**
 * Market wages and transfer values (→CLUB-25), in 1901 price units that the football index
 * carries to a country and year (→ECON-26), measured against the career targets (→ECON-29) with
 * scripts/calibrate-economy.ts (spec/ssot/ECON.md) and against each era's real fees (→CLUB-46)
 * with scripts/calibrate-transfers.ts.
 */
export const MARKET_CONFIG = {
  /**
   * Yearly wage of a top-flight player rated `pivot` in his prime at football index 1, sized so a
   * top-flight wage bill weighs against the gate as it does in real football.
   */
  wage: 900,
  pivot: 70,
  /** Each ability point multiplies wage and value, so 80 earns 7.4× 60 (CLUB-25: 6–10×). */
  perPoint: 1.105,
  /**
   * The transfer market's own growth beyond the football index (→CLUB-46), [year, multiple]
   * anchors, geometric between them and flat outside. Fees grew with football's income until the
   * late 1970s and far faster since: the British record went from £165,000 in 1969 to £125m in
   * 2025, the Premier League's average fee from £0.6m in 1992/93 to £24m in 2025.
   */
  premium: [
    [1950, 0.5],
    [1957, 0.75],
    [1967, 0.85],
    [1977, 1.2],
    [1979, 1.8],
    [1993, 2],
    [1996, 3.2],
    [2008, 3.2],
    [2013, 3.9],
    [2025, 5.2],
  ] as [number, number][],
  /**
   * The premium reaches a value in proportion to how far its points stand above `pivot`, in full
   * from `premiumSpan` points above it: fees inflated at the top of the market, while a
   * lower-division player's fee grew with football's income alone.
   */
  premiumSpan: 10,
  /**
   * What a division pays for the same player, as a share of the top flight, by tier from the top
   * (the amateur league is the tier below the professional ones); the last entry holds below.
   * The second tier pays 40% (CLUB-25: 35–50%); lower divisions pay far less, so an amateur club
   * can keep the players its academy grows.
   */
  divisions: [1, 0.4, 0.15, 0.07, 0.03],
  /**
   * A young player is priced for a share of his headroom (potential − ability): the whole share
   * up to `full` years old, none from `none`; wages count `wage` of it, values `value`.
   */
  promise: { full: 18, none: 24, wage: 0.2, value: 0.4 },
  /** Ability points off for each year under `junior` and over `veteran`. */
  junior: 30,
  veteran: 30,
  /** A value is `years` of market wage up to age `peak`, one fewer each year after, at least `minYears`. */
  years: 2,
  peak: 28,
  minYears: 1,
  /** A season's loan costs this share of the player's value. */
  loan: 0.1,
};

/** A division's pay as a share of the top flight's; fractional divisions lie between two tiers. */
export function divisionShare(division: number) {
  const shares = MARKET_CONFIG.divisions,
    at = clamp(division, 0, shares.length - 1),
    low = Math.floor(at),
    high = Math.min(shares.length - 1, low + 1);
  return shares[low] + (shares[high] - shares[low]) * (at - low);
}

/** Ability with his promise and his age counted, the scale wages and values grow on. */
function marketPoints(ability: number, age: number, potential: number, promise: number) {
  const { full, none } = MARKET_CONFIG.promise;
  const youth = clamp((none - age) / (none - full), 0, 1);
  return (
    ability +
    Math.max(0, potential - ability) * youth * promise -
    Math.max(0, MARKET_CONFIG.junior - age) -
    Math.max(0, age - MARKET_CONFIG.veteran)
  );
}
function scaleUnits(points: number, division: number) {
  const c = MARKET_CONFIG;
  return c.wage * c.perPoint ** (points - c.pivot) * divisionShare(division);
}

/** The transfer market's multiple beyond the football index in `year` (→CLUB-46). */
export function transferPremium(year: number) {
  const anchors = MARKET_CONFIG.premium;
  if (year <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++) {
    const [from, low] = anchors[i - 1],
      [to, high] = anchors[i];
    if (year <= to) return low * (high / low) ** ((year - from) / (to - from));
  }
  return anchors[anchors.length - 1][1];
}

/** Yearly market wage in 1901 units at football index 1. */
export function marketWageUnits(division: number, ability: number, age: number, potential: number) {
  return scaleUnits(marketPoints(ability, age, potential, MARKET_CONFIG.promise.wage), division);
}
/**
 * Transfer value in 1901 units at football index 1: years of a wage that counts more promise,
 * carried by as much of `year`'s transfer premium as its points reach (→CLUB-46).
 */
export function marketValueUnits(
  division: number,
  ability: number,
  age: number,
  potential: number,
  year: number,
) {
  const c = MARKET_CONFIG,
    years = clamp(c.years - Math.max(0, age - c.peak), c.minYears, c.years),
    points = marketPoints(ability, age, potential, c.promise.value),
    reach = clamp((points - c.pivot) / c.premiumSpan, 0, 1);
  return years * transferPremium(year) ** reach * scaleUnits(points, division);
}

/** A player's market wage in `code` and `year` money. */
export function marketWageAt(code: string, year: number, division: number, p: Player) {
  return footballQuote(
    code,
    year,
    marketWageUnits(division, overall(p), year - p.born, p.potential),
  );
}
/** A player's transfer value in `code` and `year` money. */
export function marketValueAt(code: string, year: number, division: number, p: Player) {
  return footballQuote(
    code,
    year,
    marketValueUnits(division, overall(p), year - p.born, p.potential, year),
  );
}

/**
 * What the market pays a player a year (→CLUB-25): steeply more for ability, more for a young
 * player's promise, less before 21 and after 30, by his club's division and the football index.
 */
export function marketWage(w: World, player: Player, division = clubOf(w).tier) {
  return marketWageAt(clubOf(w).country, w.year, division, player);
}
/** The fee the market considers fair for a player, on the same scale as his wage. */
export function marketValue(w: World, player: Player, division = clubOf(w).tier) {
  return marketValueAt(clubOf(w).country, w.year, division, player);
}
