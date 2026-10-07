import type { Founding, World } from '../../contracts/src/types';
import { createBase } from './world';
import { prepareSeason, advanceRound, closeSeason } from './season';
export * from './world';
export * from './season';
export * from './match';
export * from './primitives';
export function createWorld(input: Founding) {
  const w = createBase(input);
  prepareSeason(w);
  return w;
}
export function simulateSeason(w: World) {
  while (w.round < 46) advanceRound(w);
  closeSeason(w);
  w.revision++;
  return w;
}

export * from './operations';
