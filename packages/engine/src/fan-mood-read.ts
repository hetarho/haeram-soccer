/** Numeric fan-mood rules shared by settlement and pre-commit reads (→OWNER-12). */
import type { World } from '../../contracts/src/types';
import type { FanDisposition } from '../../contracts/src/owner';
import { FAN_DISPOSITION, FAN_MOOD } from './owner-config';
import { hasTrait } from './owner-traits';
import { clamp } from './primitives';

/** `amount` as a percentage of `turnover`, to hundredths; undefined without a turnover. */
export function percentOf(amount: bigint, turnover: bigint | undefined) {
  if (turnover === undefined || turnover <= 0n) return undefined;
  return Number((amount * 10000n) / turnover) / 100;
}

/** Stored mood after one disposition factor, the friends drop factor, clamp and rounding; never mutates. */
export function fanMoodAfter(
  w: Pick<World, 'owner'>,
  change: number,
  disposition?: keyof FanDisposition,
) {
  const owner = w.owner!,
    share = disposition
      ? (owner.fanDisposition?.[disposition] ?? FAN_DISPOSITION.neutral)
      : undefined,
    adjusted =
      share === undefined
        ? change
        : change * (FAN_DISPOSITION.baseFactor + (FAN_DISPOSITION.shareFactor * share) / 100),
    scaled = adjusted < 0 && hasTrait(w, 'fansFriend') ? adjusted * FAN_MOOD.friendly : adjusted,
    before = owner.fanMood;
  return Math.round(clamp(before + scaled, FAN_MOOD.min, FAN_MOOD.max) * 100) / 100;
}
