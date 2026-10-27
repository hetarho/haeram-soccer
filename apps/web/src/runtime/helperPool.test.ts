import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Fixture, MatchPlayback, World } from '../../../../packages/contracts/src/types';
import type {
  FixtureReadCopy,
  RoundJob,
  RoundJobResult,
} from '../../../../packages/engine/src/round-jobs';
import {
  HELPER_CONFIG,
  HelperPool,
  playDay,
  type DaySteps,
  type HelperJob,
  type HelperPort,
  type HelperReply,
} from './helperPool';

/** A helper port that keeps what it was sent and answers only when the test says so. */
class FakePort implements HelperPort {
  sent: HelperJob[] = [];
  onmessage: ((event: { data: HelperReply }) => void) | null = null;
  postMessage(job: HelperJob) {
    this.sent.push(structuredClone(job));
  }
  /** Answers the latest share: each job's result names its fixture. */
  answer(change: Partial<HelperReply> = {}) {
    const job = this.sent.at(-1)!;
    this.onmessage?.({ data: { id: job.id, results: job.jobs.map(result), ...change } });
  }
}
const fixture = (id: string): Fixture =>
  ({ id, home: `${id}-h`, away: `${id}-a`, round: 1 }) as unknown as Fixture;
const result = (job: RoundJob): RoundJobResult =>
  ({ record: { id: job.fixture.id }, squads: [[], []] }) as unknown as RoundJobResult;
const jobs = ['f1', 'f2', 'f3', 'f4', 'f5'].map((id) => ({ fixture: fixture(id), keep: false }));
const copy = { seed: 'small', year: 1950 } as unknown as FixtureReadCopy;
const ids = (results: readonly RoundJobResult[] | undefined) => results?.map((r) => r.record.id);

afterEach(() => {
  vi.useRealTimers();
});

describe('HelperPool', () => {
  it('splits the jobs, sends one JSON copy and returns results in fixture order', async () => {
    const ports = [new FakePort(), new FakePort()];
    const pool = new HelperPool(ports);
    const run = pool.run(copy, jobs);
    expect(ports.map((port) => port.sent[0]!.jobs.map((job) => job.fixture.id))).toEqual([
      ['f1', 'f2'],
      ['f3', 'f4', 'f5'],
    ]);
    expect(ports.map((port) => port.sent[0]!.copy)).toEqual([
      JSON.stringify(copy),
      JSON.stringify(copy),
    ]);
    // The second helper answers first; the order is the fixtures', not the answers'.
    ports[1]!.answer();
    ports[0]!.answer();
    expect(ids(await run)).toEqual(['f1', 'f2', 'f3', 'f4', 'f5']);
    expect(pool.active).toBe(true);
  });
  it('uses only as many helpers as there are jobs and answers an empty round at once', async () => {
    const ports = [new FakePort(), new FakePort()];
    const pool = new HelperPool(ports);
    const run = pool.run(copy, jobs.slice(0, 1));
    ports[0]!.answer();
    expect(ids(await run)).toEqual(['f1']);
    expect(ports[1]!.sent).toEqual([]);
    expect(await pool.run(copy, [])).toEqual([]);
  });
  it('a helper error leaves the round and later ones to the engine worker', async () => {
    const ports = [new FakePort(), new FakePort()];
    const pool = new HelperPool(ports);
    const run = pool.run(copy, jobs);
    ports[0]!.answer();
    ports[1]!.answer({ results: undefined, error: 'boom' });
    expect(await run).toBeUndefined();
    expect(pool.active).toBe(false);
    expect(await pool.run(copy, jobs)).toBeUndefined();
    expect(ports.map((port) => port.sent.length)).toEqual([1, 1]);
  });
  it('ignores an answer to another round and fails on a short one', async () => {
    const ports = [new FakePort()];
    const pool = new HelperPool(ports);
    const first = pool.run(copy, jobs.slice(0, 2));
    ports[0]!.onmessage?.({ data: { id: 99, results: [] } });
    expect(pool.active).toBe(true);
    ports[0]!.answer({ results: [] });
    expect(await first).toBeUndefined();
    expect(pool.active).toBe(false);
  });
  it('a timeout leaves the round and later ones to the engine worker', async () => {
    vi.useFakeTimers();
    const ports = [new FakePort(), new FakePort()];
    const pool = new HelperPool(ports);
    const run = pool.run(copy, jobs);
    ports[0]!.answer();
    vi.advanceTimersByTime(HELPER_CONFIG.timeoutMs);
    expect(await run).toBeUndefined();
    // An answer after the timeout changes nothing.
    ports[1]!.answer();
    expect(pool.active).toBe(false);
  });
  it('disabling it mid-round (a helper worker error) settles the round without results', async () => {
    const ports = [new FakePort()];
    const pool = new HelperPool(ports);
    const run = pool.run(copy, jobs);
    pool.disable();
    expect(await run).toBeUndefined();
  });
  it('without ports it is never active', async () => {
    const pool = new HelperPool([]);
    expect(pool.active).toBe(false);
    expect(await pool.run(copy, jobs)).toBeUndefined();
  });
  it('never throws into the prepared day: a copy or a port that fails ends helper use', async () => {
    const unserializable = new HelperPool([new FakePort()]);
    const bigint = { ...copy, seed: 1n } as unknown as FixtureReadCopy;
    expect(await unserializable.run(bigint, jobs)).toBeUndefined();
    expect(unserializable.active).toBe(false);
    const closed = new FakePort();
    closed.postMessage = () => {
      throw new Error('closed');
    };
    const pool = new HelperPool([new FakePort(), closed]);
    expect(await pool.run(copy, jobs)).toBeUndefined();
    expect(pool.active).toBe(false);
  });
});

describe('playDay', () => {
  const world = { id: 'w' } as unknown as World;
  const own = { record: { id: 'own' } } as unknown as MatchPlayback;
  /** Engine steps recording their calls; `ownDay` says whether the next day has our league fixture. */
  function steps(ownDay: boolean) {
    const calls: string[] = [];
    let completed: readonly RoundJobResult[] | undefined | 'none' = 'none';
    const day: DaySteps = {
      prepareRound(_w, start) {
        calls.push('prepare');
        if (!ownDay) return false;
        start(copy, jobs);
        calls.push('own match');
        return true;
      },
      completeRound(_w, results) {
        calls.push('complete');
        completed = results;
        return own;
      },
      advanceDays() {
        calls.push('advance');
        return undefined;
      },
    };
    return { day, calls, completed: () => completed };
  }
  it('a day without our league fixture steps at once and never uses the helpers', () => {
    const ports = [new FakePort(), new FakePort()];
    const engine = steps(false);
    expect(playDay(new HelperPool(ports), world, false, engine.day)).toBeUndefined();
    expect(engine.calls).toEqual(['prepare', 'advance']);
    expect(ports.map((port) => port.sent.length)).toEqual([0, 0]);
  });
  it('our match plays while the helpers compute, then the day completes with their results', async () => {
    const ports = [new FakePort(), new FakePort()];
    const engine = steps(true);
    const step = playDay(new HelperPool(ports), world, true, engine.day);
    expect(step).toBeInstanceOf(Promise);
    expect(engine.calls).toEqual(['prepare', 'own match']);
    ports[1]!.answer();
    ports[0]!.answer();
    expect(await step).toBe(own);
    expect(engine.calls).toEqual(['prepare', 'own match', 'complete']);
    expect(ids(engine.completed() as RoundJobResult[])).toEqual(['f1', 'f2', 'f3', 'f4', 'f5']);
  });
  it('a failed helper completes the day without results, so the engine computes the jobs', async () => {
    const ports = [new FakePort(), new FakePort()];
    const engine = steps(true);
    const step = playDay(new HelperPool(ports), world, false, engine.day);
    ports[0]!.answer({ results: undefined, error: 'boom' });
    await step;
    expect(engine.completed()).toBeUndefined();
  });
  it('without helpers, or once they failed, every day steps on the engine worker', () => {
    const engine = steps(true);
    expect(playDay(undefined, world, false, engine.day)).toBeUndefined();
    const failed = new HelperPool([new FakePort()]);
    failed.disable();
    expect(playDay(failed, world, false, engine.day)).toBeUndefined();
    expect(engine.calls).toEqual(['advance', 'advance']);
  });
});
