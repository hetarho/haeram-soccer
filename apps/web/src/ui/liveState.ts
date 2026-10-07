import type { World } from '../../../../packages/contracts/src/types';
import type { ClientState } from '../runtime/client';

/** Keep view subscriptions independent of the calendar and request/save bookkeeping. */
export function worldSelector(keys: (keyof World)[]) {
  let selected: World | undefined;
  return (state: ClientState) => {
    const world = state.view?.world;
    if (!world) return (selected = undefined);
    if (!selected || selected.id !== world.id || keys.some((key) => selected![key] !== world[key]))
      selected = world;
    return selected;
  };
}
export const selectMatchWorld = worldSelector(['clubs', 'playerClub']);
export const selectLeagueWorld = worldSelector([
  'clubs',
  'tables',
  'fixtures',
  'rankHistory',
  'year',
  'round',
  'lower',
  'playerClub',
]);
export const selectScorerWorld = worldSelector(['clubs', 'scorerSeason', 'year', 'playerClub']);
export const selectStrategyWorld = worldSelector([
  'cash',
  'players',
  'lineup',
  'manager',
  'tactic',
  'requested',
  'fixtures',
  'clubs',
  'playerClub',
  'year',
  'round',
]);
