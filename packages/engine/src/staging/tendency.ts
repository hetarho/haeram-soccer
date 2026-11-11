/** Pure staging coefficients; no selected locale, world or sporting random stream. */
import { STAGING_CONFIG } from './config';
import { clamp } from './vec';

/** Three anchors keep neutral exact even when the two halves have different slopes. */
export function tendency(value: number, low: number, high: number): number {
  const v = clamp(value, 0, 100);
  return v <= 50 ? low + (1 - low) * (v / 50) : 1 + (high - 1) * ((v - 50) / 50);
}

export function disciplineScale(value: number): number {
  const d = STAGING_CONFIG.motion.tendency.discipline;
  return tendency(value, d.max, d.min);
}

export function pressingReach(value: number): number {
  const r = STAGING_CONFIG.motion.tendency.pressing.reach;
  return tendency(value, r.min, r.max);
}

export function roleFreedom(value: number): number {
  return tendency(value, 0, STAGING_CONFIG.motion.tendency.freedom.over);
}
