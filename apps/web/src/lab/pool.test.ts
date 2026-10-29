import { describe, expect, it } from 'vitest';
import type { LabReply, LabRequest, LabSample, LabSide, RunSummary } from './protocol';
import { LabPool, labSlices, labWorkerCount, type LabWorkerPort } from './pool';

/** An in-process stand-in for worker.ts: match `i` is a sample carrying only its index. */
class FakeWorker implements LabWorkerPort {
  onmessage: ((event: { data: LabReply }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  terminated = false;
  received: LabRequest[] = [];
  /** Held replies; `flush` delivers them. */
  private outbox: LabReply[] = [];
  constructor(private readonly reject?: string) {}

  postMessage(m: LabRequest) {
    this.received.push(m);
    if (m.type === 'run') {
      if (this.reject) {
        this.outbox.push({
          type: 'failed',
          runId: m.runId,
          message: 'rejected',
          rejected: [{ path: this.reject, reason: 'unknown' }],
        });
        return;
      }
      const results: LabSample[] = [];
      for (let i = 0; i < m.count; i++) {
        results.push({ index: m.from + i, leftHome: (m.from + i) % 2 === 0 } as LabSample);
        this.outbox.push({ type: 'progress', runId: m.runId, done: i + 1 });
      }
      this.outbox.push({ type: 'samples', runId: m.runId, from: m.from, results });
    } else if (m.type === 'summarize')
      this.outbox.push({
        type: 'summary',
        runId: m.runId,
        summary: { matches: m.samples.length, order: m.samples.map((s) => s.index) } as never,
      });
    else if (m.type === 'probe') this.outbox.push({ type: 'reads', paths: ['A.b'] });
  }
  terminate() {
    this.terminated = true;
  }
  flush() {
    for (const reply of this.outbox.splice(0)) this.onmessage?.({ data: reply });
  }
}

function pool(cores: number, reject?: string) {
  const workers: FakeWorker[] = [];
  const p = new LabPool(() => {
    const w = new FakeWorker(reject);
    workers.push(w);
    return w;
  }, cores);
  // Replies arrive slice by slice, the last worker first.
  const flush = () => {
    for (let pass = 0; pass < 2; pass++) for (const w of [...workers].reverse()) w.flush();
  };
  return { p, workers, flush };
}

const sides = [{} as LabSide, {} as LabSide] as [LabSide, LabSide];
const input = (count: number) => ({ runSeed: 's', sides, overrides: {}, count });

describe('lab pool', () => {
  it('slices contiguously over at most four workers, one core kept', () => {
    expect(labWorkerCount(600, 16)).toBe(4);
    expect(labWorkerCount(600, 3)).toBe(2);
    expect(labWorkerCount(600, 1)).toBe(1);
    expect(labWorkerCount(1, 16)).toBe(1);
    expect(labSlices(100, 3)).toEqual([
      { from: 0, count: 34 },
      { from: 34, count: 33 },
      { from: 67, count: 33 },
    ]);
    expect(labSlices(2, 4)).toEqual([
      { from: 0, count: 1 },
      { from: 1, count: 1 },
    ]);
  });

  it('merges slices by index and summarizes on the first worker', async () => {
    const outcomes: unknown[] = [];
    for (const cores of [2, 4]) {
      const { p, workers, flush } = pool(cores);
      const progress: number[] = [];
      const run = p.start(input(7), (done) => progress.push(done));
      flush();
      const outcome = (await run.result) as { status: 'done'; summary: RunSummary };
      expect(outcome.status).toBe('done');
      expect(workers).toHaveLength(cores - 1);
      expect(workers[0]!.received.at(-1)!.type).toBe('summarize');
      expect(progress.at(-1)).toBe(7);
      outcomes.push(outcome);
    }
    expect(outcomes[0]).toEqual(outcomes[1]);
    expect(outcomes[0]).toMatchObject({ summary: { order: [0, 1, 2, 3, 4, 5, 6] } });
  });

  it('cancel terminates the run and keeps nothing', async () => {
    const { p, workers, flush } = pool(4);
    const run = p.start(input(20));
    run.cancel();
    expect(await run.result).toEqual({ status: 'cancelled' });
    expect(workers.every((w) => w.terminated)).toBe(true);
    // Late replies of the cancelled run go nowhere; the next run takes fresh workers.
    flush();
    const next = p.start(input(3));
    flush();
    expect((await next.result).status).toBe('done');
    expect(workers).toHaveLength(6);
  });

  it('a new run cancels the one going', async () => {
    const { p, flush } = pool(2);
    const first = p.start(input(5));
    const second = p.start(input(5));
    flush();
    expect(await first.result).toEqual({ status: 'cancelled' });
    expect((await second.result).status).toBe('done');
  });

  it('rejected overrides fail the run with their paths', async () => {
    const { p, workers, flush } = pool(4, 'NOPE.x');
    const run = p.start({ ...input(10), overrides: { 'NOPE.x': 1 } });
    flush();
    expect(await run.result).toEqual({
      status: 'rejected',
      rejected: [{ path: 'NOPE.x', reason: 'unknown' }],
    });
    // Nothing was played, so the workers stay.
    expect(workers.some((w) => w.terminated)).toBe(false);
  });

  it('a crashed worker fails the run and pending requests', async () => {
    const { p, workers } = pool(3);
    const run = p.start(input(10));
    const reads = p.probe();
    workers[1]!.onerror!(new Event('error'));
    expect(await run.result).toMatchObject({ status: 'failed' });
    await expect(reads).rejects.toThrow();
    expect(workers.every((w) => w.terminated)).toBe(true);
  });
});
