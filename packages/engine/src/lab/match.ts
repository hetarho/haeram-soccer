/**
 * A match lab fixture (→LAB-4): two lab sides played by the detailed engine's latest release
 * revision, the left side at home in even matches, each match seeded from the run seed and its index.
 */
import type { Club, Fixture, MatchPlayback, World } from '../../../contracts/src/types';
import { MATCH_MODEL_REVISION } from '../../../contracts/src/match-model';
import { createWorld } from '../founding';
import { playGrid, type GridResult } from '../grid/engine';
import { buildFrames } from '../grid/playback';
import { buildGridSetup, type GridSetup } from '../grid/setup';
import { LAB_CONFIG, type LabSide } from './sides';

export interface LabWorld {
  w: World;
  /** Two top-tier clubs nobody owns that host the lab sides; their own squads never play. */
  hosts: [Club, Club];
}

/** How the scoreboard names the hosts (→LAB-9); their ids and kits stay the clubs' own. */
export const LAB_HOST_NAMES = [
  { name: '좌측 팀', short: '좌측' },
  { name: '우측 팀', short: '우측' },
] as const;

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
  const hosts: [Club, Club] = [a!, b!];
  hosts.forEach((club, side) => Object.assign(club, LAB_HOST_NAMES[side]));
  return { w, hosts };
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

/** Match `index`'s setup, the sides placed home and away as its fixture has them. */
export function labSetup(
  lab: LabWorld,
  sides: readonly [LabSide, LabSide],
  runSeed: string,
  index: number,
  observe: boolean,
): GridSetup {
  const [home, away] = leftAtHome(index) ? [sides[0], sides[1]] : [sides[1], sides[0]];
  return buildGridSetup(lab.w, labFixture(lab, runSeed, index), {
    observe,
    recordPlayers: true,
    model: MATCH_MODEL_REVISION,
    lab: { rosters: [home.players, away.players], tactics: [home.tactic, away.tactic] },
  });
}

/** Plays match `index`; the result's sides are home and away as the fixture has them. */
export function playLabMatch(
  lab: LabWorld,
  sides: readonly [LabSide, LabSide],
  runSeed: string,
  index: number,
  observe = false,
): GridResult {
  return playGrid(labSetup(lab, sides, runSeed, index, observe));
}

/**
 * 관전 (→LAB-9): match 0 of `seed`, the left side at home, with its frames and matchday squads as
 * the game's match view reads them; observing it changes nothing it records (→MATCH-7).
 */
export function watchLabMatch(
  lab: LabWorld,
  sides: readonly [LabSide, LabSide],
  seed: string,
): MatchPlayback {
  const setup = labSetup(lab, sides, seed, 0, true);
  const result = playGrid(setup);
  return {
    record: result.record,
    frames: buildFrames(result, setup, lab.w.seed),
    squads: setup.rosters,
  };
}
