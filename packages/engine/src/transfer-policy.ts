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
 * the 매각 기조 card's offer factor (→ECON-22) and its scale below; tuned so a delegated club at the
 * standard card sells one or two of its starters a season (measured on reference careers).
 */
export const INCOMING_BID_CHANCE = 0.08;
/**
 * The 매각 기조 card's further scale on that chance, beside its offer factor: a selling club draws
 * enough bids to sell most of a team in some seasons (→CLUB-18's targets, measured).
 */
export const INCOMING_BID_SCALE: Readonly<Record<string, number>> = {
  selling: 2,
  showcase: 1,
  standard: 1,
  hardball: 1,
  hold: 1,
};
