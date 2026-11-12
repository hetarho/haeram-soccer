import { staffAuthority } from './testing';
import type { World } from '../../contracts/src/types';
import { advanceRound } from './index';
import { careerWorld } from './career.testkit';

/** The test club, on the released model: staff, not the match model, is the subject. */
export function world(seed = 'coaching-staff') {
  const w = careerWorld({ seed });
  w.settings = staffAuthority(2);
  w.cash = '999999999';
  return w;
}

/** Plays the season up to its last round as `simulateSeason` does, which then plays that round and closes. */
export function lastRound(w: World) {
  while (w.round < 45 && !w.bankrupt) advanceRound(w, undefined, false);
  return w;
}
