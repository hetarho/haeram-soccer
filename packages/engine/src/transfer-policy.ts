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
 * the 매각 기조 card's offer factor (→ECON-22); tuned so a delegated club at the standard card sells
 * one or two of its starters a season and a selling club far more (measured on reference careers).
 */
export const INCOMING_BID_CHANCE = 0.08;
