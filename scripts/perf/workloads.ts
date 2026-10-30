/**
 * The workloads of the paired A/B bench (`ab.mjs`). esbuild bundles this file once per tree, a
 * copy placed in that tree, so one process can load a baseline and a candidate side by side and
 * alternate them rep by rep (`pair.mjs`).
 *
 * Every rep replays the same fixed inputs, so the reps of one side do equal work:
 * - `grid`: the detailed engine on one of `GRID_FIXTURES` top-tier fixtures a rep, in turn (setup
 *   built per rep, as an own match is: no observation, player records on);
 * - `aggregate`: `simulateAggregate` on the first `AGGREGATE_FIXTURES` fixtures without the own club;
 * - `day`: one automatic-play day of a founding (`advanceDays(w, 1)`); its reps are successive days,
 *   which the two sides step in lockstep so a pair is the same day on both.
 *
 * `digest()` hashes the recorded outputs (the world itself for `day`), which a result-identical
 * candidate must share with its baseline.
 */
import { createHash } from 'node:crypto';
import * as engine from '../../packages/engine/src/index';
import { buildGridSetup } from '../../packages/engine/src/grid/setup';
import { playGrid } from '../../packages/engine/src/grid/engine';
import { simulateAggregate } from '../../packages/engine/src/aggregate/engine';
import { canonical } from '../../packages/contracts/src/index';
import { currentDay } from '../../packages/engine/src/calendar';
import type { Fixture, World } from '../../packages/contracts/src/types';

const GRID_FIXTURES = 3;
const AGGREGATE_FIXTURES = 150;

export interface Workload {
  /** One rep; `record` adds its outputs to the digest. Returns a label of what the rep was. */
  rep(record: boolean): string;
  digest(): string;
  /** Reps before the inputs repeat: the first `cycle` measured reps are recorded. */
  cycle: number;
}

/** Main-thread CPU milliseconds (waits for a core on a loaded host are not counted). */
export function cpuMs(): number {
  const u = process.threadCpuUsage();
  return (u.user + u.system) / 1000;
}

function world(seed: string): World {
  return engine.createWorld(
    { country: 'ENG', name: 'Perf Town', color: '#284e35', seed, level: 'easy' },
    engine.MATCH_MODEL_RELEASE,
  );
}

function otherFixtures(w: World, count: number, filter: (f: Fixture) => boolean): Fixture[] {
  return w.fixtures
    .filter((f) => f.home !== w.playerClub && f.away !== w.playerClub && filter(f))
    .slice(0, count);
}

export function workloadOf(name: string, seed: string): Workload {
  const hash = createHash('sha256');
  const w = world(seed);
  const digest = () => hash.digest('hex').slice(0, 16);
  if (name === 'grid') {
    const top = new Set(
      w.clubs.filter((c) => c.country === 'ENG' && c.tier === 0).map((c) => c.id),
    );
    const fixtures = otherFixtures(w, GRID_FIXTURES, (f) => top.has(f.home) && top.has(f.away));
    // One fixture a rep, in turn: short reps keep the two sides of a pair close in time, so a load
    // swing lands on both (measured 261028: three fixtures a rep left pairs ±6% apart).
    let next = 0;
    return {
      digest,
      cycle: fixtures.length,
      rep(record) {
        const f = fixtures[next++ % fixtures.length]!;
        const result = playGrid(buildGridSetup(w, f, { observe: false, recordPlayers: true }));
        if (record) hash.update(canonical(result.record));
        return 'grid';
      },
    };
  }
  if (name === 'aggregate') {
    const fixtures = otherFixtures(w, AGGREGATE_FIXTURES, () => true);
    return {
      digest,
      cycle: 1,
      rep(record) {
        for (const f of fixtures) {
          const playback = simulateAggregate(w, f);
          if (record) hash.update(canonical(playback.record));
        }
        return 'aggregate';
      },
    };
  }
  if (name === 'day') {
    // Keep the campaign running, including business/fixtures. A blocked critical is explicitly
    // acknowledged as in the host, rather than repeatedly timing a day that did not advance.
    w.cash = '99999999999';
    return {
      digest: () => hash.update(canonical(w)).digest('hex').slice(0, 16),
      cycle: 0,
      rep() {
        if (w.critical) {
          delete w.critical;
          w.revision++;
        }
        const own = w.ownMatches.length,
          year = w.year,
          before = currentDay(w);
        engine.advanceDays(w, 1, undefined, false);
        if (w.bankrupt || (year === w.year && before === currentDay(w)))
          throw new Error('Day benchmark did not advance a complete day');
        return w.ownMatches.length > own ? 'own' : 'other';
      },
    };
  }
  throw new Error(`unknown workload ${name}`);
}
