import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorld } from '../../../../packages/engine/src/index';
import type { MatchPlayback } from '../../../../packages/contracts/src/types';
import type { GameClient } from './client';
import { gameStore, initialClientState } from './store';
import { ProgressionController, stopsOf, STOP_KINDS } from './progression';
import type { View } from './protocol';

const w = createWorld({
  country: 'ENG',
  name: 'Clock Club',
  color: '#24543b',
  seed: 'clock-regression',
  level: 'easy' as const,
});
function playback(id: string): MatchPlayback {
  return {
    record: { id } as MatchPlayback['record'],
    frames: [{ minute: 1 }] as MatchPlayback['frames'],
    squads: [[], []],
  };
}
function setup(current?: MatchPlayback, world = w) {
  gameStore.publish({
    ...initialClientState,
    busy: false,
    processing: false,
    activity: 'idle',
    readonly: false,
    savedRevision: w.revision,
    playback: current,
    view: { world } as View,
  });
  const command = vi.fn(async () => ({ ok: true, requestId: 'test', view: { world: w } as View }));
  const saveSoon = vi.fn();
  const client = { command, cancel: vi.fn(), saveSoon } as unknown as GameClient;
  const controller = new ProgressionController(client);
  return { controller, command, client, saveSoon };
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
  it('resumes a clock that watching stopped once the owner leaves the match', async () => {
    const s = setup();
    controller = s.controller;
    controller.start();
    controller.beginWatch();
    expect(controller.store.getState().running).toBe(false);
    controller.setWatching(true);
    controller.setWatching(false);
    expect(controller.store.getState().running).toBe(true);
    // A match-eve watch resumes as playing through would; the owner's own stop never does.
    controller.pause();
    controller.beginWatch(true);
    controller.endWatch();
    expect(controller.store.getState().running).toBe(true);
    controller.pause();
    controller.beginWatch();
    controller.endWatch();
    expect(controller.store.getState().running).toBe(false);
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
    // x10 is one day every 0.1 s.
    controller.setPace('x10');
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.command).toHaveBeenCalledTimes(13);
    expect(s.command).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'advance-days', days: 1 }),
      { background: true, automatic: true },
    );
    controller.stop();
    await vi.advanceTimersByTimeAsync(2000);
    expect(s.command).toHaveBeenCalledTimes(13);
  });
  it('steps one day every 0.1 s at x10 beside a 0.8 s background save and saves when it stops', async () => {
    const s = setup();
    controller = s.controller;
    let revision = w.revision;
    // Each day takes the engine 20 ms; the client's view moves on with it, saved or not.
    s.command.mockImplementation(async () => {
      gameStore.publish({ ...gameStore.getSnapshot(), processing: true });
      await new Promise((resolve) => setTimeout(resolve, 20));
      const next = { ...w, revision: ++revision };
      gameStore.publish({
        ...gameStore.getSnapshot(),
        processing: false,
        view: { world: next } as View,
      });
      return { ok: true, requestId: 'day', view: { world: next } as View };
    });
    controller.setPace('x10');
    controller.start();
    await vi.advanceTimersByTimeAsync(150);
    expect(s.command).toHaveBeenCalledTimes(1);
    // The client saves that day in the background, which takes 0.8 s (→SAVE-8).
    const saved = revision;
    setTimeout(() => gameStore.publish({ ...gameStore.getSnapshot(), savedRevision: saved }), 800);
    await vi.advanceTimersByTimeAsync(400);
    expect(s.command).toHaveBeenCalledTimes(5);
    expect(gameStore.getSnapshot().savedRevision).toBe(w.revision);
    await vi.advanceTimersByTimeAsync(500);
    expect(s.command).toHaveBeenCalledTimes(10);
    expect(gameStore.getSnapshot().savedRevision).toBe(saved);
    // Ordinary steps never owe days: each carries one.
    const calls = s.command.mock.calls as unknown as [{ days: number }][];
    expect(calls.map(([cmd]) => cmd.days)).toEqual(Array(10).fill(1));
    // The clock never saves per step; stopping it saves at once.
    expect(s.saveSoon).not.toHaveBeenCalled();
    controller.stop();
    expect(s.saveSoon).toHaveBeenCalledTimes(1);
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
    notified.settings!.observations.windowOpen = true;
    notified.calendar = { day: 1 };
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
  });
  it('plays on once the owner decides the last event that stopped a running clock (→WEB-42)', async () => {
    const s = setup();
    controller = s.controller;
    const item = (id: string) => ({
      id,
      year: w.year,
      day: 1,
      kind: 'window-open' as const,
      title: `소식 ${id}`,
      detail: '-',
      attention: true,
    });
    const notified = structuredClone(w);
    notified.settings!.observations.windowOpen = true;
    notified.calendar = { day: 1 };
    notified.inbox = [item('a'), item('b')];
    s.command.mockImplementation(async () => ({
      ok: true,
      requestId: 'test',
      view: { world: notified } as View,
    }));
    controller.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.store.getState().running).toBe(false);
    const read = (...ids: string[]) => {
      const world = structuredClone(notified);
      world.inbox = world.inbox!.map((one) =>
        ids.includes(one.id) ? { ...one, read: true } : one,
      );
      gameStore.publish({ ...gameStore.getSnapshot(), view: { world } as View });
    };
    // One of two decided: the other still waits, so the clock stays stopped.
    read('a');
    controller.eventDecided();
    expect(controller.store.getState().running).toBe(false);
    read('a', 'b');
    controller.eventDecided();
    expect(controller.store.getState().running).toBe(true);
    // A clock the owner stopped himself never restarts on a decision.
    controller.pause();
    controller.eventDecided();
    expect(controller.store.getState().running).toBe(false);
  });
  it('derives independent observation and business hints from game settings', () => {
    const direct = structuredClone(w);
    expect(stopsOf(direct).match).toBe(true);
    expect(stopsOf(direct)['window-open']).toBe(false);
    expect(stopsOf(direct)['bid-response']).toBe(true);
    direct.settings!.responsibilities.recruitment = 'delegated';
    direct.settings!.observations.windowOpen = true;
    expect(stopsOf(direct)['bid-response']).toBe(false);
    expect(stopsOf(direct)['incoming-bid']).toBe(true);
    expect(stopsOf(direct)['window-open']).toBe(true);
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
  it("catches up the days a slow step held back, lands on a match eve and asks the host to stop only for the level's events", async () => {
    const s = setup();
    controller = s.controller;
    // Each step itself takes 0.45 s, so at x10 the days pile up behind it (at most five).
    s.command.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ ok: true, requestId: 'slow', view: { world: w } as View }),
            450,
          ),
        ),
    );
    controller.setPace('x10');
    controller.start();
    await vi.advanceTimersByTimeAsync(100);
    expect(s.command).toHaveBeenLastCalledWith(
      { type: 'advance-days', days: 1, stop: STOP_KINDS.filter((kind) => stopsOf(w)[kind]) },
      { background: true, automatic: true },
    );
    await vi.advanceTimersByTimeAsync(500);
    expect(s.command).toHaveBeenCalledTimes(2);
    expect(s.command).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'advance-days', days: 5 }),
      { background: true, automatic: true },
    );
    // Four days before kickoff, a five-day catch-up ends on the match eve instead.
    const near = structuredClone(w);
    near.calendar = { day: 3 };
    gameStore.publish({ ...gameStore.getSnapshot(), view: { world: near } as View });
    await vi.advanceTimersByTimeAsync(500);
    expect(s.command).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'advance-days', days: 3 }),
      { background: true, automatic: true },
    );
    // Time spent stopped is not owed: a restart begins with one day again.
    controller.pause();
    await vi.advanceTimersByTimeAsync(2000);
    gameStore.publish({ ...gameStore.getSnapshot(), view: { world: w } as View });
    controller.start();
    await vi.advanceTimersByTimeAsync(100);
    expect(s.command).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'advance-days', days: 1 }),
      { background: true, automatic: true },
    );
  });
  it('plays on through the season close, so an unattended clock never ends', async () => {
    const s = setup();
    controller = s.controller;
    controller.start();
    await vi.advanceTimersByTimeAsync(1000);
    const next = { ...w, year: w.year + 1, revision: w.revision + 1 };
    gameStore.publish({
      ...gameStore.getSnapshot(),
      savedRevision: next.revision,
      view: { world: next } as View,
    });
    expect(controller.store.getState().running).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.command).toHaveBeenCalledTimes(2);
  });
});

describe('background play (WEB-64)', () => {
  /** Background pacing is isolated from observation stops. */
  const quiet = structuredClone(w);
  quiet.settings!.observations.matchEve = false;
  quiet.settings!.observations.windowOpen = false;
  /** A host that really advances the calendar by the days asked. */
  function calendarHost(s: ReturnType<typeof setup>) {
    let day = 0;
    s.command.mockImplementation(async (...args: unknown[]) => {
      const cmd = args[0] as { days: number };
      day += cmd.days;
      const next = { ...quiet, calendar: { day } };
      gameStore.publish({ ...gameStore.getSnapshot(), view: { world: next } as View });
      return { ok: true, requestId: 'day', view: { world: next } as View };
    });
    return () => day;
  }
  const memory = () => {
    const data = new Map<string, string>();
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    };
  };
  it('plays every owed day while hidden even when the browser throttles its timer', async () => {
    vi.stubGlobal('localStorage', memory());
    const s = setup(undefined, quiet);
    controller = s.controller;
    const day = calendarHost(s);
    controller.setHidden(true);
    expect(controller.store.getState().running).toBe(false);
    controller.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(day()).toBe(1);
    // A throttled hidden tab wakes 90 s later: 90 days are owed and paid in 30-day steps.
    vi.setSystemTime(Date.now() + 89_000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(day()).toBe(91);
    const calls = s.command.mock.calls as unknown as [{ days: number }][];
    expect(calls.slice(1).map(([cmd]) => cmd.days)).toEqual([30, 30, 30]);
    expect(controller.store.getState().running).toBe(true);
    // Back after more than a minute: the run is summarized from where the owner left it.
    controller.setHidden(false);
    expect(controller.store.getState().away).toMatchObject({ day: 0 });
    controller.clearAway();
    vi.unstubAllGlobals();
  });

  it('plays a slept page only up to the away limit and can pause hidden tabs instead', async () => {
    vi.stubGlobal('localStorage', memory());
    const s = setup(undefined, quiet);
    controller = s.controller;
    controller.setBackground({ away: 'month' });
    const day = calendarHost(s);
    controller.start();
    await vi.advanceTimersByTimeAsync(1000);
    // The laptop slept for an hour: 3,600 days owed, 30 played, then the clock carries on.
    vi.setSystemTime(Date.now() + 3_600_000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(day()).toBe(31);
    expect(controller.store.getState().running).toBe(true);
    expect(controller.store.getState().away).toBeDefined();
    // The owner may keep the old behaviour: a hidden tab pauses.
    controller.clearAway();
    controller.setBackground({ hidden: false });
    controller.setHidden(true);
    const before = s.command.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(s.command.mock.calls.length).toBe(before);
    vi.unstubAllGlobals();
  });

  it('resumes a clock left running when the page closed, once the game is shown', async () => {
    const storage = memory();
    vi.stubGlobal('localStorage', storage);
    storage.setItem(
      'haeram-soccor:clock',
      JSON.stringify({ [w.id]: { running: true, pace: 'x2', at: Date.now() - 10_000 } }),
    );
    const s = setup(undefined, quiet);
    controller = s.controller;
    const day = calendarHost(s);
    controller.resumeAway();
    await vi.advanceTimersByTimeAsync(0);
    // Ten seconds at x2 owe twenty days; visible, the first step carries the usual five at most.
    expect(controller.store.getState()).toMatchObject({ running: true, pace: 'x2' });
    expect(day()).toBe(5);
    // A stopped clock is stored as stopped, so the next visit does not resume it.
    controller.pause();
    const stored = JSON.parse(storage.getItem('haeram-soccor:clock')!);
    expect(stored[w.id].running).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe('explicit automatic and manual modes', () => {
  const manual = () => {
    const world = structuredClone(w);
    world.settings!.mode = 'manual';
    return world;
  };
  it('manual-no-resume-after-watch: every resume entry point leaves manual stopped', async () => {
    const world = manual(),
      s = setup(undefined, world);
    controller = s.controller;
    controller.start();
    controller.beginWatch(true);
    controller.endWatch();
    controller.eventDecided();
    controller.resumeAway();
    controller.setHidden(true);
    await vi.advanceTimersByTimeAsync(10000);
    controller.setHidden(false);
    expect(controller.store.getState().running).toBe(false);
    expect(s.command).not.toHaveBeenCalled();
    world.calendar = { day: 6 };
    gameStore.publish({ ...gameStore.getSnapshot(), view: { world } as View });
    s.command.mockResolvedValue({ ok: true, requestId: 'match-result', view: { world } as View });
    await controller.playThrough();
    expect(s.command).toHaveBeenCalledExactlyOnceWith(
      { type: 'advance-days', days: 1 },
      { background: true },
    );
    expect(controller.store.getState().running).toBe(false);
  });
  it('repeated-next-event-single-flight: sends one request and never starts an unattended run', async () => {
    const world = manual(),
      s = setup(undefined, world);
    controller = s.controller;
    let finish!: (value: { ok: boolean; requestId: string; view: View }) => void;
    s.command.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = controller.nextEvent(),
      duplicate = controller.nextEvent();
    expect(s.command).toHaveBeenCalledExactlyOnceWith({ type: 'next-event' }, { background: true });
    world.calendar = { day: 6 };
    finish({ ok: true, requestId: 'arrival', view: { world } as View });
    await Promise.all([first, duplicate]);
    await vi.advanceTimersByTimeAsync(10000);
    expect(s.command).toHaveBeenCalledTimes(1);
    expect(controller.store.getState().running).toBe(false);
    expect(controller.store.getState().matchEve).toBeDefined();
  });
  it('automatic-resume-after-last-decision: reading a sale notice never settles the actual sale', async () => {
    const s = setup();
    controller = s.controller;
    const waiting = structuredClone(w);
    waiting.bids = [
      {
        id: 'held-sale',
        direction: 'in',
        playerId: waiting.players[0].id,
        fee: '10',
        year: w.year,
        day: 0,
        due: 10,
        status: 'pending',
      },
    ];
    s.command.mockResolvedValue({
      ok: true,
      requestId: 'arrival',
      view: { world: waiting } as View,
    });
    controller.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.store.getState().running).toBe(false);
    waiting.inbox = [];
    gameStore.publish({ ...gameStore.getSnapshot(), view: { world: waiting } as View });
    controller.eventDecided();
    controller.start();
    expect(controller.store.getState().running).toBe(false);
    waiting.bids[0].status = 'rejected';
    gameStore.publish({ ...gameStore.getSnapshot(), view: { world: waiting } as View });
    controller.eventDecided();
    expect(controller.store.getState().running).toBe(true);
  });
  it('mode-change-during-inflight clears automatic debt and cannot resume from an old reply', async () => {
    const s = setup();
    controller = s.controller;
    let finish!: (value: { ok: boolean; requestId: string; view: View }) => void;
    s.command.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    controller.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.command).toHaveBeenCalledTimes(1);
    const world = manual();
    gameStore.publish({ ...gameStore.getSnapshot(), view: { world } as View });
    expect(controller.store.getState().running).toBe(false);
    expect(s.client.cancel).toHaveBeenCalled();
    finish({ ok: true, requestId: 'old-tick', view: { world: w } as View });
    await vi.advanceTimersByTimeAsync(10000);
    controller.eventDecided();
    controller.endWatch();
    expect(s.command).toHaveBeenCalledTimes(1);
    const automatic = structuredClone(world);
    automatic.settings!.mode = 'automatic';
    gameStore.publish({ ...gameStore.getSnapshot(), view: { world: automatic } as View });
    await vi.advanceTimersByTimeAsync(10000);
    expect(s.command).toHaveBeenCalledTimes(1);
    s.command.mockResolvedValue({
      ok: true,
      requestId: 'restart',
      view: { world: automatic } as View,
    });
    controller.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.command).toHaveBeenCalledTimes(2);
    expect(s.command).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'advance-days', days: 1 }),
      { background: true, automatic: true },
    );
  });
  it('manual-no-away-debt ignores a previously running browser clock record', async () => {
    const world = manual();
    const data = new Map([
      [
        'haeram-soccor:clock',
        JSON.stringify({ [world.id]: { running: true, pace: 'x10', at: Date.now() - 3600000 } }),
      ],
    ]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    });
    try {
      const s = setup(undefined, world);
      controller = s.controller;
      controller.resumeAway();
      await vi.advanceTimersByTimeAsync(10000);
      expect(s.command).not.toHaveBeenCalled();
      expect(controller.store.getState().running).toBe(false);
      const automatic = structuredClone(world);
      automatic.settings!.mode = 'automatic';
      gameStore.publish({ ...gameStore.getSnapshot(), view: { world: automatic } as View });
      expect(JSON.parse(data.get('haeram-soccor:clock')!)[world.id].running).toBe(false);
      controller.resumeAway();
      await vi.advanceTimersByTimeAsync(10000);
      expect(s.command).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('does not publish an old manual arrival after the active world is replaced', async () => {
    const world = manual(),
      s = setup(undefined, world);
    controller = s.controller;
    let finish!: (value: { ok: boolean; requestId: string; view: View }) => void;
    s.command.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const task = controller.nextEvent();
    const replacement = manual();
    replacement.id += ':replacement';
    gameStore.publish({ ...gameStore.getSnapshot(), view: { world: replacement } as View });
    world.calendar = { day: 6 };
    finish({ ok: true, requestId: 'old-world', view: { world } as View });
    await task;
    expect(controller.store.getState().matchEve).toBeUndefined();
    expect(controller.store.getState().running).toBe(false);
  });
  it('keeps manual requests blocked by ownership, worker/save errors and current business decisions', async () => {
    const world = manual(),
      s = setup(undefined, world);
    controller = s.controller;
    for (const blocked of [
      { readonly: true },
      { error: 'save failed' },
      { error: 'worker failed' },
    ]) {
      gameStore.publish({
        ...gameStore.getSnapshot(),
        readonly: false,
        error: undefined,
        ...blocked,
      });
      await controller.nextEvent();
    }
    gameStore.publish({ ...gameStore.getSnapshot(), readonly: false, error: undefined });
    world.settings!.responsibilities.manager = 'direct';
    world.manager.interim = true;
    await controller.nextEvent();
    expect(s.command).not.toHaveBeenCalled();
  });
});
