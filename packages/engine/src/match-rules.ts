import type { Player, Tactic } from '../../contracts/src/types';
import { clamp } from './primitives';
import { HOST_MATH, type MatchMath } from './portable-math';
import { fatigueLoad, unhappyPenalty } from './player-state';

export const MATCH_DUEL_CONFIG = {
  /** A chance made by a flank player is a cross this often before his weight: then a header. */
  crossChance: 0.35,
  /**
   * A 스위퍼 키퍼 reads a ball in behind or a run through on goal this often between equal
   * players, on his 속도 and 발밑 against the runner's 속도 (→PLAYER-5).
   */
  sweep: 0.05,
  /** How much more often a runner (speedster, line breaker, shadow striker) takes a chance himself. */
  runShare: 0.5,
  /** Key-duel success between equal players. */
  keySuccess: 0.62,
  /** Chance attempts are the team chance rate divided by this realized key-duel success. */
  keyRealized: 0.6,
  /** Duel-margin points (after diminishing returns) per unit of key-duel success. */
  keyScale: 250,
  /**
   * Shot attempts per point of the team chance rate: open play plus the set pieces and second
   * balls the minute model folds in, so a side takes the 10–16 shots of a top-flight match.
   */
  volume: 1.7,
  /** Most of a side's possession minutes that can become chances. */
  attemptCap: 0.75,
  /** Big chance, box and long-range expected-goal bands (about 0.1 xG per shot overall). */
  chances: {
    big: [0.24, 0.43] as const,
    box: [0.068, 0.16] as const,
    long: [0.024, 0.056] as const,
  },
  bigShare: 0.13,
  /** Duel-margin points (after diminishing returns) per unit of big-chance share. */
  bigScale: 500,
  boxShare: 0.52,
  /**
   * Expected goals scale by exp(bent (shooter attack − keeper) / finishing) and by the shooter's
   * own attack against a 55 baseline, so sharper leagues finish slightly more chances.
   */
  finishing: 90,
  sharpness: 400,
  onTarget: 0.4,
  /** Key-duel and finishing margins between two players bend towards this many points (tanh). */
  saturation: 30,
  /**
   * Diminishing returns on the whole match: a strength gap g plays as g / (1 + (g / S)⁴)^¼ —
   * close to g up to about 15 points, never more than S. A far stronger side eases off and a far
   * weaker one parks the bus, so even a massive favourite still drops points.
   */
  gapSaturation: 24,
  /**
   * Score effects: per goal of lead (up to two) a side ahead sits deeper, ceding this share of
   * the ball and creating `leadEase` as much from what it keeps, so leads get defended,
   * equalisers come and routs stay rare.
   */
  leadPossession: 0.05,
  leadEase: 0.8,
  /**
   * Match-day form: each side's strength and every player's skills move by a seeded, fat-tailed
   * draw with this standard deviation in rating points (travel, rotation, a bad day at the
   * office). It comes on top of the diminishing returns, so it is what topples favourites.
   */
  form: 7,
  /** In-match fatigue: skill points lost by 90′ per missing stamina point. */
  drainPerStamina: 1 / 12,
  pressDrain: 1.3,
  /**
   * A minute that starts with the ball just won in the opponent's third: the chance rate rises by
   * this factor and the chance is a big one this much more often.
   */
  transition: { chance: 1.25, big: 0.15 },
} as const;

const C = MATCH_DUEL_CONFIG;
/** Diminishing returns on a skill margin: about linear up to half the saturation, then flat. */
export const bend = (margin: number, math: MatchMath = HOST_MATH) =>
  C.saturation * math.tanh(margin / C.saturation);
/** The strength gap a match plays at: close to the gap up to ~15 points, never past the cap. */
export const effectiveGap = (gap: number, math: MatchMath = HOST_MATH) =>
  gap / Math.sqrt(Math.sqrt(1 + math.powInt(gap / C.gapSaturation, 4)));
/** How much better than a chance's quality this shooter finishes against this keeper. */
export const finishing = (shooting: number, keeping: number, math: MatchMath = HOST_MATH) =>
  math.exp(bend(shooting - keeping, math) / C.finishing) * (1 + (shooting - 55) / C.sharpness);
/** Goal probability of a chance of quality `xg` for this shooter against this keeper. */
export const goalChance = (
  xg: number,
  shooting: number,
  keeping: number,
  math: MatchMath = HOST_MATH,
) => clamp(xg * finishing(shooting, keeping, math), 0.01, 0.8);
export const targetChance = (goal: number, shooting: number) =>
  clamp(goal + C.onTarget + (shooting - 55) / 250, goal + 0.05, 0.95);

export function slotSkill(p: Player, value: number, scale: number, keeping = false) {
  return value * scale - fatigueLoad(p.fatigue) / (keeping ? 10 : 8) - unhappyPenalty(p);
}
/** Skill points a player of this `stamina` loses per minute on the pitch for `side` (→MATCH-11). */
export function drainPerMinute(
  setup: { tactics: readonly Tactic[]; drain: readonly number[] },
  side: 0 | 1,
  stamina: number,
) {
  return (
    ((100 - stamina) *
      C.drainPerStamina *
      (setup.tactics[side] === 'press' ? C.pressDrain : 1) *
      setup.drain[side]!) /
    90
  );
}
