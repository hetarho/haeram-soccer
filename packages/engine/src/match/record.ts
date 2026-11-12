import { MATERIAL_LAYOUT, REPORT_SLOTS, SHOT_OUTCOMES } from '../material';
import type { MatchMaterial } from '../../../contracts/src/types';
import {
  attackFrame,
  BAND_EDGES,
  cellBand,
  cellLane,
  cellOf,
  inBox,
  laneOf,
  PITCH,
  type Point,
} from './pitch';

/**
 * What both result paths and the script count by (→MATCH-11, MATCH-13, MATCH-25): the record's
 * metric lines, MATCH-13's zones on MATCH-14's cells and the own match's post-match material.
 */

/** The phase of play an action stands in (→MATCH-15), as the material's possessions read it. */
export type PlayPhase =
  'buildUp' | 'progression' | 'finalThird' | 'counter' | 'settled' | 'setPiece' | 'contest';

/**
 * MATCH-13's zones on MATCH-14's bands, in the acting side's attack frame, read alike by the grid's
 * tally (points) and the aggregate ledger (cells): a pass that starts from band `finalThird` on is
 * a final-third pass, and below it a build-up pass (PPDA's numerator: the passer's own 60%); a
 * tackle, interception, challenge or foul from band `press` on is a defensive action in the
 * opponent's own 60% (PPDA's denominator); an open-play ball won from band `highTurnover` on
 * starts a high turnover (within 40 m of the opponent's goal). MATCH-14 has no edge at 40 m from
 * goal (65 m) or at 60% (42 m and 63 m), so both paths read the nearest band edge: 70 m (35 m from
 * goal) and 35 m (the two-thirds edge, mirrored at 70 m for the passer).
 */
export const COUNTER_ZONES = { finalThird: 5, press: 3, highTurnover: 5 } as const;
/**
 * MATCH-3: a side's possession is its share of both sides' attempted passes, kept as the home
 * side's part of `whole` (90 on a record) and half each when nobody passed. The pre-feature model
 * reads seconds on the ball through the same share.
 */
export const possessionShare = (home: number, away: number, whole = 90) =>
  home + away > 0 ? Math.round((whole * home) / (home + away)) : Math.round(whole / 2);
/** The band of the same strip in the other side's attack frame (the bands mirror at halfway). */
export const mirrorBand = (band: number) => 7 - band;
/** The box: the inner three lanes of the box and goal-area bands (`inBox` on cells, →MATCH-14). */
export const inBoxCell = (cell: number) => cellBand(cell) >= 6 && cellLane(cell) % 4 !== 0;
/** MATCH-14's cut-back zones: the half-space cells of the goal-area band. */
const inCutBackZone = (cell: number) =>
  cellBand(cell) === 7 && (cellLane(cell) === 1 || cellLane(cell) === 3);
/**
 * MATCH-13's cut-back, the one rule both paths count by: a pass from a cut-back zone back into the
 * box, counted when completed, whatever kind of pass it was (a low cross pulled back counts as a
 * cross and a cut-back). From the goal-area band every box cell is level or back, so "back" adds
 * no condition at cell resolution.
 */
export const isCutBack = (from: number, to: number) => inCutBackZone(from) && inBoxCell(to);
/** Indexes of the per-player and team metric lines. */
export const M = {
  goals: 0,
  assists: 1,
  passes: 2,
  completed: 3,
  shots: 4,
  onTarget: 5,
  tackles: 6,
  interceptions: 7,
  dribbles: 8,
  saves: 9,
  minutes: 10,
  possession: 11,
} as const;

/** x (attack frame) where MATCH-13's zones start: the final third and the press. */
const FINAL_THIRD = BAND_EDGES[COUNTER_ZONES.finalThird];
const PRESS_FROM = BAND_EDGES[COUNTER_ZONES.press];

/** The schema's caps on a match's material rows: shots and network pairs. */
const MAX_SHOTS = 80;
const MAX_PAIRS = 300;
const C = MATERIAL_LAYOUT.cells;
const RS = MATERIAL_LAYOUT.report;

/**
 * Post-match material of an own match (→MATCH-25), counted into typed arrays sized at
 * kick-off so a touch allocates nothing. Players are roster indexes until `finish` maps them to lines.
 */
export class MaterialTally {
  private readonly size: number;
  /** Own players' touches per cell, roster index × 40. */
  private readonly heat: Uint16Array;
  private readonly totals = [new Uint16Array(C), new Uint16Array(C)] as const;
  /** Own players' summed touch positions (x, y) and touch counts. */
  private readonly sum: Float64Array;
  private readonly touches: Uint16Array;
  /** Own completed passes, passer roster index × receiver roster index. */
  private readonly pairs: Uint16Array;
  private readonly report = new Uint32Array(2 * RS);
  /** Per shot: side, roster index, x10, y10, xG100, outcome, header. */
  private readonly shots: number[] = [];
  private possession: 0 | 1 | undefined;
  private counter = false;

  constructor(
    private readonly own: 0 | 1,
    roster: number,
  ) {
    this.size = roster;
    this.heat = new Uint16Array(roster * C);
    this.sum = new Float64Array(roster * 2);
    this.touches = new Uint16Array(roster);
    this.pairs = new Uint16Array(roster * roster);
  }

  private bump(side: 0 | 1, slot: number, n = 1) {
    this.report[side * RS + slot]! += n;
  }

  /** A touch at `p` in the player's attack frame. */
  private touchAt(side: 0 | 1, idx: number, p: Point) {
    const cell = cellOf(p);
    this.totals[side][cell]!++;
    if (side !== this.own) return;
    this.heat[idx * C + cell]!++;
    this.sum[idx * 2]! += p[0];
    this.sum[idx * 2 + 1]! += p[1];
    this.touches[idx]!++;
  }

  /**
   * An action start by `(side, idx)` at `at` (engine frame). `phase` is the carrier's tag in open play,
   * absent for a restart; a restart or a change of side starts a possession. A script can supply
   * its explicit possession boundary even when its restart carries a phase.
   */
  touch(side: 0 | 1, idx: number, at: Point, phase?: PlayPhase, newPossession = false): void {
    this.touchAt(side, idx, attackFrame(side, at));
    if (!newPossession && phase !== undefined && side === this.possession) return;
    this.possession = side;
    this.counter = phase === 'counter';
    if (this.counter) this.bump(side, REPORT_SLOTS.counterAttacks);
  }

  /** A completed delivery received at `at` (engine frame); connective deliveries credit no pair. */
  received(side: 0 | 1, passer: number, receiver: number, at: Point, counted = true): void {
    this.touchAt(side, receiver, attackFrame(side, at));
    if (counted && side === this.own) this.pairs[passer * this.size + receiver]!++;
  }

  /** A shot: `d` holds its point (attack frame), xG, header and set-piece flag. */
  shot(
    side: 0 | 1,
    idx: number,
    result: (typeof SHOT_OUTCOMES)[number],
    d: { x: number; y: number; xg: number; header: boolean; setPiece: boolean },
    touchCounted = false,
  ): void {
    // A header is the header taker's touch unless the caller already counted its action start.
    if (d.header && !touchCounted) this.touchAt(side, idx, [d.x, d.y]);
    if (d.setPiece) {
      this.bump(side, REPORT_SLOTS.setPieceShots);
      if (result === 'goal') this.bump(side, REPORT_SLOTS.setPieceGoals);
    }
    if (this.counter && this.possession === side) this.bump(side, REPORT_SLOTS.counterShots);
    if (this.shots.length >= MAX_SHOTS * MATERIAL_LAYOUT.shot) return;
    this.shots.push(
      side,
      idx,
      Math.round(Math.min(PITCH.length, Math.max(0, d.x)) * 10),
      Math.round(Math.min(PITCH.width, Math.max(0, d.y)) * 10),
      Math.round(d.xg * 100),
      SHOT_OUTCOMES.indexOf(result),
      d.header ? 1 : 0,
    );
  }

  /** An aerial duel won by `winner`. */
  aerial(winner: 0 | 1): void {
    this.bump(winner, REPORT_SLOTS.aerialsWon);
    this.bump(0, REPORT_SLOTS.aerials);
    this.bump(1, REPORT_SLOTS.aerials);
  }

  /** The ball won by `side` at `at` (its attack frame), lost by the other at the same point. */
  regain(side: 0 | 1, at: Point): void {
    const third = (x: number) => (x < PRESS_FROM ? 0 : x < FINAL_THIRD ? 1 : 2);
    this.bump(side, REPORT_SLOTS.regains + third(at[0]));
    this.bump((1 - side) as 0 | 1, REPORT_SLOTS.losses + third(PITCH.length - at[0]));
    if (at[0] >= FINAL_THIRD) this.bump(side, REPORT_SLOTS.highRegains);
  }

  /** A completed pass or carry from `from` to `to` (attack frame): final-third and box entries by lane. */
  entry(side: 0 | 1, from: Point, to: Point): void {
    if (from[0] < FINAL_THIRD && to[0] >= FINAL_THIRD)
      this.bump(side, REPORT_SLOTS.finalThirdEntries + laneOf(to[1]));
    if (inBox(to) && !inBox(from)) this.bump(side, REPORT_SLOTS.boxEntries + laneOf(to[1]));
  }

  /** Crosses and through balls count attempts; cut-backs count completions (MATCH-13). */
  pass(side: 0 | 1, kind: string, ok = true): void {
    if (kind === 'cross') this.bump(side, REPORT_SLOTS.crosses);
    else if (kind === 'cutBack' && ok) this.bump(side, REPORT_SLOTS.cutBacks);
    else if (kind === 'through') this.bump(side, REPORT_SLOTS.throughBalls);
  }

  takeOn(side: 0 | 1): void {
    this.bump(side, REPORT_SLOTS.takeOns);
  }

  /** A take-on won: the dribbler's success and a tackle lost by the other side. */
  dribble(side: 0 | 1): void {
    this.bump(side, REPORT_SLOTS.takeOnsWon);
    this.bump((1 - side) as 0 | 1, REPORT_SLOTS.tackles);
  }

  tackle(side: 0 | 1): void {
    this.bump(side, REPORT_SLOTS.tacklesWon);
    this.bump(side, REPORT_SLOTS.tackles);
  }

  /** The rows in record order. The grid filters single passes; scripts retain them with minimumPair=1. */
  finish(played: number[][], minimumPair: 1 | 2 = 2): MatchMaterial {
    const lineOf = played.map((idxs) => {
      const map = new Map<number, number>();
      idxs.forEach((idx, line) => map.set(idx, line));
      return map;
    });
    const shots = this.shots.slice();
    for (let i = 0; i < shots.length; i += MATERIAL_LAYOUT.shot)
      shots[i + 1] = lineOf[shots[i]!]!.get(shots[i + 1]!) ?? 0;
    const own = played[this.own]!;
    const heat: number[] = [];
    const network: number[] = [];
    for (const idx of own) {
      for (let c = 0; c < C; c++) heat.push(this.heat[idx * C + c]!);
      const n = this.touches[idx]!;
      network.push(
        n ? Math.round((this.sum[idx * 2]! / n) * 10) : 0,
        n ? Math.round((this.sum[idx * 2 + 1]! / n) * 10) : 0,
        n,
      );
    }
    heat.push(...this.totals[this.own], ...this.totals[1 - this.own]!);
    let kept = 0;
    for (let a = 0; a < own.length; a++)
      for (let b = 0; b < own.length; b++) {
        const n = this.pairs[own[a]! * this.size + own[b]!]!;
        if (n >= minimumPair && kept++ < MAX_PAIRS) network.push(a, b, n);
      }
    return { shots, heat, network, report: Array.from(this.report) };
  }
}
