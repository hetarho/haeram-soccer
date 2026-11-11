import type { Position, RoleId, Tactic } from '../../contracts/src/types';

/** A formation's slot: the position played and the role the manager asks of it. */
export interface Slot {
  position: Position;
  role: RoleId;
}
const slot = (position: Position, role: RoleId): Slot => ({ position, role });
/**
 * The formation each applied tactic plays (→STAFF-22), slot 0 the goalkeeper, then the DF, MF and
 * FW lines, each left to right.
 */
export const FORMATIONS: Record<Tactic, { name: string; slots: readonly Slot[] }> = {
  possession: {
    name: '4-3-3',
    slots: [
      slot('GK', 'sweeperKeeper'),
      slot('LB', 'invertedFullBack'),
      slot('CB', 'ballPlayingDefender'),
      slot('CB', 'coverDefender'),
      slot('RB', 'overlappingFullBack'),
      slot('DM', 'anchor'),
      slot('CM', 'mezzala'),
      slot('CM', 'deepLyingPlaymaker'),
      slot('LW', 'invertedWinger'),
      slot('ST', 'falseNine'),
      slot('RW', 'traditionalWinger'),
    ],
  },
  press: {
    name: '4-2-3-1',
    slots: [
      slot('GK', 'sweeperKeeper'),
      slot('LB', 'overlappingFullBack'),
      slot('CB', 'stopper'),
      slot('CB', 'coverDefender'),
      slot('RB', 'overlappingFullBack'),
      slot('DM', 'ballWinner'),
      slot('CM', 'boxToBox'),
      slot('AM', 'shadowStriker'),
      slot('LW', 'invertedWinger'),
      slot('ST', 'completeForward'),
      slot('RW', 'invertedWinger'),
    ],
  },
  counter: {
    name: '4-4-2',
    slots: [
      slot('GK', 'shotStopper'),
      slot('LB', 'defensiveFullBack'),
      slot('CB', 'stopper'),
      slot('CB', 'coverDefender'),
      slot('RB', 'defensiveFullBack'),
      slot('LM', 'wideMidfielder'),
      slot('CM', 'boxToBox'),
      slot('CM', 'deepLyingPlaymaker'),
      slot('RM', 'wideMidfielder'),
      slot('ST', 'targetMan'),
      slot('ST', 'poacher'),
    ],
  },
  balanced: {
    name: '3-5-2',
    slots: [
      slot('GK', 'shotStopper'),
      slot('LWB', 'defensiveWingBack'),
      slot('CB', 'stopper'),
      slot('CB', 'coverDefender'),
      slot('CB', 'ballPlayingDefender'),
      slot('RWB', 'attackingWingBack'),
      slot('DM', 'anchor'),
      slot('CM', 'boxToBox'),
      slot('CM', 'mezzala'),
      slot('ST', 'targetMan'),
      slot('ST', 'poacher'),
    ],
  },
};
