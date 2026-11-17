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
/** CLUB-52's share and its bounds; starting values, tuned by measurement. */
export const SALE_SHARE = {
  base: 0.85,
  spread: 0.08,
  min: 0.5,
  max: 1,
  /** Our reservation never below this share of value. */
  ownFloor: 0.8,
  /** A bid at least R − this × A gets a counter at R. */
  counterReach: 0.25,
} as const;
/** CLUB-52's factor table: what each one adds to the share. */
export const SALE_FACTOR_VALUES = {
  place: { core: 0.1, starter: 0.05, outside: -0.1 },
  contract: { final: -0.15, next: -0.05 },
  age: { veteran: -0.1, old: -0.2 },
  veteranAge: 30,
  oldAge: 33,
  prospect: 0.05,
  cashCrisis: -0.15,
  wageLine: { over: -0.05, far: -0.1 },
  sellingDown: -0.1,
  listed: -0.15,
  requestOrUnhappy: -0.1,
  /** −(ability − 50)/250, a negotiator 0.05 more, a vacant post +0.05. */
  directorNeutral: 50,
  directorScale: 250,
  negotiator: -0.05,
  vacant: 0.05,
  /** The window's last days: the deadline day and the two before it. */
  deadlineDays: 3,
  deadline: -0.05,
} as const;
