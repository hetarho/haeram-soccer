// The only place that appends beats and moves the state: the beat is built from the state, the
// nominal clock runs on, and the outcome settles who has the ball next or which restart follows.
import { PROTO_CONFIG } from '../core/config.ts';
import { CENTRE, toAttack } from '../core/pitch.ts';
import {
  isShotLike,
  type Beat,
  type BeatKind,
  type BeatOutcome,
  type BeatReason,
  type Vec,
} from '../core/types.ts';
import { dist, lerp } from '../core/vec.ts';
import { goalKickFor } from './restarts.ts';
import { freshFlags, other, phaseAt, type Restart, type ScriptState } from './state.ts';

export interface BeatInput {
  move: string;
  kind: BeatKind;
  actor: number;
  to: Vec;
  outcome: BeatOutcome;
  hold: number;
  receiver?: number;
  opponent?: number;
  loft?: boolean;
  through?: boolean;
  header?: boolean;
  reason?: BeatReason;
  /** Required with outcome `out`: the restart that follows. */
  then?: Restart;
}

const GRAMMAR = PROTO_CONFIG.grammar;

const isCarry = (kind: BeatKind): boolean => kind === 'carry' || kind === 'takeOn';

/** Nominal ball speed for the beat's travel on the script clock. */
const speedOf = (beat: Beat): number => {
  const s = GRAMMAR.speeds;
  if (isCarry(beat.kind)) return s.carry;
  if (isShotLike(beat)) return s.shot;
  return beat.loft ? s.loft : s.ground;
};

const buildBeat = (state: ScriptState, input: BeatInput): Beat => {
  const beat: Beat = {
    index: state.beats.length,
    possession: state.possession,
    team: state.team,
    phase: state.phase,
    move: input.move,
    kind: input.kind,
    actor: input.actor,
    from: state.ball,
    to: input.to,
    loft: input.loft ?? false,
    through: input.through ?? false,
    header: input.header ?? false,
    outcome: input.outcome,
    hold: input.hold,
  };
  if (input.receiver !== undefined) beat.receiver = input.receiver;
  if (input.opponent !== undefined) beat.opponent = input.opponent;
  const reason = input.reason ?? (isBackward(state, input) ? 'reset' : undefined);
  if (reason !== undefined) beat.reason = reason;
  return beat;
};

/** A pass aimed more than `resetBehind` metres behind the ball: a staging cue even when the move names no reason. */
const isBackward = (state: ScriptState, input: BeatInput): boolean =>
  input.kind === 'pass' &&
  toAttack(state.team, input.to)[0] < toAttack(state.team, state.ball)[0] - GRAMMAR.resetBehind;

const needOpponent = (input: BeatInput): number => {
  if (input.opponent === undefined) {
    throw new Error(`emit: ${input.move} ${input.outcome} needs an opponent`);
  }
  return input.opponent;
};

/** Appends one beat, runs the clock on and settles its outcome. */
export function emit(state: ScriptState, input: BeatInput): Beat {
  const beat = buildBeat(state, input);
  state.beats.push(beat);
  state.times.push(state.clock);
  state.clock += input.hold + dist(beat.from, beat.to) / speedOf(beat);
  const { from, to } = beat;
  switch (input.outcome) {
    case 'complete':
      if (!isCarry(input.kind)) {
        if (input.receiver === undefined) throw new Error(`emit: ${input.move} needs a receiver`);
        state.holder = input.receiver;
      }
      state.ball = to;
      break;
    case 'intercepted':
      state.ball = lerp(from, to, GRAMMAR.interceptAt);
      turnover(state, needOpponent(input));
      break;
    case 'tackled':
      state.ball = lerp(from, to, GRAMMAR.tackleAt);
      turnover(state, needOpponent(input));
      break;
    case 'foul':
      state.ball = lerp(from, to, GRAMMAR.tackleAt);
      state.pending = { kind: 'freeKick', team: state.team, spot: state.ball };
      break;
    case 'offside':
      state.pending = { kind: 'freeKick', team: other(state.team), spot: to };
      break;
    case 'out':
      if (input.then === undefined) throw new Error(`emit: ${input.move} out needs a restart`);
      state.ball = to;
      state.pending = input.then;
      break;
    case 'goal':
      state.score[state.team] += 1;
      state.pending = { kind: 'kickOff', team: other(state.team), spot: CENTRE };
      break;
    case 'wide':
      state.pending = goalKickFor(state, other(state.team));
      break;
    case 'saved':
    case 'blocked':
      // The move that shot decides what follows.
      break;
  }
  if (state.pending === undefined && state.phase !== 'counter') {
    state.phase = phaseAt(state.team, state.ball);
  }
  return beat;
}

/** The ball changes sides in open play: `newHolder` has it now. */
export function turnover(state: ScriptState, newHolder: number): void {
  const lost = state.phase;
  const team = other(state.team);
  state.team = team;
  state.possession += 1;
  state.holder = newHolder;
  state.flags = freshFlags();
  const counter = GRAMMAR.counter;
  const x = toAttack(team, state.ball)[0];
  const style = state.fixture.teams[team].style;
  if (
    x < counter.fromX &&
    (lost === 'progression' || lost === 'finalThird') &&
    state.rng.chance(counter.chance[style])
  ) {
    state.phase = 'counter';
    state.flags.counterBeats = state.rng.int(...counter.beats);
  } else {
    state.phase = phaseAt(team, state.ball);
  }
}
