import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorld } from '../../../../packages/engine/src/index';
import type { MatchPlayback } from '../../../../packages/contracts/src/types';
import type { GameClient } from './client';
import { gameStore, initialClientState } from './store';
import { ProgressionController } from './progression';
import type { View } from './protocol';

const w = createWorld({
  country: 'ENG',
  name: 'Clock Club',
  color: '#24543b',
  seed: 'clock-regression',
  difficulty: 2,
});
function playback(id: string): MatchPlayback {
  return {
    record: { id } as MatchPlayback['record'],
    frames: [{ minute: 1 }] as MatchPlayback['frames'],
    squads: [[], []],
  };
}
function setup(current?: MatchPlayback) {
  gameStore.publish({
    ...initialClientState,
    busy: false,
    processing: false,
    activity: 'idle',
    readonly: false,
    savedRevision: w.revision,
    playback: current,
    view: { world: w } as View,
  });
  const command = vi.fn(async () => ({ ok: true, requestId: 'test', view: { world: w } as View }));
  const client = { command, cancel: vi.fn() } as unknown as GameClient;
  const controller = new ProgressionController(client);
  return { controller, command, client };
}
let controller: ProgressionController | undefined;
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  controller?.dispose();
  controller = undefined;
  gameStore.publish({ ...initialClientState });
  vi.useRealTimers();
});

describe('the global progression clock', () => {
  it('advances background days without depending on mounted tabs', async () => {
    const s = setup();
    controller = s.controller;
    controller.start();
    await vi.advanceTimersByTimeAsync(3000);
    expect(s.command).toHaveBeenCalledTimes(3);
    expect(s.command).toHaveBeenLastCalledWith(
      { type: 'advance-days', days: 1 },
      { background: true },
    );
    controller.setPace('three-days');
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.command).toHaveBeenLastCalledWith(
      { type: 'advance-days', days: 3 },
      { background: true },
    );
    controller.stop();
    await vi.advanceTimersByTimeAsync(2000);
    expect(s.command).toHaveBeenCalledTimes(4);
  });
  it('holds the calendar throughout observation and starts next match at the finish signal', async () => {
    const s = setup(playback('first'));
    controller = s.controller;
    controller.setWatching(true);
    controller.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(s.command).not.toHaveBeenCalled();
    s.command.mockImplementation(async () => {
      gameStore.publish({ ...gameStore.getSnapshot(), playback: playback('second') });
      return { ok: true, requestId: 'next', view: { world: w } as View };
    });
    controller.finishMatch('first');
    await vi.advanceTimersByTimeAsync(0);
    expect(s.command).toHaveBeenCalledExactlyOnceWith({ type: 'next-match' }, { background: true });
    await vi.advanceTimersByTimeAsync(5000);
    expect(s.command).toHaveBeenCalledTimes(1);
    controller.finishMatch('first');
    await vi.advanceTimersByTimeAsync(0);
    expect(s.command).toHaveBeenCalledTimes(1);
  });
  it('resumes date progression in statistics, returns to the same live match, and interrupts on alerts', async () => {
    const s = setup(playback('live'));
    controller = s.controller;
    controller.setWatching(true);
    controller.start();
    controller.setWatching(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.command).toHaveBeenCalledTimes(1);
    controller.setWatching(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(s.command).toHaveBeenCalledTimes(1);
    gameStore.publish({
      ...gameStore.getSnapshot(),
      view: { world: { ...w, critical: '현금 부족' } } as View,
    });
    expect(controller.store.getState().running).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(s.command).toHaveBeenCalledTimes(1);
  });
  it('waits for a pending checkpoint before responding to a finish signal', async () => {
    const s = setup(playback('pending'));
    controller = s.controller;
    controller.setWatching(true);
    controller.start();
    gameStore.publish({ ...gameStore.getSnapshot(), processing: true });
    controller.finishMatch('pending');
    expect(s.command).not.toHaveBeenCalled();
    gameStore.publish({ ...gameStore.getSnapshot(), processing: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(s.command).toHaveBeenCalledExactlyOnceWith({ type: 'next-match' }, { background: true });
  });
});
