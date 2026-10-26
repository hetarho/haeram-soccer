import type { MatchFrame, MatchRecord } from '../../../../packages/contracts/src/types';
import { recordedGoals } from './moments';
import { presentationAdvance, type Preparation } from './presentationClock';

/**
 * The goal-feedback transition (→WEB-94): how long the presented match holds at a recorded goal in
 * real ms, whatever the watch speed, and how many times the scoring side's score pulses meanwhile.
 * Reduced motion keeps the hold and drops the pulse.
 */
export const GOAL_FEEDBACK_CONFIG = { holdMs: 1000, pulses: 2 } as const;

/** A recorded goal on the presentation clock, in retained order. */
export interface GoalInstant {
  /** Its place among the match's goals: the identity of its cue. */
  id: number;
  /** The presentation clock at the goal, in running seconds. */
  seconds: number;
  side: 0 | 1;
  /** The running score with this goal. */
  home: number;
  away: number;
  /** The recorded scorer, when the record keeps one. */
  scorer?: string;
}

/**
 * Every recorded goal of the playback on the presentation clock (→WEB-94). Goals come from the
 * frames' running score, so a shoot-out never counts. An observed minute places each goal at its
 * recorded scoring event; a sparse archived minute keeps the boundary where its frame starts to show
 * (`frameStarts`, running seconds), inventing no sub-minute action. Scorers come from the record's
 * retained goals by running score.
 */
export function goalInstants(
  record: MatchRecord,
  frames: readonly MatchFrame[],
  frameStarts: readonly number[],
): GoalInstant[] {
  const scorers = new Map(
    recordedGoals(record).map((goal) => [`${goal.home}:${goal.away}`, goal.player]),
  );
  const goals: GoalInstant[] = [];
  let home = 0,
    away = 0;
  frames.forEach((frame, i) => {
    const added: [number, number] = [frame.score.home - home, frame.score.away - away];
    if (added[0] <= 0 && added[1] <= 0) return;
    // A shot or a direct free kick: the event's time is when the ball reaches the net.
    const shots = (frame.events ?? []).filter((event) => event.outcome === 'goal');
    const boundary = frameStarts[i] ?? i * 60;
    const scored: { side: 0 | 1; seconds: number }[] = [];
    for (const side of [0, 1] as const) {
      const own = shots.filter((event) => event.side === side);
      for (let k = 0; k < added[side]; k++)
        scored.push({
          side,
          seconds: own[k] ? i * 60 + Math.min(60, Math.max(0, own[k]!.t)) : boundary,
        });
    }
    scored.sort((a, b) => a.seconds - b.seconds || a.side - b.side);
    for (const { side, seconds } of scored) {
      if (side === 0) home++;
      else away++;
      goals.push({
        id: goals.length,
        seconds,
        side,
        home,
        away,
        scorer: scorers.get(`${home}:${away}`) || undefined,
      });
    }
    home = frame.score.home;
    away = frame.score.away;
  });
  return goals;
}

/** The presentation clock with its goal feedback: what a running clock carries between updates. */
export interface GoalFeedbackState {
  /** The presented instant in running seconds (→WEB-32). */
  seconds: number;
  /** Index of the first goal not yet reached. */
  next: number;
  /** The goal being held and the visible real ms its hold has left. */
  cue?: { goal: number; remainingMs: number };
}

/**
 * Advances the presentation clock by `elapsedMs` of real time at `speed` — dead-ball beats drawn
 * at their own rates (→WEB-32) — and stops at the earliest recorded goal it crosses (→WEB-94). A held goal
 * spends real time only, the same at every speed, and the clock stays put meanwhile, so nothing
 * beyond the goal shows and no catch-up builds; when the hold ends the rest of that update runs on.
 * A clock that is not running (paused, hidden) keeps its remaining hold.
 */
export function advanceGoalFeedback(
  state: GoalFeedbackState,
  goals: readonly GoalInstant[],
  input: {
    elapsedMs: number;
    speed: number;
    /** The playback's length in running seconds. */
    length: number;
    running: boolean;
    preparations?: readonly Preparation[];
  },
  config: { holdMs: number } = GOAL_FEEDBACK_CONFIG,
): GoalFeedbackState {
  if (!input.running) return state;
  let real = Math.max(0, input.elapsedMs);
  if (state.cue) {
    const left = state.cue.remainingMs - real;
    if (left > 0) return { ...state, cue: { ...state.cue, remainingMs: left } };
    real = -left;
  }
  const target = presentationAdvance(
    state.seconds,
    real,
    input.speed,
    input.length,
    input.preparations,
  );
  const goal = goals[state.next];
  if (goal && goal.seconds <= target)
    return {
      seconds: Math.max(state.seconds, goal.seconds),
      next: state.next + 1,
      cue: { goal: state.next, remainingMs: config.holdMs },
    };
  return { seconds: target, next: state.next };
}

/**
 * A seek to running second `seconds`: no cue, and the goals up to the new place count as passed, so
 * skipped goals are never celebrated while a goal still ahead can be.
 */
export function seekGoalFeedback(
  goals: readonly GoalInstant[],
  seconds: number,
): GoalFeedbackState {
  const next = goals.findIndex((goal) => goal.seconds > seconds);
  return { seconds, next: next < 0 ? goals.length : next };
}

/** How many goals the presentation shows at `state`: those reached, the held one included. */
export function goalsShown(state: GoalFeedbackState) {
  return state.next;
}
