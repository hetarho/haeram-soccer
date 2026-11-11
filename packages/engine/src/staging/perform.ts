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
    const beat = state.beats[i];
    const next = state.beats[i + 1];
    const periodEnds =
      next &&
      (beat.original?.period ?? (beat.clock! < 2700 ? 1 : 2)) !==
        (next.original?.period ?? (next.clock! < 2700 ? 1 : 2));
    state.clock = Math.max(state.clock ?? 0, beat.clock ?? 0);
    state.fixture.period = beat.original?.period ?? ((beat.clock ?? 0) < 2700 ? 1 : 2);
    state.clockCap = periodEnds
      ? Math.max(state.clock, next.clock ?? state.clock)
      : (next?.clock ?? Infinity);
    const before = state.tickCount;
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
    state.performed.push(beat);
    pushEvent(state, { kind: 'performed', actor: beat.actor, at: [...state.ball.pos] });
    if (periodEnds) yield* endPeriod(state);
  }
  state.clockCap = state.clock ?? 0;
  yield* endPeriod(state);
}

export { createStage };

export { createStaging, advance } from './staging';
export type { Staging, StageFrame, StageEvent, StagingId } from './staging';
