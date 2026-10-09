import type { Founding, World } from '../../contracts/src/types';
import { createBase } from './world';
import { prepareSeason, advanceRound, closeSeason } from './season';
import { basicStaff } from './staff';
import { MORALE_START } from './morale';
export * from './world';
export * from './season';
export * from './match';
export * from './primitives';
export * from './calendar';
export * from './scoring';
export * from './finance';
export * from './strategy';
export * from './training';
export * from './policy';
export * from './goals';
export * from './recruitment';
export * from './investment';
export * from './staff';
export * from './academy';
export * from './inbox';
export * from './transfers';
export * from './projection';
export * from './morale';
export * from './care';
export * from './styles';
export * from './vision';
export * from './synergy';
export * from './news';
export function createWorld(input: Founding) {
  const w = createBase(input);
  prepareSeason(w);
  // New clubs start with unpaid basic coaches; staff run training and the academy while the
  // owner answers transfer offers (the "important decisions" intervention level).
  w.staff = basicStaff(w);
  w.academy = { players: [] };
  w.delegation = { training: true, academy: true, transfers: false };
  w.bids = [];
  w.inbox = [];
  w.morale = MORALE_START;
  return w;
}
export function simulateSeason(w: World) {
  while (w.round < 46) advanceRound(w, undefined, false);
  closeSeason(w);
  w.revision++;
  return w;
}

export * from './operations';

export * from './economy';
export * from './europe';
