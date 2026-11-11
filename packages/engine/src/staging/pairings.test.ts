/** Full aggregate settlement, script writing and whole-match staging: host integration gate. */
import { beforeAll, expect, it } from 'vitest';
import type { Fixture, Tactic, World } from '../../../contracts/src/types';
import type { StagingSide } from '../../../contracts/src/match-script';
import { cachedWorld } from '../../../../tests/fixtures/cached-world';
import { conditionedMatch } from '../../../../scripts/match-parity';
import { playAggregate } from '../aggregate/engine';
import type { AggregateAttributionTrace } from '../aggregate/types';
import { careerWorld } from '../career.testkit';
import { SCRIPTED_RELEASE } from '../match-model-release';
import { matchDetail } from '../script/build';
import { writeScript } from '../script/write';
import { fitLines, stagingMetrics } from './measure';
import { advance, createStaging } from './staging';

const tactics: Tactic[] = ['possession', 'press', 'counter', 'balanced'];
const pairings = tactics.flatMap((home, i) =>
  tactics.slice(i).map((away) => [home, away] as const),
);
let world: World;
beforeAll(() => {
  // Before substitutes: this gate exercises tactics; T830 owns the incident-scene gate.
  world = cachedWorld(
    'staging-pairings-829',
    () => careerWorld({ seed: 'staging-pairings-829', year: 1960 }, SCRIPTED_RELEASE),
    { input: { year: 1960, release: SCRIPTED_RELEASE } },
  );
});

it.each(pairings)('writes and stages %s / %s exactly', (home, away) => {
  const clubs = world.clubs.filter(
    (c) => c.country === 'ENG' && c.tier === 0 && c.id !== world.playerClub,
  );
  const f: Fixture = {
    ...world.fixtures[0],
    id: `staging-829-${home}-${away}`,
    year: world.year,
    kind: 'league',
    home: clubs[0].id,
    away: clubs[1].id,
  };
  const { prepared, rosters } = conditionedMatch(world, f, { tactics: [home, away] });
  const trace: AggregateAttributionTrace = { moves: [[], []], fouls: [[], []] };
  const match = playAggregate(world, f, prepared, rosters, undefined, undefined, trace);
  const detail = matchDetail(match, rosters, trace);
  const written = writeScript(detail, f.id);
  expect('problems' in written ? written.problems : []).toEqual([]);
  if (!('script' in written)) throw new Error(f.id);
  const sides = detail.sides.map((side, t): StagingSide => ({
    tactic: side.tactic,
    players: side.lines.map((p, line) => ({
      line,
      slot: p.slot,
      role: p.role,
      pace: rosters[t].find((r) => r.id === p.id)!.attrs.pace,
      anticipation: 50,
      discipline: 50,
      pressing: 50,
      freedom: 50,
    })),
  })) as [StagingSide, StagingSide];
  const staged = advance(createStaging(written.script, sides), Infinity);
  expect(staged.done).toBe(true);
  const metrics = stagingMetrics(staged.frames, staged.events, written.script, sides);
  const fit = fitLines(staged.frames, staged.events, written.script, detail);
  console.info('T829 pairing', JSON.stringify({ home, away, metrics, fit }));
  expect(fit.slice(0, 3).map((m) => [m.id, m.value, m.pass])).toEqual([
    ['fit.exact', 0, true],
    ['fit.performed', 0, true],
    ['fit.recast', 0, true],
  ]);
  for (const id of [
    'kinematics.maxStep',
    'kinematics.outside',
    'ball.maxSpeed',
    'ball.ownerDistance',
    'events.reception',
  ])
    expect(metrics.find((m) => m.id === id)?.pass, `${f.id}/${id}`).toBe(true);
});
