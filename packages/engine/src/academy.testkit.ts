import type { World } from '../../contracts/src/types';
import { simulatedWorld } from '../../../tests/fixtures/worlds';
import { advanceRound } from './index';

export function world(seed = 'youth-academy') {
  const w = simulatedWorld({
    country: 'ENG',
    name: 'Nursery End',
    color: '#556b2f',
    seed,
    level: 'easy' as const,
  });
  w.cash = '999999999';
  return w;
}

export function lastRound(w: World) {
  while (w.round < 45 && !w.bankrupt) advanceRound(w, undefined, false);
  return w;
}
