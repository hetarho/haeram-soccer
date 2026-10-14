import type { Founding, World } from '../../contracts/src/types';
import { createBase } from './world';
import { prepareSeason, advanceRound, closeSeason } from './season';
import { basicStaff } from './staff';
import { MORALE_START } from './morale';
import { NEW_CLUB_INTERVENTION } from './intervention';
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
export * from './coaching';
export * from './fans';
export * from './facilities';
export * from './academy';
export * from './inbox';
export * from './transfers';
export * from './projection';
export * from './morale';
export * from './care';
export * from './styles';
export * from './build';
export * from './synergy';
export * from './news';
export * from './knockout';
export * from './cups';
export * from './ratings';
export * from './dynamics';
export * from './careers';
export * from './contracts';
export * from './hiring';
export * from './direction';
export * from './activation';
export * from './intervention';
export * from './orders';
export * from './coach-training';
export function createWorld(input: Founding) {
  const w = createBase(input);
  prepareSeason(w);
  // New clubs start with unpaid basic coaches at the "important decisions" intervention level:
  // the staff run training, the academy and contract talks, the owner the rest (→STAFF-13).
  w.staff = basicStaff(w);
  w.academy = { players: [] };
  w.intervention = NEW_CLUB_INTERVENTION;
  w.bids = [];
  w.inbox = [];
  w.morale = MORALE_START;
  return w;
}
export function simulateSeason(w: World) {
  while (w.round < 46 && !w.bankrupt) advanceRound(w, undefined, false);
  // A bankrupt club's career is over (→ECON-24); its last season never closes.
  if (w.bankrupt) return w;
  closeSeason(w);
  w.revision++;
  return w;
}

export * from './operations';
export * from './ops-commercial';
export * from './ops-squad';
export * from './ops-staff';
export * from './settlement';
export * from './managerMarket';

export * from './economy';
export * from './europe';
