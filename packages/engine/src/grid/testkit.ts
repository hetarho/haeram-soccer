/**
 * Test helper (not exported from the engine index): a grid state between two top-tier NPC clubs
 * with chosen tactics, in a career taken over under `release` (the switch as it stands, by
 * default).
 */
import type { Fixture, Tactic, World } from '../../../contracts/src/types';
import { MATCH_MODEL_RELEASE, type MatchModelRelease } from '../index';
import { buildGridSetup, type GridSetup } from './setup';
import { createState, type GridState } from './state';
import { careerWorld } from '../career.testkit';

export interface Kit {
  w: World;
  f: Fixture;
  setup: GridSetup;
  state: GridState;
}

export function gridKit(
  tactics: [Tactic, Tactic] = ['balanced', 'balanced'],
  seed = 'grid-lab',
  release: MatchModelRelease = MATCH_MODEL_RELEASE,
): Kit {
  return gridKitFromWorld(careerWorld({ seed }, release), tactics);
}

/** Build a fresh match setup/state from a caller-owned mutable world, never a shared snapshot. */
export function gridKitFromWorld(
  w: World,
  tactics: [Tactic, Tactic] = ['balanced', 'balanced'],
): Kit {
  const [home, away] = w.clubs.filter(
    (c) => c.country === 'ENG' && c.tier === 0 && c.id !== w.playerClub,
  );
  const f: Fixture = { ...w.fixtures[0]!, id: 'grid-lab', home: home!.id, away: away!.id };
  const setup = buildGridSetup(w, f, { observe: false, recordPlayers: false, tactics });
  return { w, f, setup, state: createState(setup) };
}
