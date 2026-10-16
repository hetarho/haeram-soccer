import type { World } from '../../contracts/src/types';
import { staffMember } from './staff';
import { currentDay } from './calendar';
import { transferWindow } from './transfers';

export const directorTrait = (w: World) => staffMember(w, 'director')?.trait;
export const bidExtra = (w: World) => (w.direction?.finance === 'aggressive' ? 10 : 0);
export const bidCeiling = (w: World) => 100 + bidExtra(w);
export const haggling = (w: World) =>
  directorTrait(w) === 'negotiator' && (transferWindow(w, currentDay(w)).daysLeft ?? Infinity) > 6;
/** Asking already includes the negotiator's discount. Aggression adds points, not a multiplier. */
export function staffBidShare(w: World, previous = 0) {
  const trait = directorTrait(w);
  const base =
    trait === 'negotiator'
      ? haggling(w)
        ? Math.min(100, 80 + previous * 5)
        : 100
      : trait === 'closer'
        ? 110
        : 100;
  return base + bidExtra(w);
}
