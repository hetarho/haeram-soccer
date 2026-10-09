import type { MatchRecord, World } from '../../contracts/src/types';
import { activePlayers, selectedLineup } from './world';
import { clamp } from './primitives';
import { policyOf } from './policy';
import { managerStyleEffects } from './styles';
import { synergyEffects } from './synergy';
import { visionEffects } from './vision';

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
/**
 * Where morale settles between results: squad support and the manager's standing. A standard
 * club with a trusted manager settles at the neutral 60, so ordinary results never drag it down.
 */
export function moraleBaseline(w: World) {
  return clamp(
    58 +
      (policyOf(w).support - 3) * 4 +
      (w.manager.trust - 50) / 10 +
      managerStyleEffects(w).moraleBaseline +
      visionEffects(w).moraleBaseline +
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
/** Each settled round drifts toward the baseline; an exhausted XI loses heart. */
export function settleMorale(w: World) {
  if (w.morale === undefined) return;
  const starters = selectedLineup(activePlayers(w), w.lineup, w.manager, w.year);
  const fatigue = starters.length
    ? starters.reduce((sum, player) => sum + player.fatigue, 0) / starters.length
    : 0;
  const drift = (moraleBaseline(w) - w.morale) * 0.15 - (fatigue >= 40 ? 2 : 0);
  w.morale = Math.round(clamp(w.morale + drift, 0, 100));
}
