import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorld } from '../../../../packages/engine/src/index';
import { currentDay } from '../../../../packages/engine/src/calendar';
import type { Command, World } from '../../../../packages/contracts/src/types';
import { GameClient } from './client';
import type { Body, Reply, Request, View } from './protocol';
import { gameStore, initialClientState } from './store';
import {
  CATCH_UP_STEP_DAYS,
  PACE_MS,
  ProgressionController,
  RUN_AHEAD_DAYS,
  type Pace,
} from './progression';

const base = createWorld({
  country: 'ENG',
  name: 'Ahead Club',
  color: '#24543b',
  seed: 'run-ahead',
  level: 'easy' as const,
});
/** No observation stops, so only the pace and the step times shape the run. */
function quiet() {
  const world = structuredClone(base);
  world.settings!.observations.matchEve = false;
  world.settings!.observations.windowOpen = false;
  return world;
}
const ONE_DAY_AT_A_TIME: Record<Pace, number> = { x1: 0, x2: 0, x5: 0, x10: 0 };
/**
 * Step times modelled on the 261027 measurement with the result-identical speed-ups (its trace
 * stays on perf/integrated): an ordinary day well inside x10's 0.1 s, a midweek tie day just over
 * it and a league round day, our grid match among its fixtures, four beats long; on average the
 * engine just keeps up with x10.
 */
const measured = (day: number) => (day % 7 === 0 ? 400 : day % 7 === 4 ? 120 : 25);

/** A read the fake worker was sent, with where the worker and the screen stood when it went. */
interface Posted {
  body: Body;
  head: number;
  showing: number;
  held: number;
  answer(reply: Reply): void;
  fail(error: Error): void;
}
/**
 * A fake engine worker behind the client's hold-and-reveal: one step at a time, each taking the
 * time `stepMs` gives its days; automatic days are held until revealed, and every day shown is
 * recorded with when it was shown. The client's reads go through its own gate and are recorded
 * as they are posted, waiting for the test's answer.
 */
function worker(
  template: World,
  stepMs: (day: number) => number = () => 20,
  at = (day: number) =>
    ({ ...template, calendar: { day }, revision: template.revision + day }) as World,
) {
  let day = currentDay(template);
  const held: View[] = [];
  const shown: { day: number; at: number }[] = [];
  const reads: Posted[] = [];
  const showing = () => currentDay(gameStore.getSnapshot().view!.world as World);
  const command = vi.fn(async (cmd: Command, options: { automatic?: boolean } = {}) => {
    const days = cmd.type === 'advance-days' ? cmd.days : 0;
    let ms = 0;
    for (let i = 1; i <= days; i++) ms += stepMs(day + i);
    await new Promise((resolve) => setTimeout(resolve, ms));
    day += days;
    const view = { world: at(day) } as View;
    if (options.automatic) held.push(view);
    else gameStore.publish({ ...gameStore.getSnapshot(), view });
    return { ok: true, requestId: `day-${day}`, view };
  });
  const saveSoon = vi.fn();
  const client = Object.assign(Object.create(GameClient.prototype), {
    command,
    reveal(all = false) {
      const out = held.splice(0, all ? held.length : 1);
      if (!out.length) return 0;
      gameStore.publish({ ...gameStore.getSnapshot(), view: out.at(-1) });
      for (const view of out) shown.push({ day: currentDay(view.world as World), at: Date.now() });
      return out.length;
    },
    cancel: vi.fn(),
    saveSoon,
    setClockRunning: (clockRunning: boolean) => gameStore.setState({ clockRunning }),
    rpc: (body: Body) =>
      new Promise<Reply>((answer, fail) =>
        reads.push({ body, head: day, showing: showing(), held: held.length, answer, fail }),
      ),
  }) as GameClient;
  Object.defineProperty(client, 'state', { get: () => gameStore.getSnapshot() });
  gameStore.publish({
    ...initialClientState,
    busy: false,
    processing: false,
    activity: 'idle',
    readonly: false,
    savedRevision: template.revision,
    view: { world: at(day) } as View,
  });
  return {
    client,
    command,
    saveSoon,
    held,
    shown,
    reads,
    /** The day the worker stands on. */
    head: () => day,
    /** The day on screen. */
    showing,
    days: () => (command.mock.calls as unknown as [{ days: number }][]).map(([c]) => c.days),
  };
}
type Fake = ReturnType<typeof worker>;
const controllers: ProgressionController[] = [];
function clock(fake: Fake, depth?: Record<Pace, number>) {
  const controller = new ProgressionController(fake.client, depth);
  controllers.push(controller);
  return controller;
}
/** Days shown at least one and a half beats after the one before: a visible stall (as T522 reads). */
function stalls(fake: Fake, pace: Pace) {
  let count = 0;
  for (let i = 1; i < fake.shown.length; i++)
    if (fake.shown[i].at - fake.shown[i - 1].at >= PACE_MS[pace] * 1.5) count++;
  return count;
}
/** Every day shown is the day after the one before it. */
function consecutive(fake: Fake, from: number) {
  return fake.shown.map((s) => s.day).every((day, i) => day === from + 1 + i);
}
const running = (controller: ProgressionController) => controller.store.getState().running;
const locked = () => !!gameStore.getState().clockRunning;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
  gameStore.publish({ ...initialClientState });
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('computing ahead of the shown date (WEB-18)', () => {
  it('x10 for 30 s shows no skipped day and fewer stalls than computing a day at a time', async () => {
    const play = async (depth?: Record<Pace, number>) => {
      const fake = worker(quiet(), measured);
      const controller = clock(fake, depth);
      controller.setPace('x10');
      controller.start();
      await vi.advanceTimersByTimeAsync(30_000);
      controller.dispose();
      return fake;
    };
    const ahead = await play(),
      alone = await play(ONE_DAY_AT_A_TIME);
    expect(consecutive(ahead, 0)).toBe(true);
    expect(consecutive(alone, 0)).toBe(true);
    // The engine never stood more than the pace's run-ahead days past the shown date.
    expect(ahead.head() - ahead.shown.at(-1)!.day).toBeLessThanOrEqual(RUN_AHEAD_DAYS.x10);
    // Computing ahead absorbs the round days: no stall and 300 days shown, against 44 stalls and
    // 157 days a day at a time.
    expect(stalls(alone, 'x10')).toBeGreaterThan(0);
    expect(stalls(ahead, 'x10')).toBeLessThan(stalls(alone, 'x10'));
    expect(stalls(ahead, 'x10')).toBeLessThanOrEqual(stalls(alone, 'x10') / 4);
    expect(ahead.shown.length).toBeGreaterThan(alone.shown.length * 1.5);
  });

  it('keeps computing back to back while fewer than the pace’s days are held', async () => {
    const fake = worker(quiet(), () => 10);
    const controller = clock(fake);
    controller.setPace('x10');
    controller.start();
    // 10 ms steps: seven days are computed before the first is due at 0.1 s, and no more.
    await vi.advanceTimersByTimeAsync(PACE_MS.x10 - 1);
    expect(fake.head()).toBe(RUN_AHEAD_DAYS.x10);
    expect(fake.shown).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(fake.shown.map((s) => s.day)).toEqual([1]);
    // Showing one frees a place: the next is computed at once.
    await vi.advanceTimersByTimeAsync(10);
    expect(fake.head()).toBe(RUN_AHEAD_DAYS.x10 + 1);
    await vi.advanceTimersByTimeAsync(PACE_MS.x10 * 3);
    expect(fake.shown.map((s) => s.at - fake.shown[0].at)).toEqual([0, 100, 200, 300]);
    expect(fake.held).toHaveLength(RUN_AHEAD_DAYS.x10);
  });

  it("the owner's stop shows the held days at the pace, then unlocks and saves once", async () => {
    const fake = worker(quiet());
    const controller = clock(fake);
    controller.setPace('x10');
    controller.start();
    await vi.advanceTimersByTimeAsync(350);
    expect(fake.held).toHaveLength(RUN_AHEAD_DAYS.x10);
    const sent = fake.command.mock.calls.length,
      shownBefore = fake.shown.length;
    controller.pause();
    expect(running(controller)).toBe(false);
    // Management stays locked and nothing is saved until the computed days are shown (→WEB-97).
    expect(locked()).toBe(true);
    await vi.advanceTimersByTimeAsync(300);
    expect(fake.shown).toHaveLength(shownBefore + 3);
    expect(locked()).toBe(true);
    expect(fake.saveSoon).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(PACE_MS.x10 * RUN_AHEAD_DAYS.x10);
    expect(fake.held).toHaveLength(0);
    expect(locked()).toBe(false);
    // The stop's save follows the last day shown, so it holds the date the clock stopped on.
    expect(fake.saveSoon).toHaveBeenCalledOnce();
    expect(fake.showing()).toBe(fake.head());
    expect(consecutive(fake, 0)).toBe(true);
    expect(stalls(fake, 'x10')).toBe(0);
    expect(fake.command.mock.calls.length).toBe(sent);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fake.command.mock.calls.length).toBe(sent);
    expect(fake.saveSoon).toHaveBeenCalledOnce();
  });

  it('a step still in flight at the stop is shown at the pace before the lock lifts', async () => {
    const fake = worker(quiet(), () => 250);
    const controller = clock(fake);
    controller.setPace('x10');
    controller.start();
    // Slow days keep the buffer empty: one in flight, none held.
    await vi.advanceTimersByTimeAsync(600);
    expect(fake.held).toHaveLength(0);
    controller.pause();
    expect(fake.client.cancel).toHaveBeenCalled();
    expect(locked()).toBe(true);
    await vi.advanceTimersByTimeAsync(250);
    expect(locked()).toBe(false);
    expect(fake.showing()).toBe(fake.head());
    expect(fake.saveSoon).toHaveBeenCalledOnce();
  });

  it('a stopping event lands on its day with nothing computed past it', async () => {
    const template = quiet();
    template.settings!.observations.windowOpen = true;
    const window = {
      id: 'window',
      year: template.year,
      day: 3,
      kind: 'window-open' as const,
      title: '여름 이적시장이 열렸어요',
      detail: '9월 1일 마감',
      attention: true,
    };
    const fake = worker(
      template,
      () => 20,
      (day) =>
        ({
          ...template,
          calendar: { day },
          revision: template.revision + day,
          inbox: day >= 3 ? [window] : [],
        }) as World,
    );
    const controller = clock(fake);
    controller.setPace('x10');
    controller.start();
    await vi.advanceTimersByTimeAsync(250);
    expect(fake.head()).toBe(3);
    expect(running(controller)).toBe(true);
    await vi.advanceTimersByTimeAsync(50);
    expect(running(controller)).toBe(false);
    expect(controller.store.getState().reason).toBe(window.title);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fake.head()).toBe(3);
    expect(fake.showing()).toBe(3);
    expect(fake.shown.map((s) => s.day)).toEqual([1, 2, 3]);
    expect(fake.saveSoon).toHaveBeenCalled();
  });

  it('an own match eve that stops for observation lands on its day with nothing computed past it', async () => {
    const template = structuredClone(base);
    template.settings!.observations.windowOpen = false;
    const fake = worker(template);
    const controller = clock(fake);
    controller.setPace('x10');
    controller.start();
    await vi.advanceTimersByTimeAsync(2000);
    // Our first fixture is on day 7: the clock stops on its eve, shown, with the world there.
    expect(fake.head()).toBe(6);
    expect(fake.showing()).toBe(6);
    expect(consecutive(fake, 0)).toBe(true);
    expect(running(controller)).toBe(false);
    expect(controller.store.getState().matchEve).toBeDefined();
    expect(locked()).toBe(false);
  });

  it('entering the owner office shows the held days at once, and a step in flight as it lands', async () => {
    const fake = worker(quiet());
    const controller = clock(fake);
    controller.setPace('x10');
    controller.start();
    // At 0.31 s three days are shown, six held and the tenth is being computed.
    await vi.advanceTimersByTimeAsync(310);
    expect(fake.held).toHaveLength(6);
    controller.enterOffice();
    expect(running(controller)).toBe(false);
    expect(fake.held).toHaveLength(0);
    expect(fake.showing()).toBe(9);
    expect(new Set(fake.shown.slice(3).map((s) => s.at)).size).toBe(1);
    expect(fake.saveSoon).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10);
    expect(fake.showing()).toBe(10);
    expect(fake.showing()).toBe(fake.head());
    expect(locked()).toBe(false);
    // What it played is saved too, and nothing more is computed in the office.
    expect(fake.saveSoon).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fake.head()).toBe(10);
    expect(consecutive(fake, 0)).toBe(true);
    controller.leaveOffice();
    expect(running(controller)).toBe(true);
  });

  it('the office shows at once what the owner’s stop was still showing', async () => {
    const fake = worker(quiet());
    const controller = clock(fake);
    controller.setPace('x10');
    controller.start();
    await vi.advanceTimersByTimeAsync(350);
    controller.pause();
    expect(locked()).toBe(true);
    controller.enterOffice();
    expect(fake.held).toHaveLength(0);
    expect(fake.showing()).toBe(fake.head());
    expect(locked()).toBe(false);
    expect(fake.saveSoon).toHaveBeenCalledOnce();
    // Entering did not stop the clock, so leaving does not start it.
    controller.leaveOffice();
    expect(running(controller)).toBe(false);
  });

  it('leaving play for the slot screen shows the held days at once and saves once', async () => {
    const fake = worker(quiet());
    const controller = clock(fake);
    controller.setPace('x10');
    controller.start();
    await vi.advanceTimersByTimeAsync(350);
    expect(fake.held).toHaveLength(RUN_AHEAD_DAYS.x10);
    controller.pause(true);
    expect(running(controller)).toBe(false);
    expect(fake.held).toHaveLength(0);
    expect(fake.showing()).toBe(fake.head());
    expect(locked()).toBe(false);
    expect(fake.saveSoon).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(2000);
    expect(fake.showing()).toBe(fake.head());
    expect(consecutive(fake, 0)).toBe(true);
  });

  it('a late day shows as it lands and the next one a full interval after it', async () => {
    // At x1 day 4 is asked for once day 1 shows at 1 s; it takes 3.53 s, landing 0.53 s after its
    // turn at 4 s. The days after it are quick.
    const fake = worker(quiet(), (day) => (day === 4 ? 3530 : 10));
    const controller = clock(fake);
    const startedAt = Date.now();
    controller.start();
    await vi.advanceTimersByTimeAsync(8000);
    expect(fake.shown.slice(0, 7).map((s) => s.at - startedAt)).toEqual([
      1000, 2000, 3000, 4530, 5530, 6530, 7530,
    ]);
    expect(consecutive(fake, 0)).toBe(true);
  });

  it('hiding the tab shows the held days at once and computes nothing ahead while hidden', async () => {
    const fake = worker(quiet());
    const controller = clock(fake);
    controller.setPace('x10');
    controller.start();
    await vi.advanceTimersByTimeAsync(350);
    expect(fake.held).toHaveLength(RUN_AHEAD_DAYS.x10);
    controller.setHidden(true);
    expect(fake.held).toHaveLength(0);
    expect(fake.showing()).toBe(fake.head());
    expect(running(controller)).toBe(true);
    for (let i = 0; i < 20; i++) {
      await vi.advanceTimersByTimeAsync(50);
      // Each hidden step is shown as it lands: the shown date is where the worker stands.
      expect(fake.held).toHaveLength(0);
      if (!fake.command.mock.results.some((r) => r.type === 'incomplete'))
        expect(fake.showing()).toBe(fake.head());
    }
    expect(fake.head()).toBeGreaterThan(10);
    expect(consecutive(fake, 0)).toBe(true);
  });

  it('a return plays the time away as it lands before computing ahead again (→WEB-64)', async () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    });
    const template = quiet();
    data.set(
      'haeram-soccor:clock',
      JSON.stringify({ [template.id]: { running: true, pace: 'x10', at: Date.now() - 5000 } }),
    );
    const fake = worker(template, () => 2);
    const controller = clock(fake);
    controller.resumeAway();
    // Five seconds at x10 owe fifty days, played in catch-up steps and shown as each lands.
    await vi.advanceTimersByTimeAsync(2 * CATCH_UP_STEP_DAYS);
    expect(fake.days()).toEqual([CATCH_UP_STEP_DAYS, 50 - CATCH_UP_STEP_DAYS]);
    expect(fake.held).toHaveLength(0);
    expect(fake.showing()).toBe(CATCH_UP_STEP_DAYS);
    await vi.advanceTimersByTimeAsync(2 * (50 - CATCH_UP_STEP_DAYS));
    expect(fake.days().slice(0, 2)).toEqual([CATCH_UP_STEP_DAYS, 50 - CATCH_UP_STEP_DAYS]);
    expect(fake.showing()).toBe(50);
    expect(fake.held).toHaveLength(0);
    // Then the shown clock computes ahead again, a day at a time.
    await vi.advanceTimersByTimeAsync(1000);
    expect(
      fake
        .days()
        .slice(2)
        .every((days) => days === 1),
    ).toBe(true);
    expect(fake.held.length).toBeGreaterThan(0);
    expect(consecutive(fake, 0)).toBe(false);
    expect(fake.shown.slice(2).every((s, i) => s.day === 51 + i)).toBe(true);
  });
});

describe('pace changes while days are held (WEB-18)', () => {
  it('x10 → x1 with a full buffer shows the held days at x10, then new days at x1', async () => {
    const fake = worker(quiet());
    const controller = clock(fake);
    controller.setPace('x10');
    controller.start();
    await vi.advanceTimersByTimeAsync(350);
    expect(fake.held).toHaveLength(RUN_AHEAD_DAYS.x10);
    const shownBefore = fake.shown.length,
      lastBefore = fake.shown.at(-1)!;
    controller.setPace('x1');
    await vi.advanceTimersByTimeAsync(PACE_MS.x10 * RUN_AHEAD_DAYS.x10);
    const held = fake.shown.slice(shownBefore, shownBefore + RUN_AHEAD_DAYS.x10);
    expect(held.map((s) => s.at - lastBefore.at)).toEqual(
      Array.from({ length: RUN_AHEAD_DAYS.x10 }, (_, i) => (i + 1) * PACE_MS.x10),
    );
    // The new pace computes only its own run-ahead days.
    expect(fake.held.length).toBeLessThanOrEqual(RUN_AHEAD_DAYS.x1);
    await vi.advanceTimersByTimeAsync(PACE_MS.x1 * 3);
    const after = fake.shown.slice(shownBefore + RUN_AHEAD_DAYS.x10 - 1);
    expect(after.slice(1).map((s, i) => s.at - after[i].at)).toEqual(Array(3).fill(PACE_MS.x1));
    expect(consecutive(fake, 0)).toBe(true);
  });

  it('x1 → x10 shows the held days at x10', async () => {
    const fake = worker(quiet());
    const controller = clock(fake);
    controller.start();
    await vi.advanceTimersByTimeAsync(1500);
    expect(fake.held).toHaveLength(RUN_AHEAD_DAYS.x1);
    const shownBefore = fake.shown.length,
      changedAt = Date.now();
    controller.setPace('x10');
    await vi.advanceTimersByTimeAsync(PACE_MS.x10 * RUN_AHEAD_DAYS.x1);
    // Half a second after the last day at x1 the next was due at x10: it shows at once, the rest
    // one x10 beat apart.
    const held = fake.shown.slice(shownBefore, shownBefore + RUN_AHEAD_DAYS.x1);
    expect(held.map((s) => s.at - changedAt)).toEqual([0, 100, 200]);
    expect(consecutive(fake, 0)).toBe(true);
  });
});

describe('reads outside the command queue wait for the shown date (WEB-18)', () => {
  const record = {} as NonNullable<Reply['headToHead']>;
  const answered = { ok: true, requestId: 'read', headToHead: record } as Reply;

  it('with days held a head-to-head read shows them at once before it is posted', async () => {
    const fake = worker(quiet());
    const controller = clock(fake);
    controller.setPace('x10');
    controller.start();
    await vi.advanceTimersByTimeAsync(350);
    expect(fake.held).toHaveLength(RUN_AHEAD_DAYS.x10);
    const sent = fake.command.mock.calls.length;
    const read = fake.client.headToHead('rival');
    // Nothing was in flight: every held day is shown at once and the read goes from that day.
    expect(fake.reads).toMatchObject([
      { body: { type: 'head-to-head', club: 'rival' }, head: 10, showing: 10, held: 0 },
    ]);
    expect(new Set(fake.shown.slice(3).map((s) => s.at)).size).toBe(1);
    // The clock keeps running and management stays locked, but nothing is computed until it is
    // answered.
    await vi.advanceTimersByTimeAsync(2000);
    expect(running(controller)).toBe(true);
    expect(locked()).toBe(true);
    expect(fake.command.mock.calls.length).toBe(sent);
    expect(fake.showing()).toBe(10);
    fake.reads[0].answer(answered);
    await expect(read).resolves.toBe(record);
    // Then the run carries on from the shown day, computing ahead again.
    await vi.advanceTimersByTimeAsync(PACE_MS.x10 * 3);
    expect(fake.command.mock.calls.length).toBeGreaterThan(sent);
    expect(fake.held.length).toBeGreaterThan(0);
    expect(fake.shown.length).toBeGreaterThan(10);
    expect(consecutive(fake, 0)).toBe(true);
  });

  it('a read started during a step in flight goes once that step is shown; an error resumes the run', async () => {
    const fake = worker(quiet());
    const controller = clock(fake);
    controller.setPace('x10');
    controller.start();
    // At 0.31 s three days are shown, six held and the tenth is being computed.
    await vi.advanceTimersByTimeAsync(310);
    expect(fake.held).toHaveLength(6);
    const outcome = fake.client.headToHead('rival').catch((error: Error) => error.message);
    expect(fake.reads).toHaveLength(0);
    // The worker would answer it after the step, so the step lands and is shown first.
    await vi.advanceTimersByTimeAsync(10);
    expect(fake.reads).toMatchObject([{ head: 10, showing: 10, held: 0 }]);
    const sent = fake.command.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(fake.command.mock.calls.length).toBe(sent);
    fake.reads[0].fail(new Error('worker'));
    expect(await outcome).toBe('worker');
    await vi.advanceTimersByTimeAsync(PACE_MS.x10 * 3);
    expect(fake.command.mock.calls.length).toBeGreaterThan(sent);
    expect(running(controller)).toBe(true);
    expect(consecutive(fake, 0)).toBe(true);
  });

  it('a read with nothing held goes at once and changes nothing', async () => {
    const fake = worker(quiet());
    const controller = clock(fake);
    // A stopped clock.
    const read = fake.client.headToHead('rival');
    expect(fake.reads).toMatchObject([{ head: 0, showing: 0, held: 0 }]);
    fake.reads[0].answer(answered);
    await read;
    await vi.advanceTimersByTimeAsync(2000);
    expect(fake.command).not.toHaveBeenCalled();
    expect(fake.shown).toEqual([]);
    expect(running(controller)).toBe(false);
    expect(locked()).toBe(false);
    // A hidden tab shows each step as it lands.
    controller.setPace('x10');
    controller.start();
    await vi.advanceTimersByTimeAsync(350);
    controller.setHidden(true);
    const shown = fake.shown.length;
    const hidden = fake.client.headToHead('rival');
    expect(fake.reads[1]).toMatchObject({ head: fake.head(), showing: fake.head(), held: 0 });
    expect(fake.shown).toHaveLength(shown);
    fake.reads[1].answer(answered);
    await hidden;
    expect(running(controller)).toBe(true);
  });

  it("a read while the owner's stop still shows the held days shows them at once, then unlocks and saves", async () => {
    const fake = worker(quiet());
    const controller = clock(fake);
    controller.setPace('x10');
    controller.start();
    await vi.advanceTimersByTimeAsync(350);
    controller.pause();
    expect(locked()).toBe(true);
    const sent = fake.command.mock.calls.length;
    const read = fake.client.clubRecords();
    expect(fake.reads).toMatchObject([{ body: { type: 'club-records' }, head: 10, showing: 10 }]);
    expect(locked()).toBe(false);
    // The stop's save holds the date it stopped on (→SAVE-8).
    expect(fake.saveSoon).toHaveBeenCalledOnce();
    fake.reads[0].answer({ ok: true, requestId: 'read', clubRecords: {} } as Reply);
    await read;
    await vi.advanceTimersByTimeAsync(2000);
    expect(running(controller)).toBe(false);
    expect(fake.command.mock.calls.length).toBe(sent);
    expect(consecutive(fake, 0)).toBe(true);
  });

  it('a read that shows our result among the held days announces it, as the pace would', async () => {
    const template = quiet();
    const record = { id: 'match-9' } as World['ownMatches'][number];
    const fake = worker(
      template,
      () => 20,
      (day) =>
        ({
          ...template,
          calendar: { day },
          revision: template.revision + day,
          ownMatches: day >= 9 ? [record] : [],
        }) as World,
    );
    const controller = clock(fake);
    controller.setBackground({ resultNotice: true });
    controller.setPace('x10');
    controller.start();
    // Days 4–10 are held, our fixture's result on day 9.
    await vi.advanceTimersByTimeAsync(350);
    expect(controller.store.getState().resultNotice).toBeUndefined();
    const read = fake.client.headToHead('rival');
    expect(fake.showing()).toBe(10);
    expect(controller.store.getState().resultNotice).toEqual({ matchId: 'match-9' });
    fake.reads[0].answer(answered);
    await read;
    expect(running(controller)).toBe(true);
  });

  it('a view that reads again once a round keeps the pace between rounds', async () => {
    // Like the league's full statistics (useFullStats), it reads when the shown round moves on, as
    // a React effect does once the shown day is published.
    const template = quiet();
    const fake = worker(
      template,
      () => 20,
      (day) =>
        ({
          ...template,
          calendar: { day },
          round: Math.floor(day / 7),
          revision: template.revision + day,
        }) as World,
    );
    let round = 0;
    const unsubscribe = gameStore.subscribe((state) => {
      const w = state.view?.world as World | undefined;
      if (!w || w.round === round) return;
      round = w.round;
      queueMicrotask(
        () => void fake.client.fullStats({ kind: 'league', groupKey: 'ENG:0:0' }).catch(() => {}),
      );
    });
    try {
      const controller = clock(fake);
      controller.start();
      let reads = 0;
      for (let t = 0; t < 15_000; t += 10) {
        await vi.advanceTimersByTimeAsync(10);
        for (const posted of fake.reads.splice(0)) {
          posted.answer({ ok: true, requestId: 'read' } as Reply);
          reads++;
        }
      }
      expect(reads).toBe(2);
      expect(consecutive(fake, 0)).toBe(true);
      const gap = (i: number) => fake.shown[i].at - fake.shown[i - 1].at;
      for (let i = 1; i < fake.shown.length; i++) {
        if (gap(i) >= PACE_MS.x1) continue;
        // Only the days held when a round day was shown come early, together.
        let first = i;
        while (first > 1 && gap(first - 1) < PACE_MS.x1) first--;
        expect(fake.shown[first - 1].day % 7).toBe(0);
      }
      // Fifteen paced days plus at most the held days of each of the two rounds.
      expect(fake.shown.length).toBeLessThanOrEqual(15 + 2 * RUN_AHEAD_DAYS.x1);
    } finally {
      unsubscribe();
    }
  });

  it.each<[Body['type'], (client: GameClient) => Promise<unknown>]>([
    ['archive', (c) => c.archive(base.year)],
    ['recruitment-history', (c) => c.recruitmentHistory()],
    ['mediation-preview', (c) => c.mediationPreview('case', 'balanced')],
    ['person-career', (c) => c.personCareer('person')],
    ['head-to-head', (c) => c.headToHead('rival')],
    ['club-records', (c) => c.clubRecords()],
    ['manager-history', (c) => c.managerHistory()],
    ['league-fixtures', (c) => c.leagueFixtures({ code: 'GER', tier: 0, group: 0 })],
    ['full-stats', (c) => c.fullStats({ kind: 'league', groupKey: 'ENG:0:0' })],
  ])('the %s read goes only once the held days are shown', async (type, read) => {
    const fake = worker(quiet());
    const controller = clock(fake);
    controller.setPace('x10');
    controller.start();
    await vi.advanceTimersByTimeAsync(350);
    expect(fake.held).toHaveLength(RUN_AHEAD_DAYS.x10);
    const outcome = read(fake.client).catch(() => undefined);
    expect(fake.reads).toMatchObject([{ body: { type }, head: 10, showing: 10, held: 0 }]);
    fake.reads[0].fail(new Error('answered'));
    await outcome;
    expect(running(controller)).toBe(true);
  });
});

describe('the client holds the days computed ahead (WEB-18)', () => {
  interface Internals {
    rpc(body: Body, requestId?: string, timeout?: number, automatic?: boolean): Promise<Reply>;
    received(reply: Reply): void;
    held: View[];
  }
  const dayView = (day: number) =>
    ({ world: { ...quiet(), calendar: { day }, revision: base.revision + day } }) as View;
  /** A client without its workers: requests are recorded, replies handed in. */
  function client(shown = dayView(0)) {
    vi.stubGlobal('window', globalThis);
    const posted: Request[] = [],
      notify = vi.fn();
    const instance = Object.assign(Object.create(GameClient.prototype), {
      state: {
        ...initialClientState,
        busy: false,
        processing: false,
        activity: 'idle',
        readonly: false,
        view: shown,
      },
      held: [],
      views: new Map([[1, shown]]),
      viewSeq: 1,
      waiters: new Map(),
      session: 'session-run-ahead',
      serial: 0,
      failed: false,
      worker: { postMessage: (message: Request) => posted.push(message) },
      saves: { generationInfo: { generation: 1, parentGeneration: 0 } },
      notify,
    }) as GameClient;
    return { client: instance, internals: instance as unknown as Internals, posted, notify };
  }
  const step: Body = { type: 'command', command: { type: 'advance-days', days: 1 } };

  it('a notice read while days are held reads on the day shown and every held day', async () => {
    const notice = {
      id: 'notice',
      year: base.year,
      day: 0,
      kind: 'window-open' as const,
      title: '소식',
      detail: '-',
      attention: true,
    };
    const noticed = (day: number, read = false) => {
      const view = dayView(day);
      view.world.inbox = [{ ...notice, read }];
      return view;
    };
    const { client: c, internals, posted, notify } = client(noticed(0));
    for (const day of [1, 2]) {
      const request = internals.rpc(step, undefined, undefined, true);
      internals.received({
        requestId: posted.at(-1)!.requestId,
        ok: true,
        view: noticed(day),
        viewSeq: day + 1,
      });
      await request;
    }
    // The worker reads it on the newest day; the client marks it on the days before too.
    const read = internals.rpc({ type: 'command', command: { type: 'read-inbox', id: 'notice' } });
    internals.received({
      requestId: posted.at(-1)!.requestId,
      ok: true,
      view: noticed(2, true),
      viewSeq: 4,
    });
    await read;
    const unread = (view?: View) => view!.world.inbox!.some((item) => !item.read);
    expect(unread(c.state.view)).toBe(false);
    expect(c.state.view?.world.calendar?.day).toBe(0);
    expect(internals.held.map(unread)).toEqual([false, false]);
    expect(internals.held.map((view) => view.world.calendar?.day)).toEqual([1, 2]);
    // Shown at the pace, the days stay read.
    c.reveal();
    expect(unread(c.state.view)).toBe(false);
    expect(notify).toHaveBeenCalledOnce();
  });

  it('holds automatic days, asks from the newest and reveals them in order', async () => {
    const { client: c, internals, posted, notify } = client();
    const first = internals.rpc(step, undefined, undefined, true);
    expect(posted[0]).toMatchObject({ expectedRevision: base.revision, viewBase: 1 });
    internals.received({ requestId: posted[0].requestId, ok: true, view: dayView(1), viewSeq: 2 });
    expect((await first).view?.world.calendar?.day).toBe(1);
    // The second day is asked from the first, which the worker holds, and sent as a change.
    const second = internals.rpc(step, undefined, undefined, true);
    expect(posted[1]).toMatchObject({ expectedRevision: base.revision + 1, viewBase: 2 });
    internals.received({
      requestId: posted[1].requestId,
      ok: true,
      viewDelta: {
        base: 2,
        parts: {},
        world: { calendar: { day: 2 }, revision: base.revision + 2 },
        dropped: [],
      },
      viewSeq: 3,
    });
    await second;
    expect(c.state.view?.world.calendar?.day).toBe(0);
    expect(notify).not.toHaveBeenCalled();
    // Held days share what did not change.
    expect(internals.held[1].world.players).toBe(internals.held[0].world.players);
    // Reading a notice applies where the worker stands: it changes the newest held day.
    const read = internals.rpc({ type: 'command', command: { type: 'read-inbox' } });
    expect(posted[2]).toMatchObject({ expectedRevision: base.revision + 2, viewBase: 3 });
    const readView = dayView(2);
    internals.received({ requestId: posted[2].requestId, ok: true, view: readView, viewSeq: 4 });
    await read;
    expect(internals.held).toHaveLength(2);
    expect(c.reveal()).toBe(1);
    expect(c.state.view?.world.calendar?.day).toBe(1);
    expect(notify).toHaveBeenCalledOnce();
    expect(c.reveal(true)).toBe(1);
    expect(c.state.view?.world.calendar?.day).toBe(2);
    expect(c.reveal()).toBe(0);
  });

  it('an owner decision or a loaded world is shown past the days held', async () => {
    const { client: c, internals, posted } = client();
    const hold = async (day: number) => {
      const request = internals.rpc(step, undefined, undefined, true);
      internals.received({
        requestId: posted.at(-1)!.requestId,
        ok: true,
        view: dayView(day),
        viewSeq: day + 1,
      });
      await request;
    };
    await hold(1);
    await hold(2);
    // The lock keeps decisions out while days are held; one that comes is shown where it acted.
    const decided = internals.rpc({ type: 'command', command: { type: 'support' } });
    internals.received({ requestId: posted[2].requestId, ok: true, view: dayView(2), viewSeq: 4 });
    await decided;
    expect(internals.held).toHaveLength(0);
    expect(c.state.view?.world.calendar?.day).toBe(2);
    await hold(3);
    const load = internals.rpc({ type: 'inspect', raw: '{}', activate: true });
    internals.received({ requestId: posted[4].requestId, ok: true, view: dayView(40), viewSeq: 6 });
    await load;
    expect(internals.held).toHaveLength(0);
    expect(c.state.view?.world.calendar?.day).toBe(40);
    expect(c.reveal()).toBe(0);
  });
});
