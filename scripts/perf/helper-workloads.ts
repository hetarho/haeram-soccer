/** Shared entry copied unchanged into each side of the helper-protocol A/B benchmark. */
import { canonical } from '../../packages/contracts/src/index';
import {
  createWorld,
  MATCH_MODEL_RELEASE,
  advanceDays,
  prepareRound,
  completeRound,
} from '../../packages/engine/src/index';
import { currentDay } from '../../packages/engine/src/calendar';
import { HelperPool, playDay } from '../../apps/web/src/runtime/helperPool';
import { serve } from '../../apps/web/src/runtime/fixtureHelper';
import type { World } from '../../packages/contracts/src/types';
export { canonical, HelperPool, serve };
export function found(seed: string) {
  const w = createWorld(
    { country: 'ENG', name: 'Perf Helpers', color: '#284e35', seed, level: 'easy' },
    MATCH_MODEL_RELEASE,
  );
  // Synthetic funding keeps this throughput workload active; no business/fixture step is skipped.
  w.cash = '99999999999';
  return w;
}
export async function day(w: World, pool: HelperPool) {
  if (w.critical) {
    delete w.critical;
    w.revision++;
  } // Same acknowledgement as the host.
  const year = w.year,
    before = currentDay(w),
    own = w.ownMatches.length;
  await playDay(pool, w, false, { advanceDays, prepareRound, completeRound });
  if (w.bankrupt || (year === w.year && before === currentDay(w)))
    throw new Error('Helper benchmark did not advance a complete day');
  return w.ownMatches.length > own ? 'own' : 'other';
}
