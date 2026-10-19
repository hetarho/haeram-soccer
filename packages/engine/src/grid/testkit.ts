/** Test helper (not exported from the engine index): a grid state between two top-tier NPC clubs with chosen tactics. */
import type { Fixture, Tactic, World } from '../../../contracts/src/types';
import { createWorld } from '../index';
import { buildGridSetup, type GridSetup } from './setup';
import { createState, type GridState } from './state';

export interface Kit {
  w: World;
  f: Fixture;
  setup: GridSetup;
  state: GridState;
}

export function gridKit(
  tactics: [Tactic, Tactic] = ['balanced', 'balanced'],
  seed = 'grid-lab',
): Kit {
  const w = createWorld({
    country: 'ENG',
    name: 'Grid Lab',
    color: '#2a5d8f',
    seed,
    level: 'normal',
  });
  const [home, away] = w.clubs.filter(
    (c) => c.country === 'ENG' && c.tier === 0 && c.id !== w.playerClub,
  );
  const f: Fixture = { ...w.fixtures[0]!, id: 'grid-lab', home: home!.id, away: away!.id };
  const setup = buildGridSetup(w, f, { observe: false, recordPlayers: false, tactics });
  return { w, f, setup, state: createState(setup) };
}
