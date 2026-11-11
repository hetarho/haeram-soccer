// Performs a script: each beat goes to the handler registered for its kind and outcome, which
// moves the stage tick by tick until the beat is done. The result is a `Playback`, a pure function
// of the script (ARCH-5); T796 and T797 register the other beats on the same loop.
import { PROTO_CONFIG } from '../core/config.ts';
import type { Beat, Playback, Script, Vec } from '../core/types.ts';
import { PASS_KINDS, isShotLike } from '../core/types.ts';
import { performCarry, performCarryLost, performMiscontrol } from './carry.ts';
import { performPass, performPassIntercepted, performPassLoose, performPassOut } from './pass.ts';
import { withRestart } from './scenes.ts';
import { performShot } from './shot.ts';
import { performTakeOn } from './takeon.ts';
import { performThrough } from './through.ts';
import { createStage, pushEvent, runUntil, step, type StageState } from './world.ts';

export { ensureOwner, setPossession } from './world.ts';

export interface BeatContext {
  beat: Beat;
  next?: Beat;
}
export type Handler = (state: StageState, ctx: BeatContext) => void;

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

const HALF = 2700;

/** The whistle at a half's end: the ball is dead and held for `stage.restart.delay.kickOff` seconds. */
function endHalf(state: StageState): void {
  const ball = state.ball;
  ball.mode = 'dead';
  ball.owner = -1;
  delete ball.flight;
  state.live = false;
  state.orders.clear();
  state.cues.clear();
  pushEvent(state, { kind: 'whistle', actor: -1, at: [ball.pos[0], ball.pos[1]] });
  const start = state.t;
  const hold = PROTO_CONFIG.stage.restart.delay.kickOff;
  runUntil(state, () => state.t - start >= hold - 1e-9, hold);
}

/**
 * Performs `script`. An unbound script stops at `options.duration` (default `PROTO_CONFIG.duration`);
 * a bound one (written from a settled result) runs to its last beat unless `options.duration` cuts
 * it between beats, its frames carry the record's clock and each half ends with a whistle.
 */
export function performScript(script: Script, options?: { duration?: number }): Playback {
  const bound = script.bound === true;
  const duration = options?.duration ?? (bound ? Infinity : PROTO_CONFIG.duration);
  const state = createStage(script);
  const beats = script.beats;
  const performed: Beat[] = [];
  for (let i = 0; i < beats.length && state.t < duration; i++) {
    const beat = beats[i];
    const next = beats[i + 1];
    const key = handlerKey(beat);
    const handler = HANDLERS[key];
    if (!handler) throw new Error('no handler for ' + key);
    const halfEnds =
      bound && next?.clock !== undefined && beat.clock !== undefined
        ? beat.clock < HALF && next.clock >= HALF
        : false;
    if (bound && beat.clock !== undefined) {
      state.clock = Math.max(state.clock ?? 0, beat.clock);
      state.clockCap = next?.clock !== undefined && !halfEnds ? next.clock : Infinity;
      if (halfEnds) state.clockCap = HALF;
    }
    const before = state.tickCount;
    handler(state, { beat, next });
    if (state.tickCount === before) step(state);
    performed.push(beat);
    if (halfEnds && state.t < duration) endHalf(state);
  }
  if (bound) {
    state.clockCap = state.clock ?? 0;
    endHalf(state);
  }
  const frames = bound ? state.frames : state.frames.filter((f) => f.t <= duration);
  const events = bound ? state.events : state.events.filter((e) => e.t <= duration);
  const last = frames[frames.length - 1];
  const at: Vec = [last.ball[0], last.ball[1]];
  if (!bound) {
    events.push({ t: last.t, beat: last.beat, kind: 'whistle', team: last.team, actor: -1, at });
  }
  let score: readonly [number, number] = [0, 0];
  for (const e of events) if (e.kind === 'goal' && e.score) score = e.score;
  return {
    version: 1,
    seed: script.seed,
    hz: PROTO_CONFIG.hz,
    duration: last.t,
    fixture: script.fixture,
    beats: performed,
    frames,
    events,
    score,
  };
}
