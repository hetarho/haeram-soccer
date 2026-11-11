import type { MatchPlayback } from '../../../../packages/contracts/src/types';
import type { StagingReply, StagingRequest } from './stagingProtocol';

export interface StagingWorker {
  onmessage: ((event: MessageEvent<StagingReply>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: StagingRequest | { stop: true }): void;
  terminate(): void;
}
const browserWorker = (): StagingWorker | undefined =>
  typeof Worker === 'undefined'
    ? undefined
    : new Worker(new URL('./stagingWorker.ts', import.meta.url), { type: 'module' });

/** Owns only a transient playback; every append publishes a new immutable store reference. */
export class PlaybackStaging {
  private playback?: MatchPlayback;
  private serial = 0;
  private worker?: StagingWorker;
  private stopFallback?: () => void;
  private active = true;
  private pending = new Map<number, MatchPlayback['frames']>();
  constructor(
    private publish: (playback: MatchPlayback | undefined) => void,
    private report: () => void,
    private makeWorker: () => StagingWorker | undefined = browserWorker,
  ) {}
  replace(playback?: MatchPlayback) {
    this.stop();
    this.playback =
      playback?.script && !playback.frames.length
        ? { ...playback, frames: [], staged: { done: false } }
        : playback;
    this.publish(this.playback);
    if (this.active) this.start();
  }
  watching(active: boolean) {
    this.active = active;
    if (active) this.start();
    else this.stop();
  }
  stop() {
    ++this.serial;
    this.worker?.postMessage({ stop: true });
    this.worker?.terminate();
    this.worker = undefined;
    this.stopFallback?.();
    this.stopFallback = undefined;
    this.pending.clear();
  }
  private start() {
    const p = this.playback;
    if (
      !p?.script ||
      !p.staging ||
      !p.staged ||
      p.staged.done ||
      p.staged.error ||
      this.worker ||
      this.stopFallback
    )
      return;
    const id = ++this.serial;
    const request: StagingRequest = {
      id,
      script: p.script,
      staging: p.staging,
      record: p.record,
      squads: p.squads,
      from: p.frames.length,
    };
    const receive = (reply: StagingReply) => {
      if (id !== this.serial || reply.id !== id || !this.playback) return;
      const current = this.playback;
      if ('frames' in reply) {
        if (reply.from < current.frames.length) return;
        this.pending.set(reply.from, reply.frames);
        let frames = current.frames;
        for (
          let batch = this.pending.get(frames.length);
          batch;
          batch = this.pending.get(frames.length)
        ) {
          this.pending.delete(frames.length);
          frames = [...frames, ...batch];
          if (!batch.length) break;
        }
        if (frames === current.frames) return;
        this.playback = { ...current, frames };
      } else {
        this.playback = {
          ...current,
          staged: 'done' in reply ? { done: true } : { done: false, error: true },
        };
        this.stop();
        if ('error' in reply) this.report();
      }
      this.publish(this.playback);
    };
    try {
      this.worker = this.makeWorker();
      if (this.worker) {
        this.worker.onmessage = (event) => receive(event.data);
        this.worker.onerror = () => receive({ id, error: true });
        this.worker.postMessage(request);
        return;
      }
    } catch {
      // A browser refusing worker creation or its initial message takes the timer fallback.
      this.worker?.terminate();
      this.worker = undefined;
    }
    // Keep staging (and the engine) out of the application's initial entry.
    this.stopFallback = () => {};
    void import('./stagingProgram')
      .then(({ runStaging }) => {
        if (id === this.serial) this.stopFallback = runStaging(request, receive);
      })
      .catch(() => receive({ id, error: true }));
  }
}
