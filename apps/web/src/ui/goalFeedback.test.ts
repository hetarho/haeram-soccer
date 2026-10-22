import { describe, expect, it } from 'vitest';
import type { MatchEvent, MatchFrame, MatchRecord } from '../../../../packages/contracts/src/types';
import {
  advanceGoalFeedback,
  GOAL_FEEDBACK_CONFIG,
  goalInstants,
  goalsShown,
  seekGoalFeedback,
  type GoalFeedbackState,
  type GoalInstant,
} from './goalFeedback';
import { clockAt, presentationLength, WATCH_MINUTE_MS, WATCH_SPEEDS } from './presentationClock';

const goalEvent = (t: number, side: 0 | 1): MatchEvent => ({
  t,
  kind: 'shot',
  side,
  actor: `p${side}`,
  from: [80, 50],
  to: [100, 50],
  outcome: 'goal',
  text: '골',
});

function frame(i: number, home: number, away: number, events?: MatchEvent[]): MatchFrame {
  return {
    minute: i + 1,
    score: { home, away },
    metrics: [[], []],
    ball: [50, 50],
    side: 0,
    player: 0,
    action: '패스',
    period: 1,
    label: String(i + 1),
    pace: 1,
    onPitch: [[], []],
    ...(events ? { events } : {}),
  };
}

function record(goals: { minute: number; side: 0 | 1; player: string }[], extra = {}) {
  return {
    id: 'm1',
    highlights: goals.map((goal) => ({ ...goal, action: '골' })),
    ...extra,
  } as unknown as MatchRecord;
}

/** Ten observed minutes: a home goal at 2′ 30 s, both sides scoring in 6′, a last-second winner. */
const frames = [
  frame(0, 0, 0, []),
  frame(1, 0, 0, []),
  frame(2, 1, 0, [goalEvent(30, 0)]),
  frame(3, 1, 0, []),
  frame(4, 1, 0, []),
  frame(5, 1, 0, []),
  frame(6, 2, 1, [goalEvent(40, 0), goalEvent(10, 1)]),
  frame(7, 2, 1, []),
  frame(8, 2, 1, []),
  frame(9, 3, 1, [goalEvent(60, 0)]),
];
const rec = record([
  { minute: 3, side: 0, player: 'Walter Turner' },
  { minute: 7, side: 1, player: 'Thomas Foster' },
  { minute: 7, side: 0, player: 'Jack Hill' },
  { minute: 10, side: 0, player: 'Sam Reed' },
]);
const starts = frames.map((_, i) => i * 60);
const goals = goalInstants(rec, frames, starts);
const lengthMs = presentationLength(frames.length);

/** Runs the clock in display updates of `stepMs` until `until` holds or `limitMs` of real time. */
function run(
  state: GoalFeedbackState,
  speed: number,
  stepMs: number,
  until: (state: GoalFeedbackState) => boolean,
  limitMs = 120_000,
  list: readonly GoalInstant[] = goals,
) {
  for (let spent = 0; spent < limitMs && !until(state); spent += stepMs)
    state = advanceGoalFeedback(state, list, { elapsedMs: stepMs, speed, lengthMs, running: true });
  return state;
}
const start: GoalFeedbackState = { clockMs: 0, next: 0 };

describe('goal feedback', () => {
  it('stops at the earliest crossed goal at every speed', () => {
    expect(goals.map((goal) => goal.clockMs)).toEqual([
      clockAt(150),
      clockAt(370),
      clockAt(400),
      clockAt(600),
    ]);
    for (const speed of WATCH_SPEEDS)
      for (const step of [16, 60, 1000]) {
        const held = run(start, speed, step, (state) => !!state.cue);
        expect(held.cue?.goal).toBe(0);
        expect(held.clockMs).toBe(goals[0]!.clockMs);
        expect(goalsShown(held)).toBe(1);
      }
    // One update spanning the whole match still stops at the first goal.
    const jump = advanceGoalFeedback(start, goals, {
      elapsedMs: lengthMs,
      speed: 16,
      lengthMs,
      running: true,
    });
    expect(jump).toMatchObject({ clockMs: goals[0]!.clockMs, next: 1, cue: { goal: 0 } });
  });

  it('two goals in one minute keep separate running scores', () => {
    expect(goals.map(({ side, home, away, scorer }) => ({ side, home, away, scorer }))).toEqual([
      { side: 0, home: 1, away: 0, scorer: 'Walter Turner' },
      { side: 1, home: 1, away: 1, scorer: 'Thomas Foster' },
      { side: 0, home: 2, away: 1, scorer: 'Jack Hill' },
      { side: 0, home: 3, away: 1, scorer: 'Sam Reed' },
    ]);
    const first = run(seekGoalFeedback(goals, clockAt(300)), 16, 1000, (state) => !!state.cue);
    expect(first.cue?.goal).toBe(1);
    expect(goalsShown(first)).toBe(2);
    // The update that ends the first hold may reach the second goal, which then holds on its own.
    const second = run(first, 16, 1000, (state) => state.cue?.goal === 2);
    expect(second.clockMs).toBe(goals[2]!.clockMs);
    expect(goalsShown(second)).toBe(3);
  });

  it('hold does not advance the running clock', () => {
    const held = run(start, 4, 16, (state) => !!state.cue);
    let state = held;
    let spent = 0;
    while (state.cue) {
      expect(state.clockMs).toBe(held.clockMs);
      state = advanceGoalFeedback(state, goals, {
        elapsedMs: 16,
        speed: 4,
        lengthMs,
        running: true,
      });
      spent += 16;
    }
    // The hold took its configured real time and the clock ran on only by what was left after it.
    expect(spent).toBeGreaterThanOrEqual(GOAL_FEEDBACK_CONFIG.holdMs);
    expect(spent).toBeLessThan(GOAL_FEEDBACK_CONFIG.holdMs + 16);
    expect(state.clockMs - held.clockMs).toBeLessThanOrEqual(16 * 4);
  });

  it('speed change and rerender do not repeat a cue', () => {
    const held = run(start, 1, 16, (state) => !!state.cue);
    // A rerender reads the same state; an update with no time keeps the same cue and hold.
    expect(
      advanceGoalFeedback(held, goals, { elapsedMs: 0, speed: 1, lengthMs, running: true }),
    ).toEqual(held);
    const faster = advanceGoalFeedback(held, goals, {
      elapsedMs: 100,
      speed: 16,
      lengthMs,
      running: true,
    });
    expect(faster.cue).toEqual({ goal: 0, remainingMs: GOAL_FEEDBACK_CONFIG.holdMs - 100 });
    const after = run(faster, 16, 16, (state) => !state.cue);
    const onward = run(after, 16, 16, (state) => !!state.cue);
    expect(onward.cue?.goal).toBe(1);
  });

  it('seek clears without celebrating skipped goals', () => {
    const held = run(start, 1, 16, (state) => !!state.cue);
    const sought = seekGoalFeedback(goals, clockAt(450));
    expect(sought).toEqual({ clockMs: clockAt(450), next: 3 });
    expect(goalsShown(sought)).toBe(3);
    expect(held.cue).toBeDefined();
    const onward = run(sought, 16, 16, (state) => !!state.cue);
    expect(onward.cue?.goal).toBe(3);
    // Seeking onto a goal's own instant counts it as shown without a cue.
    expect(seekGoalFeedback(goals, goals[0]!.clockMs)).toEqual({
      clockMs: goals[0]!.clockMs,
      next: 1,
    });
  });

  it('replay can cross a goal again', () => {
    const passed = run(start, 16, 16, (state) => state.next === 1 && !state.cue);
    const replay = seekGoalFeedback(goals, 0);
    expect(goalsShown(replay)).toBe(0);
    expect(run(replay, 16, 16, (state) => !!state.cue).cue?.goal).toBe(0);
    expect(passed.cue).toBeUndefined();
  });

  it('pause survives the hold', () => {
    const held = run(start, 2, 16, (state) => !!state.cue);
    const half = advanceGoalFeedback(held, goals, {
      elapsedMs: 400,
      speed: 2,
      lengthMs,
      running: true,
    });
    const paused = advanceGoalFeedback(half, goals, {
      elapsedMs: 5000,
      speed: 2,
      lengthMs,
      running: false,
    });
    expect(paused).toBe(half);
    const resumed = advanceGoalFeedback(paused, goals, {
      elapsedMs: 400,
      speed: 2,
      lengthMs,
      running: true,
    });
    expect(resumed.cue?.remainingMs).toBe(GOAL_FEEDBACK_CONFIG.holdMs - 800);
    expect(resumed.clockMs).toBe(held.clockMs);
  });

  it('hidden time does not consume the cue', () => {
    const held = run(start, 8, 16, (state) => !!state.cue);
    let state = held;
    for (let i = 0; i < 100; i++)
      state = advanceGoalFeedback(state, goals, {
        elapsedMs: 60,
        speed: 8,
        lengthMs,
        running: false,
      });
    expect(state).toEqual(held);
  });

  it('final goal completes before finish', () => {
    const last = run(seekGoalFeedback(goals, clockAt(500)), 16, 60, (state) => !!state.cue);
    expect(last).toMatchObject({ clockMs: lengthMs, next: 4, cue: { goal: 3 } });
    // At the final whistle the cue still runs its whole hold before it clears.
    const midway = advanceGoalFeedback(last, goals, {
      elapsedMs: GOAL_FEEDBACK_CONFIG.holdMs - 1,
      speed: 16,
      lengthMs,
      running: true,
    });
    expect(midway.cue?.remainingMs).toBe(1);
    expect(
      advanceGoalFeedback(midway, goals, { elapsedMs: 1, speed: 16, lengthMs, running: true }),
    ).toEqual({ clockMs: lengthMs, next: 4 });
  });

  it('shootout is excluded', () => {
    const cup = record([{ minute: 3, side: 0, player: 'Walter Turner' }], {
      score: { home: 1, away: 1 },
      shootout: { home: 4, away: 3 },
    });
    const level = [frame(0, 0, 0), frame(1, 1, 0), frame(2, 1, 1)];
    // A sparse archived minute holds at the boundary where its frame starts to show.
    expect(goalInstants(cup, level, [0, 120, 180])).toEqual([
      { id: 0, clockMs: clockAt(120), side: 0, home: 1, away: 0, scorer: 'Walter Turner' },
      { id: 1, clockMs: clockAt(180), side: 1, home: 1, away: 1, scorer: undefined },
    ]);
  });

  it('feedback leaves settled match facts unchanged', () => {
    const before = JSON.stringify({ rec, frames });
    const again = goalInstants(rec, frames, starts);
    run(start, 16, 16, (state) => state.next === again.length && !state.cue, 120_000, again);
    expect(JSON.stringify({ rec, frames })).toBe(before);
    expect(again).toEqual(goals);
    expect(WATCH_MINUTE_MS).toBe(4000);
  });
});
