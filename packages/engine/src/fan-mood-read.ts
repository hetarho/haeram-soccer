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

/** Apply the disposition and friends effects to a stated mood driver. */
export function fanMoodChange(
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
    scaled = adjusted < 0 && hasTrait(w, 'fansFriend') ? adjusted * FAN_MOOD.friendly : adjusted;
  return scaled;
}

/** Mood after the driver, bounded and rounded to the stored precision. */
export function fanMoodAfter(
  w: Pick<World, 'owner'>,
  change: number,
  disposition?: keyof FanDisposition,
) {
  const mood = w.owner!.fanMood + fanMoodChange(w, change, disposition);
  return Math.round(clamp(mood, FAN_MOOD.min, FAN_MOOD.max) * 100) / 100;
}
