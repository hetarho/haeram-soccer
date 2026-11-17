/** Delegated sale acceptance, as percentages of value: ordinary player and prospect. */
export const SALE_BARS: Readonly<Record<string, readonly [number, number]>> = {
  selling: [110, 160],
  showcase: [120, 180],
  standard: [130, 200],
  hardball: [150, 230],
  hold: [150, 250],
};
/**
 * Daily chance, each window day, that another club bids for one of our players (→CLUB-18), before
 * the 매각 기조 card's offer factor (→ECON-22, 셀링 클럽 ×3.2), the only per-card scale; measured
 * on a reference career: a delegated club at the standard card sold one starter of its season-start
 * XI in each of two seasons, and at 셀링 클럽 four and seven.
 */
export const INCOMING_BID_CHANCE = 0.08;
