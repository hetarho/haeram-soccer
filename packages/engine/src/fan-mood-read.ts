/** Unchanged numeric fan-mood rules shared by settlement and pre-commit reads (→OWNER-12). */
import type { World } from '../../contracts/src/types';
import { FAN_MOOD } from './owner-config';
import { hasTrait } from './owner-traits';
import { clamp } from './primitives';

/** `amount` as a percentage of `turnover`, to hundredths; undefined without a turnover. */
export function percentOf(amount: bigint, turnover: bigint | undefined) {
  if (turnover === undefined || turnover <= 0n) return undefined;
  return Number((amount * 10000n) / turnover) / 100;
}

/** Stored mood after the existing drop factor, clamp and hundredths rounding; never mutates. */
export function fanMoodAfter(w: Pick<World, 'owner'>, change: number) {
  const owner = w.owner!,
    scaled = change < 0 && hasTrait(w, 'fansFriend') ? change * FAN_MOOD.friendly : change,
    before = owner.fanMood;
  return Math.round(clamp(before + scaled, FAN_MOOD.min, FAN_MOOD.max) * 100) / 100;
}
