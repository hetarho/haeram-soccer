import type { Player, World } from '../../contracts/src/types';
import { clamp } from './primitives';
import { clubOf, overall } from './player-state';
import { footballQuote } from './quotes';

/**
 * Market wages and transfer values (→CLUB-25), in 1901 price units that the football index
 * carries to a country and year (→ECON-26), measured against the career targets (→ECON-29) with
 * scripts/calibrate-economy.ts (spec/ssot/ECON.md).
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

/** Yearly market wage in 1901 units at football index 1. */
export function marketWageUnits(division: number, ability: number, age: number, potential: number) {
  return scaleUnits(marketPoints(ability, age, potential, MARKET_CONFIG.promise.wage), division);
}
/** Transfer value in 1901 units at football index 1: years of a wage that counts more promise. */
export function marketValueUnits(
  division: number,
  ability: number,
  age: number,
  potential: number,
) {
  const c = MARKET_CONFIG,
    years = clamp(c.years - Math.max(0, age - c.peak), c.minYears, c.years);
  return years * scaleUnits(marketPoints(ability, age, potential, c.promise.value), division);
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
    marketValueUnits(division, overall(p), year - p.born, p.potential),
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
