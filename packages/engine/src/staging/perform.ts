import { invalidDetail } from '../script/failure';
// Performs a script: each beat goes to the handler registered for its kind and outcome, which
// moves the stage tick by tick until the beat is done. The program pauses before each tick so
// the caller can bound its work; script and side inputs alone determine every frame (ARCH-5).
import { STAGING_CONFIG } from './config';
import type { Beat } from './types';
import { PASS_KINDS, RESTART_KINDS, isShotLike } from './types';
import { performCarry, performCarryLost, performMiscontrol } from './carry';
import { performPass, performPassIntercepted, performPassLoose, performPassOut } from './pass';
import { withRestart } from './scenes';
import { performShot } from './shot';
import { runIncidents, holdScene, stopPlay } from './participants';
import { performTakeOn } from './takeon';
import { performThrough } from './through';
import { createStage, pushEvent, runUntil, nextTick, type StageState } from './world';
import { paceBeat } from './pace';
import { keepBall } from './keep';

export { ensureOwner, setPossession } from './world';

export interface BeatContext {
  beat: Beat;
  next?: Beat;
}
export type Handler = (state: StageState, ctx: BeatContext) => Generator<void, void>;

/** `shot` for a shot-like beat, `pass` for the other `PASS_KINDS`, else the kind; then `:` and the outcome. */
export function handlerKey(beat: Beat): string {
  const kind = isShotLike(beat) ? 'shot' : PASS_KINDS.includes(beat.kind) ? 'pass' : beat.kind;
  return `${kind}:${beat.outcome}`;
}

// Every `pass:*`, `clearance:*` and `shot:*` handler plays a dead-ball scene first for a restart
// kind (a free kick struck at goal is a `shot`); a through ball of any outcome is `performThrough`'s.
export const HANDLERS: Record<string, Handler> = {
  'pass:complete': withRestart(performPass),
  'pass:intercepted': withRestart(performPassIntercepted),
  'pass:out': withRestart(performPassOut),
  'clearance:complete': withRestart(performPass),
  'clearance:intercepted': withRestart(performPassIntercepted),
  'clearance:out': withRestart(performPassOut),
  'pass:offside': withRestart(performThrough),
  'shot:goal': withRestart(performShot),
  'shot:saved': withRestart(performShot),
  'shot:blocked': withRestart(performShot),
  'shot:wide': withRestart(performShot),
  'carry:complete': performCarry,
  'carry:tackled': performCarryLost,
  'carry:foul': performCarryLost,
  'carry:loose': performMiscontrol,
  'takeOn:complete': performTakeOn,
  'takeOn:tackled': performCarryLost,
  'takeOn:foul': performCarryLost,
  'pass:loose': withRestart(performPassLoose),
  'clearance:loose': withRestart(performPassLoose),
};

/** Each period ends in a whistle, with a dead-ball hold. */
function* endPeriod(state: StageState): Generator<void, void> {
  // The final touch and the whistle are distinct instants, including a last-tick save.
  yield* nextTick(state);
  state.ball.mode = 'dead';
  state.ball.owner = -1;
  delete state.ball.flight;
  state.live = false;
  if (state.fixture.period !== 5) state.orders.clear();
  state.cues.clear();
  pushEvent(state, { kind: 'whistle', actor: -1, at: [...state.ball.pos] });
  const start = state.t;
  const hold = STAGING_CONFIG.stage.restart.delay.kickOff;
  yield* runUntil(state, () => state.t - start >= hold - 1e-9, hold);
}

/** A resumable program. Yielding means the next operation is precisely one movement tick. */
export function* performance(state: StageState): Generator<void, void> {
  for (let i = 0; i < state.beats.length; i++) {
    let beat = state.beats[i];
    const next = state.beats[i + 1];
    const periodOf = (b: Beat): number => b.original?.period ?? (b.clock! < 2700 ? 1 : 2);
    const periodEnds = next && periodOf(beat) !== periodOf(next);
    // Real-time pace: the beat's hold and a restart's delay keep the performance on the record's
    // clock (stage/pace.ts); each period's time counts from its first beat.
    if (state.pace) {
      if (i === 0 || periodOf(state.beats[i - 1]) !== periodOf(beat)) state.paceOrigin = state.t;
      const paced = paceBeat(state.pace, beat, i, state.t - (state.paceOrigin ?? 0));
      beat = { ...beat, hold: paced.hold };
      state.restartDelay = paced.delay;
      state.hurry = paced.hurry;
    }
    state.clock = Math.max(state.clock ?? 0, beat.clock ?? 0);
    state.fixture.period = beat.original?.period ?? ((beat.clock ?? 0) < 2700 ? 1 : 2);
    state.beat = beat.index;
    state.action = beat.kind;
    state.receiver = beat.receiver;
    pushEvent(state, {
      kind: 'begin',
      actor: beat.actor,
      team: beat.team,
      at: [...state.ball.pos],
    });
    state.clockCap = periodEnds
      ? Math.max(state.clock, next.clock ?? state.clock)
      : (next?.clock ?? Infinity);
    // A beat that carries the record's incidents (a card, a substitution) keeps the clock inside
    // its own minute until they are staged: a long hold never shows the next minute first.
    if (beat.original?.incidents?.length && beat.clock !== undefined)
      state.clockCap = Math.min(
        state.clockCap,
        Math.max(state.clock, (Math.floor(beat.clock / 60) + 1) * 60 - 0.01),
      );
    const before = state.tickCount;
    const eventsFrom = state.events.length;
    const ctx = { beat, next };
    const beforeAction = beat.kind === 'stoppage' || RESTART_KINDS.includes(beat.kind);
    if (beforeAction) {
      state.beat = beat.index;
      state.team = beat.team;
      state.phase = beat.phase;
      yield* runIncidents(state, ctx);
    }
    if (beat.kind === 'stoppage') {
      stopPlay(state);
      yield* holdScene(state, beat.hold);
    } else {
      state.live = true;
      const handler = HANDLERS[handlerKey(beat)];
      if (!handler) throw invalidDetail('staging:input');
      yield* handler(state, { beat, next });
    }
    if (!beforeAction) yield* runIncidents(state, ctx);
    if (state.tickCount === before) yield* nextTick(state);
    if (state.pace && state.pace.fixed[i]) rebase(state, i, eventsFrom);
    state.performed.push(beat);
    pushEvent(state, { kind: 'performed', actor: beat.actor, at: [...state.ball.pos] });
    if (periodEnds) {
      yield* untilWhistle(state, i);
      yield* endPeriod(state);
    }
  }
  state.clockCap = state.clock ?? 0;
  if (state.beats.length) yield* untilWhistle(state, state.beats.length - 1);
  yield* endPeriod(state);
}

const ANCHOR_KINDS = new Set(['kick', 'shot', 'foul', 'offside', 'card', 'sub', 'injury']);

/**
 * A fixed beat's action is shown inside its record minute however early or late the performance
 * reached it (stage/frame-clock.ts); time kept after it counts from there, so a lag the minute
 * could not absorb is not made up by slowing the play that follows.
 */
function rebase(state: StageState, i: number, from: number): void {
  const plan = state.pace!;
  const action = state.events.slice(from).find((e) => e.beat === i && ANCHOR_KINDS.has(e.kind));
  if (!action || state.paceOrigin === undefined) return;
  const shown = action.t - state.paceOrigin;
  const lo = Math.floor(plan.pin[i] / 60) * 60;
  if (shown > lo + 60) state.paceOrigin += shown - (lo + 60);
  else if (shown < lo) state.paceOrigin -= lo - shown;
}

/** A paced half plays on past its last recorded beat until its whistle is due (stage/keep.ts). */
function* untilWhistle(state: StageState, last: number): Generator<void, void> {
  if (!state.pace || state.beats[last].original?.period === 5) return;
  yield* keepBall(state, (state.paceOrigin ?? 0) + state.pace.close[last]);
}

export { createStage };

export { createStaging, advance } from './staging';
export type { Staging, StageFrame, StageEvent, StagingId } from './staging';
