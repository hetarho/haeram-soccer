/**
 * The workloads of the paired A/B bench (`ab.mjs`). esbuild bundles this file once per tree, a
 * copy placed in that tree, so one process can load a baseline and a candidate side by side and
 * alternate them rep by rep (`pair.mjs`).
 *
 * Every rep replays the same fixed inputs, so the reps of one side do equal work:
 * - `own-match`: revision-11 own settlement, retaining script/material but staging no frames;
 * - `staging`: production `stageAll` of that frozen written match; `staging-first`: its first
 *   emitted minute. `staging-core` isolates the complete motion program if the adapter fails;
 * - `grid-own` / `grid-observed`: the same own fixture on the current grid, with `buildFrames`
 *   included in the observed case; `fixture`: one aggregate fixture. These hash after timing;
 * - `grid`: the detailed engine on one of `GRID_FIXTURES` top-tier fixtures a rep, in turn (setup
 *   built per rep, as an own match is: no observation, player records on);
 * - `aggregate`: `simulateAggregate` on the first `AGGREGATE_FIXTURES` fixtures without the own club;
 * - `day`: one automatic-play day of a career (`advanceDays(w, 1)`); its reps are successive days,
 *   which the two sides step in lockstep so a pair is the same day on both.
 * - `view`: the same career's day as the Host plays it without helpers: one `advance-days 1`
 *   command with `viewBase` (the day, its view and its publication) and the posting clone; its reps
 *   are successive days as in `day`, and a rep returns a promise that `pair.mjs` awaits.
 * - `history`: one season of the world before the takeover, lived to its close as `liveHistory`
 *   lives it (→WORLD-13) on a world `historyWorld(seed)` builds once outside the timed reps; its
 *   reps are successive seasons from 1930, stepped in lockstep as `day` steps its days.
 *
 * `digest()` hashes the recorded outputs (the world itself for `day` and `history`; every posted
 * reply and then the world for `view`), which a result-identical candidate must share with its
 * baseline.
 */
import { createHash } from 'node:crypto';
import { diagnosticCanonical } from './digest';
import * as engine from '../../packages/engine/src/index';
// A tree before T670 has no career testkit; such a baseline needs its own world builder here.
import { careerWorld } from '../../packages/engine/src/career.testkit';
import { buildGridSetup } from '../../packages/engine/src/grid/setup';
import { playGrid } from '../../packages/engine/src/grid/engine';
import { buildFrames } from '../../packages/engine/src/grid/playback';
import { simulateMatch } from '../../packages/engine/src/match';
import { SCRIPTED_RELEASE } from '../../packages/engine/src/match-model-release';
import { invalidDetail } from '../../packages/engine/src/script/failure';
import { stageAll, stageFrames } from '../../packages/engine/src/staging/frames';
import { advance, createStaging } from '../../packages/engine/src/staging/staging';
import { simulateAggregate } from '../../packages/engine/src/aggregate/engine';
import { canonical } from '../../packages/contracts/src/index';
import { currentDay } from '../../packages/engine/src/calendar';
import { historyWorld, liveHistory } from '../../packages/engine/src/history';
import type { Fixture, MatchPlayback, World } from '../../packages/contracts/src/types';
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
  if (
    [
      'own-match',
      'staging',
      'staging-core',
      'staging-first',
      'grid-own',
      'grid-observed',
      'fixture',
    ].includes(name)
  ) {
    // One frozen top-flight own fixture, identical inputs for settlement, picture and grid context.
    // Building the world and (for staging) writing the script are outside the timed window.
    const w = careerWorld(
      { country: 'ENG', club: 'ENG:0:0:0', seed },
      name.startsWith('grid-')
        ? { revision: 'continuous-aggregate-10', enabled: true }
        : SCRIPTED_RELEASE,
    );
    const fixture = w.fixtures.find((f) => f.home === w.playerClub || f.away === w.playerClub)!;
    let written: MatchPlayback | undefined;
    const write = () => {
      const playback = simulateMatch(w, fixture, true);
      if (playback.problems?.length || !playback.script || !playback.staging)
        throw invalidDetail(`perf:script:${playback.problems?.join(',') ?? 'missing'}`);
      return playback;
    };
    if (name.startsWith('staging')) written = write();
    let output: unknown;
    return {
      cycle: 1,
      // Hash outside the timing: serializing a full picture is not staging it. The old grid's
      // interval-whistle coordinates are NaN: diagnostic tags retain their non-finite kind.
      digest: () =>
        hash
          .update(name === 'grid-observed' ? diagnosticCanonical(output) : canonical(output))
          .digest('hex')
          .slice(0, 16),
      rep(record) {
        let result: unknown;
        if (name === 'own-match') result = write();
        else if (name === 'fixture') result = simulateAggregate(w, fixture);
        else if (written) {
          const args = [written.script!, written.staging!, written.record, written.squads] as const;
          result =
            name === 'staging-core'
              ? advance(createStaging(written.script!, written.staging!), Infinity)
              : name === 'staging'
                ? stageAll(...args)
                : stageFrames(...args).next().value;
        } else {
          const setup = buildGridSetup(w, fixture, {
            observe: name === 'grid-observed',
            recordPlayers: true,
          });
          const grid = playGrid(setup);
          result =
            name === 'grid-observed'
              ? { record: grid.record, frames: buildFrames(grid, setup, w.seed) }
              : grid.record;
        }
        if (record) output = result;
        return name;
      },
    };
  }
  if (name === 'history') {
    // A new game's history: no career world is built for it.
    const h = historyWorld(seed);
    return {
      digest: () => hash.update(canonical(h)).digest('hex').slice(0, 16),
      cycle: 0,
      rep() {
        const year = h.year;
        liveHistory(h, year + 1);
        if (h.year <= year) throw new Error('History benchmark did not close a season');
        return 'season';
      },
    };
  }
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
