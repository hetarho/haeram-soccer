import type { ProjectedWorld } from '../runtime/protocol';
import type { ClientState } from '../runtime/client';

/** Keep view subscriptions independent of the calendar and request/save bookkeeping. */
export function worldSelector(keys: (keyof ProjectedWorld)[]) {
  let selected: ProjectedWorld | undefined;
  return (state: ClientState) => {
    const world = state.view?.world;
    if (!world) return (selected = undefined);
    if (!selected || selected.id !== world.id || keys.some((key) => selected![key] !== world[key]))
      selected = world;
    return selected;
  };
}
export const selectMatchWorld = worldSelector(['clubs', 'playerClub', 'players']);
export const selectLeagueWorld = worldSelector([
  'clubs',
  'tables',
  'fixtures',
  'rankHistory',
  'year',
  'round',
  'lower',
  'playerClub',
  'europe',
  'ownMatches',
  'players',
]);
export const selectScorerWorld = worldSelector(['clubs', 'scorerSeason', 'year', 'playerClub']);
export const selectReviewWorld = worldSelector([
  'history',
  'clubs',
  'players',
  'playerClub',
  'year',
]);
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
