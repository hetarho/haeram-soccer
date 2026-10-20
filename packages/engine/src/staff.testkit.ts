import { legacySettings } from './responsibilities';
import { simulatedWorld } from '../../../tests/fixtures/worlds';
import type { Founding, World } from '../../contracts/src/types';
import { advanceRound } from './index';

/** The test club; `found` is `createWorld` for a world only searched through, so it is not kept on disk. */
export function world(seed = 'coaching-staff', found: (input: Founding) => World = simulatedWorld) {
  const w = found({
    country: 'ENG',
    name: 'Bootroom Rovers',
    color: '#334455',
    seed,
    level: 'easy' as const,
  });
  w.settings = legacySettings(2);
  w.cash = '999999999';
  return w;
}

/** Plays the season up to its last round as `simulateSeason` does, which then plays that round and closes. */
export function lastRound(w: World) {
  while (w.round < 45 && !w.bankrupt) advanceRound(w, undefined, false);
  return w;
}
