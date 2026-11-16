/**
 * The retained replay career's starting world, built once per source fingerprint. The batch and CI
 * warm-up (`scripts/warm-worlds.ts`, T771) builds it outside the replay case's timer.
 */
import { RESPONSIBILITY_KEYS } from '../../packages/engine/src/responsibilities';
import { advanceDays, currentDay } from '../../packages/engine/src/index';
import { cachedWorld } from './cached-world';
import { retainedWorkload } from './retained-workload';

export const retainedReplaySeed = () =>
  cachedWorld('seed:retained', () => {
    const seed = retainedWorkload().w;
    for (const key of RESPONSIBILITY_KEYS) seed.settings!.responsibilities[key] = 'delegated';
    // Cross the next seasonal boundary, keeping its outstanding promise.
    advanceDays(seed, 322 - currentDay(seed), undefined, false);
    return seed;
  });
