import { describe, expect, it, vi } from 'vitest';
import type { MatchFrame, MatchPlayback } from '../../../../packages/contracts/src/types';
import { createGameStore, initialClientState } from './store';
import { PlaybackStaging, type StagingWorker } from './staging';
import type { StagingReply, StagingRequest } from './stagingProtocol';
import { runStaging } from './stagingProgram';

vi.mock('./stagingProgram', () => ({ runStaging: vi.fn(() => vi.fn()) }));

class FakeWorker implements StagingWorker {
  onmessage: StagingWorker['onmessage'] = null;
  onerror: StagingWorker['onerror'] = null;
  postMessage = vi.fn<(message: StagingRequest | { stop: true }) => void>();
  terminate = vi.fn();
  get request() {
    return this.postMessage.mock.calls[0][0] as StagingRequest;
  }
  send(reply: Omit<Extract<StagingReply, { frames: MatchFrame[] }>, 'id'> | { done: true }) {
    this.onmessage?.({ data: { id: this.request.id, ...reply } } as MessageEvent<StagingReply>);
  }
}
const frame = (minute: number) => ({ minute }) as MatchFrame;
const playback = (id = 'match'): MatchPlayback => ({
  record: { id } as MatchPlayback['record'],
  frames: [],
  squads: [[], []],
  script: { beats: [] } as unknown as MatchPlayback['script'],
  staging: [] as unknown as MatchPlayback['staging'],
});
function setup() {
  const workers: FakeWorker[] = [],
    report = vi.fn();
  const store = createGameStore(initialClientState);
  const staging = new PlaybackStaging(
    (playback) => store.publish({ ...store.getState(), playback }),
    report,
    () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
  );
  return { staging, store, report, workers, current: () => store.getState().playback! };
}

describe('a transient staged playback', () => {
  it('frames arrive in order and are appended to the playback', () => {
    const s = setup(),
      source = playback();
    s.staging.replace(source);
    const first = s.current();
    expect(first.staged).toEqual({ done: false });
    s.workers[0].send({ from: 2, frames: [frame(3)] });
    expect(s.current().frames).toEqual([]);
    s.workers[0].send({ from: 0, frames: [frame(1), frame(2)] });
    expect(s.current().frames.map((f) => f.minute)).toEqual([1, 2, 3]);
    expect(first.frames).toEqual([]);
    expect(source.frames).toEqual([]);
    s.workers[0].send({ from: 0, frames: [frame(99)] });
    expect(s.current().frames.map((f) => f.minute)).toEqual([1, 2, 3]);
    s.workers[0].send({ done: true });
    expect(s.current().staged).toEqual({ done: true });
    expect(s.workers[0].terminate).toHaveBeenCalledOnce();
  });
  it('a new playback or leaving the theatre stops the worker', () => {
    const s = setup();
    s.staging.replace(playback());
    const old = s.workers[0];
    s.staging.replace(playback('next'));
    expect(old.terminate).toHaveBeenCalledOnce();
    old.send({ from: 0, frames: [frame(99)] });
    expect(s.current().record.id).toBe('next');
    expect(s.current().frames).toEqual([]);
    s.workers[1].send({ from: 0, frames: [frame(1), frame(2)] });
    s.staging.watching(false);
    expect(s.workers[1].postMessage).toHaveBeenLastCalledWith({ stop: true });
    expect(s.workers[1].terminate).toHaveBeenCalledOnce();
    s.staging.watching(true);
    expect(s.workers[2].request.from).toBe(2);
    s.workers[2].send({ from: 2, frames: [frame(3)] });
    expect(s.current().frames.map((f) => f.minute)).toEqual([1, 2, 3]);
    // Replacing the career also invalidates every late staging message.
    s.staging.replace();
    s.workers[2].send({ from: 3, frames: [frame(4)] });
    expect(s.store.getState().playback).toBeUndefined();
  });
  it('a worker error leaves the frames so far and reports', () => {
    const s = setup();
    s.staging.replace(playback());
    s.workers[0].send({ from: 0, frames: [frame(1)] });
    s.workers[0].onerror?.({} as ErrorEvent);
    expect(s.current().frames).toEqual([frame(1)]);
    expect(s.current().staged).toEqual({ done: false, error: true });
    expect(s.report).toHaveBeenCalledOnce();
    s.workers[0].send({ from: 1, frames: [frame(2)] });
    expect(s.current().frames).toHaveLength(1);
  });
  it('a playback with frames starts no worker', () => {
    const s = setup(),
      p = { ...playback(), frames: [frame(1)] };
    s.staging.replace(p);
    expect(s.current()).toBe(p);
    expect(s.workers).toEqual([]);
  });
  it.each([false, true])(
    'uses the same timer program when a worker is unavailable (creation throws: %s)',
    async (throws) => {
      const publish = vi.fn(),
        report = vi.fn();
      const staging = new PlaybackStaging(publish, report, () => {
        if (throws) throw new Error('unavailable');
        return undefined;
      });
      staging.replace(playback());
      await vi.waitFor(() => expect(runStaging).toHaveBeenCalled());
      const [request, send] = vi.mocked(runStaging).mock.calls.at(-1)!;
      send({ id: request.id, from: 0, frames: [frame(1)] });
      expect(publish.mock.calls.at(-1)![0]!.frames).toEqual([frame(1)]);
      staging.stop();
      expect(vi.mocked(runStaging).mock.results.at(-1)!.value).toHaveBeenCalledOnce();
      send({ id: request.id, from: 1, frames: [frame(2)] });
      expect(publish.mock.calls.at(-1)![0]!.frames).toEqual([frame(1)]);
      expect(report).not.toHaveBeenCalled();
      vi.mocked(runStaging).mockClear();
    },
  );
});
