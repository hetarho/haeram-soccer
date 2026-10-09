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
  it('pauses only while a suspension source holds and resumes without a restart', async () => {
    const s = setup();
    controller = s.controller;
    controller.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.command).toHaveBeenCalledTimes(1);
    controller.setSuspended(true, 'visibility');
    controller.setSuspended(true, 'other');
    await vi.advanceTimersByTimeAsync(2000);
    expect(s.command).toHaveBeenCalledTimes(1);
    expect(controller.store.getState().running).toBe(true);
    controller.setSuspended(false, 'visibility');
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.command).toHaveBeenCalledTimes(1);
    controller.setSuspended(false, 'other');
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.command).toHaveBeenCalledTimes(2);
  });
  it('cancels an in-flight auto request on stop and never leaves a running timer after disposal', async () => {
    const s = setup();
    controller = s.controller;
    s.command.mockImplementation(() => new Promise(() => {}));
    controller.start();
    await vi.advanceTimersByTimeAsync(1000);
    controller.stop('관전을 위해 자동 진행을 멈췄습니다.');
    expect(s.client.cancel).toHaveBeenCalled();
    controller.dispose();
    await vi.advanceTimersByTimeAsync(3000);
    expect(s.command).toHaveBeenCalledTimes(1);
  });

  it('advances background days without depending on mounted tabs', async () => {
    const s = setup();
    controller = s.controller;
    controller.start();
    await vi.advanceTimersByTimeAsync(3000);
    expect(s.command).toHaveBeenCalledTimes(3);
    expect(s.command).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'advance-days', days: 1 }),
      { background: true, automatic: true },
    );
    controller.setPace('three-days');
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.command).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'advance-days', days: 3 }),
      { background: true, automatic: true },
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
    expect(s.command).toHaveBeenCalledExactlyOnceWith(
      { type: 'next-match' },
      { background: true, automatic: true },
    );
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
    expect(s.command).toHaveBeenCalledExactlyOnceWith(
      { type: 'next-match' },
      { background: true, automatic: true },
    );
  });

  it('stops for a fresh attention event and keeps running past events already seen', async () => {
    const s = setup();
    controller = s.controller;
    const notified = structuredClone(w);
    notified.inbox = [
      {
        id: 'window',
        year: w.year,
        day: 1,
        kind: 'window-open',
        title: '여름 이적시장이 열렸어요',
        detail: '9월 1일 마감',
        attention: true,
      },
    ];
    s.command.mockImplementation(async () => ({
      ok: true,
      requestId: 'test',
      view: { world: notified } as View,
    }));
    controller.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.store.getState().running).toBe(false);
    expect(controller.store.getState().reason).toBe('여름 이적시장이 열렸어요');
    gameStore.publish({ ...gameStore.getSnapshot(), view: { world: notified } as View });
    controller.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.store.getState().running).toBe(true);
    controller.setStopOn('window-open', false);
    expect(controller.store.getState().stopOn['window-open']).toBe(false);
  });
  it('stops on the eve of an own match and plays it through on resume', async () => {
    const eve = structuredClone(w);
    eve.calendar = { day: 6 };
    gameStore.publish({ ...gameStore.getSnapshot(), view: { world: eve } as View });
    const s = setup();
    gameStore.publish({ ...gameStore.getSnapshot(), view: { world: eve } as View });
    controller = s.controller;
    controller.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.command).not.toHaveBeenCalled();
    expect(controller.store.getState().matchEve).toBeDefined();
    expect(controller.store.getState().running).toBe(false);
    controller.playThrough();
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.command).toHaveBeenCalledTimes(1);
    expect(controller.store.getState().matchEve).toBeUndefined();
  });
  it('moves five days a tick, lands on a match eve and asks the host to stop only for enabled events', async () => {
    const s = setup();
    controller = s.controller;
    controller.setStopOnAll({
      match: true,
      'window-open': false,
      'window-close': false,
      'bid-response': true,
      'incoming-bid': false,
      'youth-intake': false,
      'staff-report': false,
      finance: true,
    });
    controller.setPace('five-days');
    controller.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.command).toHaveBeenLastCalledWith(
      { type: 'advance-days', days: 5, stop: ['match', 'bid-response', 'finance'] },
      { background: true, automatic: true },
    );
    // Four days before kickoff, a five-day step ends on the match eve instead.
    const near = structuredClone(w);
    near.calendar = { day: 3 };
    gameStore.publish({ ...gameStore.getSnapshot(), view: { world: near } as View });
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.command).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'advance-days', days: 3 }),
      { background: true, automatic: true },
    );
  });
  it('stops when the season closes and holds its review until it is seen', async () => {
    const s = setup();
    controller = s.controller;
    controller.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.store.getState().running).toBe(true);
    gameStore.publish({
      ...gameStore.getSnapshot(),
      view: { world: { ...w, year: w.year + 1, revision: w.revision + 1 } } as View,
    });
    expect(controller.store.getState().running).toBe(false);
    expect(controller.store.getState().seasonEnd).toBe(w.year);
    controller.clearSeasonEnd();
    expect(controller.store.getState().seasonEnd).toBeUndefined();
  });
});
