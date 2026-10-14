import type { MatchRecord, World } from '../../contracts/src/types';
import { ownStarters } from './world';
import { clamp } from './primitives';
import { policyOf } from './policy';
import { managerStyleEffects } from './styles';
import { synergyEffects } from './synergy';
import { buildEffects } from './build';

/** New clubs start here; strength is unaffected at this value. */
export const MORALE_START = 60;
/** Absent in older saves: those clubs keep exactly the pre-morale match strength. */
export function moraleOf(w: World) {
  return w.morale ?? MORALE_START;
}
/** Strength points added to our side in match simulation (about −6 to +4). */
export function moraleStrength(w: World) {
  return w.morale === undefined ? 0 : (w.morale - MORALE_START) / 10;
}
export type MoraleState = 'peak' | 'good' | 'steady' | 'low' | 'crisis';
export const MORALE_LABEL: Record<MoraleState, string> = {
  peak: '최고조',
  good: '좋음',
  steady: '보통',
  low: '저조',
  crisis: '위기',
};
export function moraleState(value: number): MoraleState {
  return value >= 75
    ? 'peak'
    : value >= 60
      ? 'good'
      : value >= 45
        ? 'steady'
        : value >= 30
          ? 'low'
          : 'crisis';
}
/** Baseline each 리더 in the last starting XI adds, and the most they add together (→CLUB-19). */
export const LEADER_MORALE = { each: 1, most: 3 } as const;
/** 리더 among the starters of the last own match (→PLAYER-9). */
export function leadersInLastXi(w: World) {
  const last = w.ownMatches.at(-1);
  if (!last) return 0;
  const ids = new Set(last.players.map((line) => line.id));
  return w.players.filter((p) => ids.has(p.id) && p.traits.includes('leader')).length;
}
/**
 * Where morale settles between results: squad support, the manager's standing and the dressing
 * room's 리더. A standard club with a trusted manager settles at the neutral 60, so ordinary
 * results never drag it down.
 */
export function moraleBaseline(w: World) {
  return clamp(
    58 +
      Math.min(LEADER_MORALE.most, leadersInLastXi(w) * LEADER_MORALE.each) +
      (policyOf(w).support - 3) * 4 +
      (w.manager.trust - 50) / 10 +
      managerStyleEffects(w).moraleBaseline +
      buildEffects(w).moraleBaseline +
      synergyEffects(w).moraleBaseline,
    30,
    80,
  );
}
/** Results move morale; wide margins move it further. */
export function moraleAfterMatch(w: World, m: MatchRecord) {
  if (w.morale === undefined) return;
  const side = m.home === w.playerClub ? 0 : 1,
    own = side === 0 ? m.score.home : m.score.away,
    other = side === 0 ? m.score.away : m.score.home,
    margin = Math.abs(own - other) >= 2 ? 2 : 0;
  const change =
    own > other
      ? 6 + margin
      : own === other
        ? 1
        : -6 - margin + managerStyleEffects(w).defeatCushion;
  w.morale = Math.round(clamp(w.morale + change, 0, 100));
}
/** Squad morale each unhappy starter costs a settled round (→CLUB-27). */
export const UNHAPPY_MORALE = 1;
/** Morale a settled round costs from the squad's third 하드 round in a row on (→CLUB-19). */
export const HARD_STREAK = { from: 3, cost: 1 } as const;
/**
 * Each settled round drifts toward the baseline; an exhausted XI loses heart, and so does one
 * with unhappy starters or one worn by a run of 하드 트레이닝. An older save without morale starts
 * from 60 once an unhappy starter costs it.
 */
export function settleMorale(w: World) {
  const starters = ownStarters(w),
    unhappy = starters.filter((player) => player.unhappy).length;
  if (w.morale === undefined && unhappy) w.morale = MORALE_START;
  if (w.morale === undefined) return;
  const fatigue = starters.length
    ? starters.reduce((sum, player) => sum + player.fatigue, 0) / starters.length
    : 0;
  const hard = (w.trainingOrders?.hardStreak ?? 0) >= HARD_STREAK.from ? HARD_STREAK.cost : 0;
  const drift =
    (moraleBaseline(w) - w.morale) * 0.15 -
    (fatigue >= 40 ? 2 : 0) -
    unhappy * UNHAPPY_MORALE -
    hard;
  w.morale = Math.round(clamp(w.morale + drift, 0, 100));
}
