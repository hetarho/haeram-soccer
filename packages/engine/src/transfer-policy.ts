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
  stature: { giant: 0.1, big: 0.05, small: -0.05 },
  place: { core: 0.1, starter: 0.05, outside: -0.1 },
  contract: { final: -0.15, next: -0.05 },
  age: { veteran: -0.1, old: -0.2 },
  veteranAge: 30,
  oldAge: 33,
  prospect: 0.05,
  cashCrisis: -0.15,
  distress: { warning: -0.05, forced: -0.25 },
  sellingDown: -0.1,
  /** A club nobody owns relegated at the last close, for one of its starters. */
  relegatedStarter: -0.1,
  /** A club nobody owns's player 5 or more above its division's level, bid for from a higher one. */
  aboveDivision: -0.1,
  aboveDivisionPoints: 5,
  /** Before this season the contract rows count half: a move out of contract still carried a fee. */
  contractFullFrom: 1995,
  contractEarlyShare: 0.5,
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

/** A club nobody owns's market caps for one window (→WORLD-16): bids, completed buys and sales. */
export interface NpcMarketCaps {
  bids: number;
  buys: number;
  sales: number;
}
/**
 * The era table behind those caps: anchors by year, linear between them and flat outside, each
 * value rounded to a whole count. Few moves under the retain and maximum-wage systems, more after
 * freedom of contract, the most after 1995. Tuned by measurement (T950): the 1960 anchor holds the
 * maximum-wage years at the 1950s caps, since interpolating toward 1965 lifted 1958–61 top-flight
 * fee moves above 4 a club.
 */
export const NPC_MARKET_ERA: { anchors: [number, NpcMarketCaps][] } = {
  anchors: [
    [1950, { bids: 3, buys: 2, sales: 2 }],
    [1960, { bids: 3, buys: 2, sales: 2 }],
    [1965, { bids: 4, buys: 3, sales: 3 }],
    [1980, { bids: 5, buys: 3, sales: 3 }],
    [1995, { bids: 6, buys: 4, sales: 4 }],
    [2010, { bids: 8, buys: 5, sales: 5 }],
  ],
};
/** The caps in force in `year`'s windows. */
export function npcMarketCaps(
  year: number,
  era: readonly (readonly [number, NpcMarketCaps])[] = NPC_MARKET_ERA.anchors,
): NpcMarketCaps {
  const first = era[0]!,
    last = era.at(-1)!;
  if (year <= first[0]) return { ...first[1] };
  if (year >= last[0]) return { ...last[1] };
  const at = era.findIndex(([anchor]) => anchor > year);
  const [y0, a] = era[at - 1]!,
    [y1, b] = era[at]!,
    t = (year - y0) / (y1 - y0);
  const read = (key: keyof NpcMarketCaps) => Math.round(a[key] + (b[key] - a[key]) * t);
  return { bids: read('bids'), buys: read('buys'), sales: read('sales') };
}
