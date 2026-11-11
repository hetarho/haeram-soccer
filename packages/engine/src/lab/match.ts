import { message as sourceMessage } from '../../../contracts/src/messages';
/**
 * A match lab fixture (→LAB-4): generated sides settled by the result path, the left side at home in even matches, each match seeded from the run seed and its index.
 */
import type { Club, Fixture, MatchPlayback, World } from '../../../contracts/src/types';
import { playAggregate, aggregateRecord } from '../aggregate/engine';
import type { AggregateAttributionTrace } from '../aggregate/types';
import { prepareMatch } from '../match';
import { matchDetail } from '../script/detail';
import { ownMatchPlayback } from '../script/playback';
import { appearanceForFixture } from '../match-appearance';
import { LAB_CONFIG, type LabSide } from './sides';
import { historyWorld } from '../history';
import { withDefaultStaging } from '../tunables';

const LAB_MODEL = 'scripted-aggregate-11' as const;

export interface LabWorld {
  w: World;
  /** Two top-tier clubs nobody owns that host the lab sides; their own squads never play. */
  hosts: [Club, Club];
}

/** How the scoreboard names the hosts (→LAB-9); their ids and kits stay the clubs' own. */
export const LAB_HOST_NAMES = [
  { name: sourceMessage('copy.LabPage.d192ee8a47'), short: sourceMessage('copy.match.9a1ee11a2c') },
  { name: sourceMessage('copy.LabPage.bb56f4ce84'), short: sourceMessage('copy.match.dbe322fd5d') },
] as const;

/**
 * The one world a lab worker builds once and plays every lab match in: a world nobody owns a club
 * in (→WORLD-13), since the lab sides play for two of its clubs and no own club is needed.
 */
export function createLabWorld(w = historyWorld('lab-world')): LabWorld {
  // The lab previews revision 11 before T838 activates it in careers.
  w.matchModel = {
    revision: LAB_MODEL,
    activated: { year: LAB_CONFIG.year, day: 0, revision: 0 },
    trackedFrom: { year: LAB_CONFIG.year, day: 0, round: 0 },
    coverage: 'founding',
  };
  const [a, b] = w.clubs.filter((c) => c.country === 'ENG' && c.tier === 0);
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

/** The generated rosters, without a manager, morale, cohesion or club-profile bend (LAB-2). */
export function labSetup(
  lab: LabWorld,
  sides: readonly [LabSide, LabSide],
  runSeed: string,
  index: number,
) {
  const ordered = leftAtHome(index) ? sides : ([sides[1], sides[0]] as const);
  const rosters = ordered.map((s) => [...s.players]) as [LabSide['players'], LabSide['players']];
  const f = labFixture(lab, runSeed, index);
  const prepared = prepareMatch(lab.w, f, undefined, LAB_MODEL, {
    xis: [rosters[0].slice(0, 11), rosters[1].slice(0, 11)],
    tactics: [ordered[0].tactic, ordered[1].tactic],
  });
  return { f, prepared, rosters };
}

/** Every run is settled on the result path, with revision 11's place attribution on. */
export function playLabMatch(
  lab: LabWorld,
  sides: readonly [LabSide, LabSide],
  runSeed: string,
  index: number,
  trace?: AggregateAttributionTrace,
) {
  return withDefaultStaging(() => {
    const { f, prepared, rosters } = labSetup(lab, sides, runSeed, index);
    const match = playAggregate(lab.w, f, prepared, rosters, undefined, undefined, trace);
    return { match, record: aggregateRecord(f, rosters, match, LAB_MODEL), rosters };
  });
}

/** Match 0, scripted and validated as an own match; the game's staging worker draws it later. */
export function watchLabMatch(
  lab: LabWorld,
  sides: readonly [LabSide, LabSide],
  seed: string,
): MatchPlayback {
  return withDefaultStaging(() => {
    const trace: AggregateAttributionTrace = { moves: [[], []], fouls: [[], []] };
    const { match, record, rosters } = playLabMatch(lab, sides, seed, 0, trace);
    return ownMatchPlayback(
      { ...record, appearance: appearanceForFixture(lab.w, labFixture(lab, seed, 0)) },
      rosters,
      () => matchDetail(match, rosters, trace),
      {
        managers: [lab.w.manager, lab.w.manager],
        seed: `${lab.w.seed}:${record.id}`,
        own: 0,
        observe: true,
      },
    );
  });
}
