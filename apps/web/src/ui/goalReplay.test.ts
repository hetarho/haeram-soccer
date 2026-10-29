import { describe, expect, it } from 'vitest';
import type {
  MatchEvent,
  MatchFrame,
  MatchMotionSample,
  MatchRecord,
} from '../../../../packages/contracts/src/types';
import {
  advanceGoalFeedback,
  GOAL_FEEDBACK_CONFIG,
  goalInstants,
  type GoalFeedbackState,
} from './goalFeedback';
import {
  GOAL_REPLAY_CONFIG,
  goalsSeen,
  replayClock,
  replayEnded,
  replayFor,
  replayGoals,
  replayGoalsReached,
  startGoalReplay,
  type ReplayOrigin,
} from './goalReplay';
import { runningLength, WATCH_SPEEDS } from './presentationClock';

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
const motion: MatchMotionSample[] = [{ elapsedSeconds: 0, ball: [50, 50], players: [[], []] }];

/** A minute; `observed` gives it motion and the ball's route, as a watched match records. */
function frame(
  i: number,
  home: number,
  away: number,
  {
    events,
    observed = true,
    period = 1,
  }: { events?: MatchEvent[]; observed?: boolean; period?: 1 | 2 } = {},
): MatchFrame {
  return {
    minute: i + 1,
    score: { home, away },
    metrics: [[], []],
    ball: [50, 50],
    side: 0,
    player: 0,
    action: '패스',
    period,
    label: String(i + 1),
    pace: 1,
    onPitch: [[], []],
    ...(events ? { events } : {}),
    ...(observed ? { motion, ballTrack: [[50, 50, 0]] } : {}),
  };
}

const record = {
  id: 'm1',
  highlights: [
    { minute: 3, side: 0, player: 'Walter Turner', action: '골' },
    { minute: 7, side: 1, player: 'Thomas Foster', action: '골' },
    { minute: 7, side: 0, player: 'Jack Hill', action: '골' },
    { minute: 10, side: 0, player: 'Sam Reed', action: '골' },
  ],
} as unknown as MatchRecord;

/**
 * Ten observed minutes: a home goal in the third at 30 s, both sides scoring in the seventh (away
 * at 10 s, home at 40 s), and a second half from the ninth with a goal 5 s after its kick-off.
 */
const frames = [
  frame(0, 0, 0),
  frame(1, 0, 0),
  frame(2, 1, 0, { events: [goalEvent(30, 0)] }),
  frame(3, 1, 0),
  frame(4, 1, 0),
  frame(5, 1, 0),
  frame(6, 2, 1, { events: [goalEvent(40, 0), goalEvent(10, 1)] }),
  frame(7, 2, 1),
  frame(8, 3, 1, { events: [goalEvent(5, 0)], period: 2 }),
  frame(9, 3, 1, { period: 2 }),
];
const starts = frames.map((_, i) => i * 60);
const goals = goalInstants(record, frames, starts);
const length = runningLength(frames.length);
const origin: ReplayOrigin = {
  matchId: 'm1',
  clock: { seconds: 620, next: 4 },
  sampleIndex: 9,
  paused: false,
  speed: 8,
  finished: false,
};

/** Plays goal `goal`'s clip at `speed` in 16 ms display updates until it ends, with its cues. */
function play(goal: number, speed: number = GOAL_REPLAY_CONFIG.speed) {
  const clip = startGoalReplay(goals, frames, replayGoals(goals, frames, 4)[goal]!, origin)!;
  const cues: number[] = [];
  let spent = 0;
  let state: GoalFeedbackState = replayClock(clip);
  for (; !replayEnded(state, clip) && spent < 120_000; spent += 16) {
    state = advanceGoalFeedback(state, replayGoalsReached(goals, clip), {
      elapsedMs: 16,
      speed,
      length,
      running: true,
    });
    if (state.cue && cues.at(-1) !== state.cue.goal) cues.push(state.cue.goal);
  }
  return { clip, state, cues, spent };
}

describe('goal-scene replay', () => {
  it('opens at the ordinary 1x speed with a 15 s build-up', () => {
    expect(GOAL_REPLAY_CONFIG).toEqual({ leadSeconds: 15, speed: 1 });
    expect(WATCH_SPEEDS).toContain(GOAL_REPLAY_CONFIG.speed);
  });

  it('offers only the goals a live presentation has shown, every goal of an archive', () => {
    expect(replayGoals(goals, frames, 0)).toEqual([]);
    const live = replayGoals(goals, frames, 1);
    expect(live.map((pick) => pick.goal)).toEqual([goals[0]]);
    // Neither a later scorer nor a later score is on offer.
    expect(JSON.stringify(live)).not.toContain('Foster');
    expect(replayGoals(goals, frames, goals.length).map((pick) => pick.goal.id)).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it('counts a held goal as seen only once its cue has finished', () => {
    expect(goalsSeen({ seconds: 150, next: 1, cue: { goal: 0, remainingMs: 400 } })).toBe(0);
    expect(goalsSeen({ seconds: 151, next: 1 })).toBe(1);
  });

  it('keeps two goals of one minute apart, each with its own footage and window', () => {
    const [, away, home] = replayGoals(goals, frames, 4);
    expect([away!.frame, home!.frame]).toEqual([6, 6]);
    expect(away!.goal).toMatchObject({ id: 1, side: 1, home: 1, away: 1, scorer: 'Thomas Foster' });
    expect(home!.goal).toMatchObject({ id: 2, side: 0, home: 2, away: 1, scorer: 'Jack Hill' });
    expect([away!.footage, home!.footage]).toEqual([true, true]);
    const first = startGoalReplay(goals, frames, away!, origin)!;
    const second = startGoalReplay(goals, frames, home!, origin)!;
    expect([first.goal, first.from]).toEqual([1, 370 - 15]);
    // The later goal's build-up never reaches back into the earlier one's celebration.
    expect([second.goal, second.from]).toEqual([2, 400 - 15]);
    const close = startGoalReplay(goals, frames, home!, origin, { leadSeconds: 45 })!;
    expect(close.from).toBe(goals[1]!.seconds);
  });

  it('starts no earlier than kick-off or its own period', () => {
    const opening = [frame(0, 1, 0, { events: [goalEvent(8, 0)] })];
    const early = goalInstants(record, opening, [0]);
    const pick = replayGoals(early, opening, 1)[0]!;
    expect(startGoalReplay(early, opening, pick, origin)!.from).toBe(0);
    // 5 s into the second half: the build-up starts at its kick-off, not in the first half.
    expect(goals[3]!.seconds).toBe(8 * 60 + 5);
    const late = startGoalReplay(goals, frames, replayGoals(goals, frames, 4)[3]!, origin)!;
    expect(late.from).toBe(8 * 60);
  });

  it('plays the build-up through one cue and its hold, then ends before any later goal', () => {
    for (const speed of WATCH_SPEEDS) {
      const { clip, state, cues } = play(1, speed);
      expect(cues).toEqual([1]);
      expect(state.next).toBe(2);
      expect(state.cue).toBeUndefined();
      // The clip ends just after its goal, never on to the next goal 30 s later.
      expect(state.seconds).toBeGreaterThanOrEqual(goals[1]!.seconds);
      expect(state.seconds).toBeLessThan(goals[2]!.seconds);
      expect(clip.from).toBeLessThan(goals[1]!.seconds);
    }
    // At 1x the clip lasts its 15 s of match time at 12 s a minute plus the goal's hold.
    const { spent } = play(1);
    expect(spent).toBeGreaterThanOrEqual(3000 + GOAL_FEEDBACK_CONFIG.holdMs - 32);
    expect(spent).toBeLessThanOrEqual(3000 + GOAL_FEEDBACK_CONFIG.holdMs + 32);
  });

  it('has no clip where scoring footage was not retained', () => {
    // A minute-only archive: no motion, no ball route, no scoring event.
    const sparse = frames.map((f) => ({
      ...f,
      motion: undefined,
      ballTrack: undefined,
      events: undefined,
    }));
    const sparseGoals = goalInstants(record, sparse, starts);
    const picks = replayGoals(sparseGoals, sparse, sparseGoals.length);
    expect(picks.map((pick) => pick.footage)).toEqual([false, false, false, false]);
    expect(startGoalReplay(sparseGoals, sparse, picks[0]!, origin)).toBeUndefined();
    // A watched minute whose goal was not recorded as an event has motion but no scoring footage.
    const unscored = frames.map((f, i) => (i === 2 ? { ...f, events: [] } : f));
    expect(replayGoals(goals, unscored, 1)[0]!.footage).toBe(false);
    // A minute with its goal event but no ball route invents none.
    const routeless = frames.map((f, i) => (i === 2 ? { ...f, ballTrack: undefined } : f));
    expect(replayGoals(goals, routeless, 1)[0]!.footage).toBe(false);
  });

  it('keeps the original viewing to restore, without a cue to celebrate again', () => {
    const held: ReplayOrigin = {
      ...origin,
      clock: { seconds: 600, next: 4, cue: { goal: 3, remainingMs: 300 } },
      paused: true,
      speed: 16,
      finished: true,
    };
    const clip = startGoalReplay(goals, frames, replayGoals(goals, frames, 4)[0]!, held)!;
    expect(clip.origin).toEqual({ ...held, clock: { seconds: 600, next: 4 } });
    expect(replayClock(clip)).toEqual({ seconds: 135, next: 0 });
    // The clip's clock never touches the original one.
    expect(held.clock).toEqual({ seconds: 600, next: 4, cue: { goal: 3, remainingMs: 300 } });
  });

  it('belongs only to the playback it was opened on', () => {
    const clip = startGoalReplay(goals, frames, replayGoals(goals, frames, 1)[0]!, origin)!;
    expect(replayFor(clip, 'm1')).toBe(clip);
    expect(replayFor(clip, 'm2')).toBeUndefined();
    expect(replayFor(clip, undefined)).toBeUndefined();
    expect(replayFor(undefined, 'm1')).toBeUndefined();
  });
});
