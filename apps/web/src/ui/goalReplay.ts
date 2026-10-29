import type { MatchFrame } from '../../../../packages/contracts/src/types';
import type { GoalFeedbackState, GoalInstant } from './goalFeedback';
import { goalFrame } from './moments';
import { WATCH_SPEEDS } from './presentationClock';

/**
 * The goal-scene replay (→WEB-105): how many running seconds of build-up a clip shows before its
 * goal, and the watch speed it opens at. The goal's own hold is the goal feedback's (→WEB-94).
 */
export const GOAL_REPLAY_CONFIG = { leadSeconds: 15, speed: WATCH_SPEEDS[0] } as const;

/** A recorded goal on offer for replay. */
export interface ReplayGoal {
  goal: GoalInstant;
  /** The frame it lands on; its label names the goal's minute (`45+2`). */
  frame: number;
  /**
   * Whether its scoring footage was retained: the frame's motion, the ball's route and the scoring
   * event itself. A sparse minute boundary has none, whatever the frame around it carries.
   */
  footage: boolean;
}

/**
 * The goals the owner may pick (→WEB-105), in retained order: the first `seen` of the playback —
 * every recorded goal of an archive, only those a live presentation has already shown — so an
 * unseen live goal, its scorer and a later score never appear. Goals within one minute stay apart.
 */
export function replayGoals(
  goals: readonly GoalInstant[],
  frames: readonly MatchFrame[],
  seen: number,
): ReplayGoal[] {
  const placed = goals.map((goal) => goalFrame(frames as MatchFrame[], goal));
  return goals.slice(0, Math.max(0, seen)).map((goal, i) => {
    const frame = placed[i]!;
    const scene = frames[frame];
    // goalInstants places a side's k-th goal of a minute at its k-th scoring event.
    const before = goals.filter(
      (other, j) => j < i && other.side === goal.side && placed[j] === frame,
    ).length;
    const scored = (scene?.events ?? []).filter(
      (event) => event.outcome === 'goal' && event.side === goal.side,
    ).length;
    return {
      goal,
      frame,
      footage: !!scene?.motion?.length && !!scene.ballTrack?.length && scored > before,
    };
  });
}

/** What the original viewing showed when a clip began, restored when it ends (→WEB-105). */
export interface ReplayOrigin {
  matchId: string;
  clock: GoalFeedbackState;
  sampleIndex: number;
  paused: boolean;
  speed: number;
  /** Whether the original presentation had finished: a clip never finishes or restarts it. */
  finished: boolean;
}

/** A clip of one recorded goal: from `from` (running seconds) through the goal and its hold. */
export interface GoalReplay {
  /** The goal's place among the playback's goals (`GoalInstant.id`). */
  goal: number;
  from: number;
  origin: ReplayOrigin;
}

/**
 * Whether a clip may begin from the original viewing at `state`: never while it holds a goal's
 * feedback (→WEB-94). That hold runs its full length in the original viewing first, so a clip never
 * cuts it short, and a return never lands past it to finish the presentation in its place.
 */
export function replayEntryOpen(state: GoalFeedbackState) {
  return !state.cue;
}

/**
 * Opens a clip of `pick`, or nothing when its footage was not retained (a minute-only record keeps
 * its moment navigation instead) or while the original viewing holds a goal (`replayEntryOpen`).
 * The clip starts `leadSeconds` before the goal, never before its period's kick-off or the goal
 * before it, so it shows one build-up and no other celebration. The origin keeps the original clock
 * as it was, between holds, so returning neither celebrates again nor skips a celebration.
 */
export function startGoalReplay(
  goals: readonly GoalInstant[],
  frames: readonly MatchFrame[],
  pick: ReplayGoal,
  origin: ReplayOrigin,
  config: { leadSeconds: number } = GOAL_REPLAY_CONFIG,
): GoalReplay | undefined {
  if (!pick.footage || !replayEntryOpen(origin.clock)) return undefined;
  const { goal } = pick;
  const period = frames[pick.frame]?.period;
  let kickOff = pick.frame;
  while (kickOff > 0 && frames[kickOff - 1]?.period === period) kickOff--;
  const from = Math.min(
    goal.seconds,
    Math.max(0, goal.seconds - config.leadSeconds, kickOff * 60, goals[goal.id - 1]?.seconds ?? 0),
  );
  return { goal: goal.id, from, origin: { ...origin, clock: { ...origin.clock } } };
}

/** The clip's clock on entry: nothing held, its goal the next one to reach. */
export function replayClock(replay: GoalReplay): GoalFeedbackState {
  return { seconds: replay.from, next: replay.goal };
}

/** The goals a clip's clock may reach: up to its own, so it never runs into a later one. */
export function replayGoalsReached(goals: readonly GoalInstant[], replay: GoalReplay) {
  return goals.slice(0, replay.goal + 1);
}

/** Whether the clip has played its goal through the goal's hold, so it returns by itself. */
export function replayEnded(state: GoalFeedbackState, replay: GoalReplay) {
  return state.next > replay.goal && !state.cue;
}

/** The clip still belonging to the playback shown: replacing the playback discards it. */
export function replayFor(replay: GoalReplay | undefined, matchId: string | undefined) {
  return replay && replay.origin.matchId === matchId ? replay : undefined;
}

/** How many goals a live presentation has shown through their cue at `state`. */
export function goalsSeen(state: GoalFeedbackState) {
  return state.cue ? state.next - 1 : state.next;
}
