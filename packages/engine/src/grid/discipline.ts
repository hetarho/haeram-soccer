/** Cards in the match: how a foul is punished and when a player argues (→MATCH-19). WIP: the engine does not apply cards yet. */
import { attackFrame, bandOf, laneOf, type Point } from './pitch';
import { offsideLine } from './shape';
import type { GridPlayer, GridState } from './state';

export type CardKind = 'none' | 'yellow' | 'secondYellow' | 'red';
export type CardReason = 'reckless' | 'tactical' | 'dissent' | 'dogso' | 'serious';
export interface CardVerdict {
  card: CardKind;
  reason?: CardReason;
}

/** Initial values (design §7.5); T215 tunes them to the MATCH-23 band. */
export const CARD_CONFIG = {
  yellow: 0.32,
  tacticalYellow: 0.6,
  bookedYellow: 0.1,
  dogsoRed: 0.8,
  dogsoRedInBox: 0.3,
  seriousRed: 0.006,
  dissentYellow: 0.06,
  dissentRedPerHalf: 0.001,
  counterSeconds: 8,
} as const;

const onPitch = (gp: GridPlayer) => gp.onPitch && !gp.sentOff;
const other = (side: 0 | 1) => (1 - side) as 0 | 1;

/** A foul by the fouler's side in the fouled player's attack frame: is it a tactical one (a counter stopped by a player goal-side of the ball)? */
export function isTactical(s: GridState, foulerSide: 0 | 1, fouler: number): boolean {
  const fouled = other(foulerSide);
  const recent =
    s.lastRegain?.side === fouled && s.elapsed - s.lastRegain.at <= CARD_CONFIG.counterSeconds;
  if (!recent) return false;
  const ball = attackFrame(fouled, s.ball);
  return attackFrame(fouled, s.players[foulerSide][fouler]!.pos)[0] > ball[0];
}

/** Denying an obvious goal-scoring opportunity: the fouled player is in behind, or central in the box zone with no other outfield defender goal-side. */
export function isDogso(s: GridState, foulerSide: 0 | 1, fouler: number, at: Point): boolean {
  const fouled = other(foulerSide);
  const p = attackFrame(fouled, at);
  if (p[0] > offsideLine(s, foulerSide)) return true;
  if (bandOf(p[0]) < 6 || laneOf(p[1]) < 1 || laneOf(p[1]) > 3) return false;
  return !s.players[foulerSide].some((gp) => {
    if (!onPitch(gp) || gp.idx === fouler || gp.slot === 0) return false;
    return attackFrame(fouled, gp.pos)[0] > p[0];
  });
}

/**
 * The card a foul draws, in this order of draws: serious foul play; denying a goal-scoring
 * opportunity; the caution (a booked player's second one is a second yellow).
 */
export function cardForFoul(
  s: GridState,
  foulerSide: 0 | 1,
  fouler: number,
  foul: { at: Point; inBox: boolean },
  r: () => number,
): CardVerdict {
  const C = CARD_CONFIG;
  const gp = s.players[foulerSide][fouler]!;
  if (r() < C.seriousRed) return { card: 'red', reason: 'serious' };
  if (isDogso(s, foulerSide, fouler, foul.at) && r() < (foul.inBox ? C.dogsoRedInBox : C.dogsoRed))
    return { card: 'red', reason: 'dogso' };
  const tactical = isTactical(s, foulerSide, fouler);
  const p = gp.yellow ? C.bookedYellow : tactical ? C.tacticalYellow : C.yellow;
  if (r() >= p) return { card: 'none' };
  return {
    card: gp.yellow ? 'secondYellow' : 'yellow',
    reason: tactical ? 'tactical' : 'reckless',
  };
}

/** Dissent at the end of a period: at most one player of the side, drawn once. */
export function dissentAt(
  s: GridState,
  side: 0 | 1,
  r: () => number,
): { card: 'yellow' | 'red'; player: number } | undefined {
  const C = CARD_CONFIG;
  const u = r();
  if (u >= C.dissentRedPerHalf + C.dissentYellow) return undefined;
  const pool = s.players[side].filter((gp) => onPitch(gp) && gp.slot > 0);
  if (!pool.length) return undefined;
  const who = pool[Math.min(pool.length - 1, Math.floor(r() * pool.length))]!;
  return { card: u < C.dissentRedPerHalf ? 'red' : 'yellow', player: who.idx };
}
