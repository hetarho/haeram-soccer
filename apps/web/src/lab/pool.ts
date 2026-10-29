/**
 * The page's side of the match lab's workers (→LAB-4): a run's matches split into contiguous slices
 * across up to four workers, merged by match index and summarized by the first worker, so the summary
 * is the same whatever the worker count. Imports protocol types only — engine code stays in the
 * workers (ARCH-4, the lab's constraints).
 */
import type {
  LabReply,
  LabRequest,
  LabSample,
  LabSide,
  LabSideIndex,
  Overrides,
  RejectedOverride,
  RunSummary,
} from './protocol';
import type { MatchPlayback, Tactic, World } from '../../../../packages/contracts/src/types';

export const LAB_POOL_CONFIG = {
  /** Workers a run spreads over at most; one core stays with the page. */
  maxWorkers: 4,
} as const;

/** What the pool needs of a worker; a browser `Worker` running worker.ts. */
export interface LabWorkerPort {
  postMessage(message: LabRequest): void;
  terminate(): void;
  onmessage: ((event: { data: LabReply }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export const createLabWorker = (): LabWorkerPort =>
  new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as LabWorkerPort;

/** Workers a run of `count` matches uses on a device with `cores` cores. */
export function labWorkerCount(count: number, cores: number) {
  return Math.max(1, Math.min(LAB_POOL_CONFIG.maxWorkers, cores - 1, count));
}

/** `count` matches as `workers` contiguous slices, sizes apart by at most one, none empty. */
export function labSlices(count: number, workers: number): { from: number; count: number }[] {
  const n = Math.max(1, Math.min(workers, count));
  const out: { from: number; count: number }[] = [];
  let from = 0;
  for (let i = 0; i < n; i++) {
    const size = Math.floor(count / n) + (i < count % n ? 1 : 0);
    out.push({ from, count: size });
    from += size;
  }
  return out;
}

export interface LabRunInput {
  runSeed: string;
  sides: [LabSide, LabSide];
  overrides: Overrides;
  count: number;
}

export type LabRunOutcome =
  | { status: 'done'; summary: RunSummary }
  | { status: 'cancelled' }
  | { status: 'rejected'; rejected: RejectedOverride[] }
  | { status: 'failed'; message: string };

export interface LabRun {
  runId: number;
  result: Promise<LabRunOutcome>;
  cancel(): void;
}

interface ActiveRun {
  runId: number;
  input: LabRunInput;
  workers: number;
  /** Each slice's first match. */
  from: number[];
  done: number[];
  slices: (LabSample[] | undefined)[];
  summarizing: boolean;
  progress: (done: number, total: number) => void;
  finish: (outcome: LabRunOutcome) => void;
}

export type LabWatchOutcome =
  | { status: 'done'; playback: MatchPlayback }
  /** A newer watch was asked for before this one came back. */
  | { status: 'superseded' }
  | { status: 'rejected'; rejected: RejectedOverride[] }
  | { status: 'failed'; message: string };

interface Waiter<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

export class LabPool {
  /** Lazily created; the first also generates sides, probes reads and summarizes runs. */
  private workers: LabWorkerPort[] = [];
  private nextId = 1;
  private run?: ActiveRun;
  private sideWaiters = new Map<number, Waiter<LabSide>>();
  private probeWaiters: Waiter<string[]>[] = [];
  private watching?: { requestId: number; finish: (outcome: LabWatchOutcome) => void };
  private worldWaiters = new Map<number, Waiter<World>>();
  private labWorld?: Promise<World>;

  constructor(
    private readonly create: () => LabWorkerPort = createLabWorker,
    private readonly cores: number = globalThis.navigator?.hardwareConcurrency ?? 1,
  ) {}

  /**
   * Plays a run; a run already going is cancelled first. The run reads its own copies of the sides
   * and values, so later edits do not reach it.
   */
  start(input: LabRunInput, progress: (done: number, total: number) => void = () => {}): LabRun {
    this.run?.finish({ status: 'cancelled' });
    const runId = this.nextId++;
    const slices = labSlices(input.count, labWorkerCount(input.count, this.cores));
    let finish!: (outcome: LabRunOutcome) => void;
    const result = new Promise<LabRunOutcome>((resolve) => {
      finish = (outcome) => {
        if (this.run?.runId !== runId) return;
        this.run = undefined;
        // A run that stops early leaves its workers mid-slice: they go, and nothing is kept.
        if (outcome.status === 'cancelled' || outcome.status === 'failed')
          this.dropRunWorkers(slices.length);
        resolve(outcome);
      };
    });
    this.run = {
      runId,
      input,
      workers: slices.length,
      from: slices.map((s) => s.from),
      done: slices.map(() => 0),
      slices: slices.map(() => undefined),
      summarizing: false,
      progress,
      finish,
    };
    slices.forEach((slice, i) =>
      this.worker(i).postMessage({
        type: 'run',
        runId,
        runSeed: input.runSeed,
        sides: input.sides,
        overrides: input.overrides,
        from: slice.from,
        count: slice.count,
      }),
    );
    return { runId, result, cancel: () => finish({ status: 'cancelled' }) };
  }

  generate(
    side: LabSideIndex,
    seed: string,
    tactic: Tactic,
    average: number,
    spread: number,
    ovrs?: number[],
  ): Promise<LabSide> {
    return this.sideRequest((requestId) => ({
      type: 'generate',
      requestId,
      side,
      seed,
      tactic,
      average,
      spread,
      ...(ovrs && { ovrs }),
    }));
  }

  setOvr(side: LabSide, sideIndex: LabSideIndex, index: number, ovr: number): Promise<LabSide> {
    return this.sideRequest((requestId) => ({
      type: 'setOvr',
      requestId,
      side,
      sideIndex,
      index,
      ovr,
    }));
  }

  /** The value paths a default run reads. */
  probe(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      this.probeWaiters.push({ resolve, reject });
      this.worker(0).postMessage({ type: 'probe' });
    });
  }

  /**
   * 관전 (→LAB-9): match 0 of `seed` with its frames, played on the first worker with its own copies
   * of the sides and values; an older watch still pending resolves superseded.
   */
  watch(seed: string, sides: [LabSide, LabSide], overrides: Overrides): Promise<LabWatchOutcome> {
    this.watching?.finish({ status: 'superseded' });
    const requestId = this.nextId++;
    return new Promise((resolve) => {
      const finish = (outcome: LabWatchOutcome) => {
        if (this.watching?.requestId !== requestId) return;
        this.watching = undefined;
        resolve(outcome);
      };
      this.watching = { requestId, finish };
      this.worker(0).postMessage({ type: 'watch', requestId, seed, sides, overrides });
    });
  }

  /** The lab world the match view reads, fetched once (a failed fetch is asked again next time). */
  world(): Promise<World> {
    this.labWorld ??= new Promise<World>((resolve, reject) => {
      const requestId = this.nextId++;
      this.worldWaiters.set(requestId, { resolve, reject });
      this.worker(0).postMessage({ type: 'world', requestId });
    }).catch((error: unknown) => {
      this.labWorld = undefined;
      throw error;
    });
    return this.labWorld;
  }

  /** Stops everything: a running run resolves cancelled, pending requests fail. */
  dispose() {
    this.run?.finish({ status: 'cancelled' });
    this.dropRunWorkers(this.workers.length);
  }

  private sideRequest(request: (requestId: number) => LabRequest): Promise<LabSide> {
    const requestId = this.nextId++;
    return new Promise((resolve, reject) => {
      this.sideWaiters.set(requestId, { resolve, reject });
      this.worker(0).postMessage(request(requestId));
    });
  }

  private worker(i: number): LabWorkerPort {
    while (this.workers.length <= i) {
      const worker = this.create();
      worker.onmessage = (event) => this.received(worker, event.data);
      worker.onerror = () => this.crashed(worker);
      this.workers.push(worker);
    }
    return this.workers[i]!;
  }

  private received(from: LabWorkerPort, r: LabReply) {
    switch (r.type) {
      case 'side': {
        const waiter = this.sideWaiters.get(r.requestId);
        this.sideWaiters.delete(r.requestId);
        waiter?.resolve(r.side);
        return;
      }
      case 'reads':
        this.probeWaiters.shift()?.resolve(r.paths);
        return;
      case 'playback':
        if (this.watching?.requestId === r.requestId)
          this.watching.finish({ status: 'done', playback: r.playback });
        return;
      case 'world': {
        const waiter = this.worldWaiters.get(r.requestId);
        this.worldWaiters.delete(r.requestId);
        waiter?.resolve(r.world);
        return;
      }
      case 'failed':
        if (r.requestId !== undefined && this.watching?.requestId === r.requestId)
          this.watching.finish(
            r.rejected?.length
              ? { status: 'rejected', rejected: r.rejected }
              : { status: 'failed', message: r.message },
          );
        else if (r.requestId !== undefined && this.worldWaiters.has(r.requestId)) {
          this.worldWaiters.get(r.requestId)!.reject(new Error(r.message));
          this.worldWaiters.delete(r.requestId);
        } else if (r.requestId !== undefined) {
          const waiter = this.sideWaiters.get(r.requestId);
          this.sideWaiters.delete(r.requestId);
          waiter?.reject(new Error(r.message));
        } else if (r.runId === -1) this.probeWaiters.shift()?.reject(new Error(r.message));
        else if (this.run?.runId === r.runId)
          this.run.finish(
            r.rejected?.length
              ? { status: 'rejected', rejected: r.rejected }
              : { status: 'failed', message: r.message },
          );
        return;
    }
    const run = this.run;
    if (!run || run.runId !== r.runId) return;
    switch (r.type) {
      case 'progress': {
        const i = this.workers.indexOf(from);
        if (i < 0 || i >= run.workers) return;
        run.done[i] = r.done;
        run.progress(
          run.done.reduce((a, b) => a + b, 0),
          run.input.count,
        );
        return;
      }
      case 'samples': {
        const i = run.from.indexOf(r.from);
        if (i < 0) return;
        run.slices[i] = r.results;
        if (run.summarizing || run.slices.some((s) => !s)) return;
        run.summarizing = true;
        // Slices are contiguous and in order, so the merge is their concatenation by index.
        const samples = run.slices.flatMap((s) => s!).sort((a, b) => a.index - b.index);
        this.worker(0).postMessage({
          type: 'summarize',
          runId: run.runId,
          samples,
          sides: run.input.sides,
        });
        return;
      }
      case 'summary':
        run.finish({ status: 'done', summary: r.summary });
        return;
    }
  }

  /** A worker that errors outside a reply fails the run and whatever waits on it. */
  private crashed(worker: LabWorkerPort) {
    if (!this.workers.includes(worker)) return;
    this.run?.finish({ status: 'failed', message: '실험 워커가 중단되었습니다' });
    // Without a run (or when the run's finish left it alive) the pool starts over.
    if (this.workers.includes(worker)) this.dropRunWorkers(this.workers.length);
  }

  /** Terminates the first `n` workers (a run's); the first worker's pending requests fail with it. */
  private dropRunWorkers(n: number) {
    const gone = this.workers.splice(0, n);
    for (const w of gone) {
      w.onmessage = null;
      w.onerror = null;
      w.terminate();
    }
    if (!gone.length) return;
    const error = new Error('실험 워커가 중단되었습니다');
    for (const waiter of this.sideWaiters.values()) waiter.reject(error);
    this.sideWaiters.clear();
    for (const waiter of this.probeWaiters.splice(0)) waiter.reject(error);
    for (const waiter of this.worldWaiters.values()) waiter.reject(error);
    this.worldWaiters.clear();
    this.watching?.finish({ status: 'failed', message: error.message });
  }
}
