import type { World } from '../../contracts/src/types';
import { simulatedWorld } from '../../../tests/fixtures/worlds';
import { advanceRound } from './index';

/** The academy club on the released model: youth, not the match model, is the subject. */
export function world(seed = 'youth-academy') {
  const w = simulatedWorld({ country: 'ENG', seed });
  w.cash = '999999999';
  return w;
}

export function lastRound(w: World) {
  while (w.round < 45 && !w.bankrupt) advanceRound(w, undefined, false);
  return w;
}
