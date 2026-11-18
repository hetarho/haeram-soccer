import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { careerEnded } from '../../../packages/contracts/src/owner';
import type { World } from '../../../packages/contracts/src/types';
import { currentDay, SEASON_END_DAY, SEASON_ROUNDS } from '../../../packages/engine/src/calendar';
import { groupKey } from '../../../packages/engine/src/league-fixtures';
import { defaultSettings, RESPONSIBILITY_KEYS } from '../../../packages/engine/src/responsibilities';
import { simulateRoundJob, type RoundJobResult } from '../../../packages/engine/src/round-jobs';
import { advanceDays, completeRound, prepareRound } from '../../../packages/engine/src/season';
import { takeOver } from '../../../packages/engine/src/takeover';
import { M } from '../../../packages/engine/src/match/record';
import { withCandidateModel } from '../../../tests/fixtures/worlds';
import { buildOutcomeTargetReport, hatTrickReading, type MatchSample } from '../../../scripts/lib/match-parity';
import { loadStartWorldFile } from '../../../scripts/lib/start-worlds';
import { conditionedMatch, readAggregateSeason, seasonsReport } from '../../../scripts/match-parity';

const [snapshot, output] = process.argv.slice(2);
assert(snapshot && output);
const world = loadStartWorldFile<World>(snapshot);
assert.equal(world.year, 1995);
assert.equal(world.round, 0);
const club = world.clubs.find((entry) => entry.country === 'ENG' && entry.tier === 3);
assert(club);
const previous = club.books?.seasons[0];
assert(previous?.year === 1994);
const lastTurnover = Number(previous.income);
assert(lastTurnover > 0);
const titleGroups = new Map<string, number>();
for (const entry of world.clubs) {
  if (entry.representative || entry.tier !== 0) continue;
  const key = groupKey(entry);
  titleGroups.set(key, (titleGroups.get(key) ?? 0) + 1);
}
const eligible = new Set(
  world.fixtures
    .filter((fixture) => fixture.kind === 'league' && titleGroups.get(fixture.groupKey!) === 20)
    .map((fixture) => fixture.id),
);
takeOver(world, club.id, { tier: 'oil', traits: [] });
world.settings = defaultSettings();
for (const key of RESPONSIBILITY_KEYS) world.settings.responsibilities[key] = 'delegated';
withCandidateModel(world, 'founding');

const curveSamples: MatchSample[] = [];
let hats = 0;
let scored = 0;
const year = world.year;
while (world.round < SEASON_ROUNDS && world.year === year) {
  let results: RoundJobResult[] | undefined;
  const prepared = prepareRound(
    world,
    (copy, jobs) => {
      results = jobs.map((job) => {
        const result = simulateRoundJob(copy, job);
        assert.notEqual(result.record.model, undefined);
        if (job.fixture.kind === 'league') {
          const { gap } = conditionedMatch(world, job.fixture);
          curveSamples.push({
            condition: 'lived:league',
            record: result.record,
            incidentsTracked: true,
            gap,
          });
        }
        if (eligible.has(job.fixture.id)) {
          hats += result.record.players.filter((player) => player.metrics[M.goals]! >= 3).length;
          scored++;
        }
        return result;
      });
    },
    false,
  );
  if (prepared) completeRound(world, results);
  else advanceDays(world, 1, undefined, false);
  assert(!world.critical && !careerEnded(world));
}
assert.equal(world.year, year);
assert.equal(world.round, SEASON_ROUNDS);
const season = readAggregateSeason(world);
assert(season.divisions.length > 0 && scored > 0);
assert(season.divisions.every((division) => division.matches === 380));
const comparison = seasonsReport([season]);
const outcomes = buildOutcomeTargetReport(curveSamples);
advanceDays(world, SEASON_END_DAY + 1 - currentDay(world), undefined, false);
const closed = world.history.find((row) => row.year === year);
assert(closed);
const ownerIncome = Number(closed.income);
writeFileSync(
  output,
  JSON.stringify(
    {
      snapshot,
      seed: world.seed,
      year,
      scored,
      eligible: eligible.size,
      leagueFixturesMeasured: curveSamples.length,
      outcomes,
      season,
      comparison,
      hatTricks: { count: hats, verdict: hatTrickReading(hats, scored, { family: 'core' }) },
      income: {
        club: club.id,
        lastTurnover,
        ownerIncome,
        change: ownerIncome / lastTurnover - 1,
      },
    },
    null,
    2,
  ) + '\n',
);
