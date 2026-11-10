/**
 * The workloads of the paired A/B bench (`ab.mjs`). esbuild bundles this file once per tree, a
 * copy placed in that tree, so one process can load a baseline and a candidate side by side and
 * alternate them rep by rep (`pair.mjs`).
 *
 * Every rep replays the same fixed inputs, so the reps of one side do equal work:
 * - `grid`: the detailed engine on one of `GRID_FIXTURES` top-tier fixtures a rep, in turn (setup
 *   built per rep, as an own match is: no observation, player records on);
 * - `aggregate`: `simulateAggregate` on the first `AGGREGATE_FIXTURES` fixtures without the own club;
 * - `day`: one automatic-play day of a career (`advanceDays(w, 1)`); its reps are successive days,
 *   which the two sides step in lockstep so a pair is the same day on both.
 * - `view`: the same career's day as the Host plays it without helpers: one `advance-days 1`
 *   command with `viewBase` (the day, its view and its publication) and the posting clone; its reps
 *   are successive days as in `day`, and a rep returns a promise that `pair.mjs` awaits.
 *
 * `digest()` hashes the recorded outputs (the world itself for `day`; every posted reply and then
 * the world for `view`), which a result-identical candidate must share with its baseline.
 */
import { createHash } from 'node:crypto';
import * as engine from '../../packages/engine/src/index';
// A tree before T670 has no career testkit; such a baseline needs its own world builder here.
import { careerWorld } from '../../packages/engine/src/career.testkit';
import { buildGridSetup } from '../../packages/engine/src/grid/setup';
import { playGrid } from '../../packages/engine/src/grid/engine';
import { simulateAggregate } from '../../packages/engine/src/aggregate/engine';
import { canonical } from '../../packages/contracts/src/index';
import { currentDay } from '../../packages/engine/src/calendar';
import type { Fixture, World } from '../../packages/contracts/src/types';
import { Host } from '../../apps/web/src/runtime/host';
import { forPosting } from '../../apps/web/src/runtime/viewPublisher';
import type { Reply } from '../../apps/web/src/runtime/protocol';

const GRID_FIXTURES = 3;
const AGGREGATE_FIXTURES = 150;

export interface Workload {
  /**
   * One rep; `record` adds its outputs to the digest. Returns a label of what the rep was, or a
   * promise of it when the rep waits as the Host does.
   */
  rep(record: boolean): string | Promise<string>;
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
  return careerWorld({ country: 'ENG', seed }, engine.MATCH_MODEL_RELEASE);
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
  if (name === 'view') {
    w.cash = '99999999999';
    const host = new Host();
    host.world = w;
    // The view the client holds before the first day, as a fresh activation publishes it.
    let base = (host as unknown as { publish(): Reply }).publish().viewSeq,
      serial = 0;
    // Hashed in `digest()`, so the hashing stays out of every timed rep.
    const posted: Reply[] = [];
    return {
      digest: () => {
        for (const reply of posted) hash.update(JSON.stringify(reply));
        return hash.update(canonical(w)).digest('hex').slice(0, 16);
      },
      cycle: 0,
      async rep() {
        if (w.critical) {
          delete w.critical;
          w.revision++;
        }
        const own = w.ownMatches.length,
          year = w.year,
          before = currentDay(w);
        const reply = await host.handle({
          protocol: 1,
          session: 'perf',
          requestId: `day-${serial++}`,
          expectedRevision: w.revision,
          generation: 1,
          parentGeneration: 0,
          viewBase: base,
          body: { type: 'command', command: { type: 'advance-days', days: 1, stop: [] } },
        });
        if (!reply.ok) throw new Error(`View benchmark day failed: ${reply.error}`);
        posted.push(structuredClone(forPosting(reply)));
        base = reply.viewSeq;
        if (w.bankrupt || (year === w.year && before === currentDay(w)))
          throw new Error('View benchmark did not advance a complete day');
        return w.ownMatches.length > own ? 'own' : 'other';
      },
    };
  }
  throw new Error(`unknown workload ${name}`);
}
