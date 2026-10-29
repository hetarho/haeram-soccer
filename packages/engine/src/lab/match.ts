/**
 * A match lab fixture (→LAB-4): two lab sides played by the detailed engine's latest release
 * revision, the left side at home in even matches, each match seeded from the run seed and its index.
 */
import type { Club, Fixture, World } from '../../../contracts/src/types';
import { MATCH_MODEL_REVISION } from '../../../contracts/src/match-model';
import { createWorld } from '../founding';
import { playGrid, type GridResult } from '../grid/engine';
import { buildGridSetup } from '../grid/setup';
import { LAB_CONFIG, type LabSide } from './sides';

export interface LabWorld {
  w: World;
  /** Two top-tier clubs nobody owns that host the lab sides; their own squads never play. */
  hosts: [Club, Club];
}

/** The one world a lab worker builds once and plays every lab match in. */
export function createLabWorld(): LabWorld {
  const w = createWorld({
    country: 'ENG',
    name: 'Match Lab',
    color: '#2a5d8f',
    seed: 'lab-world',
    level: 'normal',
  });
  const [a, b] = w.clubs.filter(
    (c) => c.country === 'ENG' && c.tier === 0 && c.id !== w.playerClub,
  );
  return { w, hosts: [a!, b!] };
}

/** Whether the left side is at home in match `index` (0-based). */
export const leftAtHome = (index: number) => index % 2 === 0;

/** Match `index` of a run: its own fixture id (the match's seed), the lab season, league round 1. */
export function labFixture(lab: LabWorld, runSeed: string, index: number): Fixture {
  const [home, away] = leftAtHome(index) ? lab.hosts : [lab.hosts[1], lab.hosts[0]];
  return {
    ...lab.w.fixtures[0]!,
    id: `lab:${runSeed}:${index}`,
    year: LAB_CONFIG.year,
    round: 1,
    kind: 'league',
    home: home.id,
    away: away.id,
  };
}

/** Plays match `index`; the result's sides are home and away as the fixture has them. */
export function playLabMatch(
  lab: LabWorld,
  sides: readonly [LabSide, LabSide],
  runSeed: string,
  index: number,
  observe = false,
): GridResult {
  const [home, away] = leftAtHome(index) ? [sides[0], sides[1]] : [sides[1], sides[0]];
  return playGrid(
    buildGridSetup(lab.w, labFixture(lab, runSeed, index), {
      observe,
      recordPlayers: true,
      model: MATCH_MODEL_REVISION,
      lab: { rosters: [home.players, away.players], tactics: [home.tactic, away.tactic] },
    }),
  );
}
