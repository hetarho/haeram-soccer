import type { World } from '../../contracts/src/types';
import { clubOf, quote } from './world';

/**
 * Supporters follow a club's standing, not its stadium (→ECON-23). Every league round they move
 * 3% of the way toward the following its reputation commands (about 2,000 at reputation 12,
 * 47,000 at 50, 360,000 at 75 and 1.2 million at 90); a win adds 0.4% on top, a defeat costs
 * 0.1%, and marketing and campaigns add their own. There is no ceiling. The stadium limits only
 * who can come in on match day (→ gate); every supporter, wherever he lives, also buys shirts,
 * streams and subscriptions: the global fan income, paid each league round.
 */
export const FAN_CONFIG = {
  base: 800,
  growth: 1.085,
  drift: 0.03,
  win: 0.004,
  loss: 0.001,
  /** Global fan income per round: scale × fans^exponent price units (87k fans ≈ 16 a round). */
  incomeScale: 0.001,
  incomeExponent: 0.85,
};
export const MIN_FANS = 200;
/** The following a reputation commands, which supporters drift toward. */
export function fanFollowing(reputation: number) {
  return Math.round(FAN_CONFIG.base * FAN_CONFIG.growth ** reputation);
}
/** One league round of supporters drifting toward the following. */
export function driftFans(fans: number, reputation: number) {
  return Math.max(
    MIN_FANS,
    Math.round(fans + (fanFollowing(reputation) - fans) * FAN_CONFIG.drift),
  );
}
/** Supporters after one of our matches: a win draws a few more, a defeat loses a few. */
export function fansAfterMatch(fans: number, win: boolean, winFans = 1) {
  return Math.max(
    MIN_FANS,
    Math.round(fans * (win ? 1 + FAN_CONFIG.win * winFans : 1 - FAN_CONFIG.loss)),
  );
}
/** Global fan income for one league round, in price units. */
export function fanIncomeUnits(fans: number) {
  return FAN_CONFIG.incomeScale * fans ** FAN_CONFIG.incomeExponent;
}
/** Global fan income for one league round, in the club's money this season. */
export function fanIncome(w: World) {
  return quote(clubOf(w).country, w.year, fanIncomeUnits(clubOf(w).fans));
}
