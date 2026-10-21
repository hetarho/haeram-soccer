/**
 * Aggregate-path measurement (→MATCH-22/26/28/29, docs/MATCH-MODEL-CONTRACT.md): the candidate
 * aggregate adapter's samples through the shared registry (scripts/lib/match-parity.ts). It starts
 * with MATCH-29's tactic-pairing verdicts, the same evaluator scripts/grid-bands.ts --report runs
 * on the detailed engine; T284 adds the comparison against that detailed reference. It reads the
 * engine's exported path and never changes the production dispatch.
 *
 *   pnpm exec tsx scripts/match-parity.ts --tactics [--partition calibration|validation]
 *     [--round N] [--matches N] [--out FILE]
 *   default: calibration partition, round 0, the core condition's calibration size; prints the
 *   verdicts and writes them only when --out names a file
 *
 * The aggregate path takes no tactic override, so its samples are the core condition's equal
 * top-tier pairs with each club on its own tactic (CORPUS_CONFIG core): a pairing or venue that
 * assignment leaves short of samples is reported insufficient, never passed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Fixture, World } from '../packages/contracts/src/types';
import { prepareMatch, rating } from '../packages/engine/src/index';
import {
  aggregateRecord,
  matchdayRosters,
  playAggregate,
  type AggregateMatch,
} from '../packages/engine/src/aggregate/engine';
import { inMatchFatigue } from '../packages/engine/src/grid/changes';
import { eraRules, type DecideRule } from '../packages/engine/src/grid/setup';
import { coreFixturePairs } from './grid-bands';
import {
  calibrationSize,
  conditionOf,
  CORPUS_CONFIG,
  corpusFixtureId,
  describeTacticPairings,
  MATCH_PARITY_VERSION,
  tacticPairingVerdicts,
  type MatchSample,
  type Partition,
} from './lib/match-parity';

/**
 * Each side's freshness at the final whistle (→MATCH-29): 100 minus the mean in-match fatigue the
 * aggregate planner holds for the lines then on the pitch — the shared rule (grid/changes.ts
 * `inMatchFatigue`) over the minutes since the line's last stint began, as the planner
 * (aggregate/participation.ts) counts them.
 */
export function aggregateFreshness(match: AggregateMatch): [number, number] {
  const { length, stints } = match.participation;
  const side = (s: 0 | 1) => {
    const plan = match.plan.sides[s];
    const since = new Map<number, number>();
    for (const x of stints[s])
      if (x.to === length) since.set(x.line, Math.max(since.get(x.line) ?? x.from, x.from));
    const fatigue = [...since].map(([line, from]) => {
      const c = plan.candidates[line]!;
      return inMatchFatigue(c.fatigue, c.stamina, length - from, plan.pressing, plan.drain);
    });
    return 100 - fatigue.reduce((a, b) => a + b, 0) / fatigue.length;
  };
  return [side(0), side(1)];
}

/**
 * The aggregate adapter: one fixture on the candidate aggregate path, as `simulateAggregate` plays
 * it, as a sample the shared reports read.
 */
export function aggregateSample(
  w: World,
  f: Fixture,
  condition: string,
  decide?: DecideRule,
): MatchSample {
  const prepared = prepareMatch(w, f);
  const rosters = matchdayRosters(w, f, prepared, eraRules(f.year));
  const match = playAggregate(w, f, prepared, rosters, decide);
  const [home, away] = prepared.teams;
  return {
    record: aggregateRecord(f, rosters, match),
    incidentsTracked: true,
    condition,
    // Match strength of two clubs nobody owns: XI ratings and home ground (MATCH-2).
    gap: rating(w, home, f) + 3 - rating(w, away, f),
    freshness: aggregateFreshness(match),
  };
}

/** The core condition's fixtures on the aggregate path, each club on its own tactic. */
export function aggregateCoreSamples(partition: Partition, round: number, count: number) {
  const core = conditionOf('core:equal-top-tier');
  const { fixture } = core.params as {
    fixture: { year: number; round: number; kind: Fixture['kind'] };
  };
  const pairs = coreFixturePairs();
  return Array.from({ length: count }, (_, i) => {
    const { w, home, away } = pairs[i % pairs.length]!;
    const f: Fixture = {
      ...w.fixtures[0]!,
      ...fixture,
      id: corpusFixtureId(partition, core.id, i, round),
      home: home.id,
      away: away.id,
    };
    return aggregateSample(w, f, core.id);
  });
}

const args = process.argv.slice(2);
const text = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
if (process.argv[1]?.endsWith('scripts/match-parity.ts')) {
  if (!args.includes('--tactics')) {
    console.log('usage: pnpm exec tsx scripts/match-parity.ts --tactics [options]');
  } else {
    const partition = text('partition', 'calibration') as Partition;
    if (!(partition in CORPUS_CONFIG.partitions)) throw new Error(`unknown partition ${partition}`);
    const round = Number(text('round', '0'));
    const core = conditionOf('core:equal-top-tier');
    const count = Number(text('matches', String(calibrationSize(core))));
    const started = performance.now();
    const samples = aggregateCoreSamples(partition, round, count);
    const tacticPairings = tacticPairingVerdicts(samples);
    const report = {
      kind: 'aggregate-tactic-pairings',
      version: MATCH_PARITY_VERSION,
      path: 'aggregate (prepareMatch + matchdayRosters + playAggregate + aggregateRecord)',
      condition: core.id,
      tacticAssignment: 'club',
      partition,
      round,
      seeds: `${corpusFixtureId(partition, core.id, 0, round)} … ${count - 1}`,
      command: `pnpm exec tsx scripts/match-parity.ts ${args.join(' ')}`,
      tacticPairings,
    };
    console.log(
      `aggregate path, ${core.id}, ${count} matches in ${((performance.now() - started) / 1000).toFixed(1)} s; venues ${JSON.stringify(tacticPairings.venues)}`,
    );
    for (const line of describeTacticPairings(tacticPairings)) console.log(line);
    const out = text('out', '');
    if (out) {
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, JSON.stringify(report, null, 1) + '\n');
      console.log(`wrote ${out}`);
    }
  }
}
