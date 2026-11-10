// `generateScript(seed)`: the probabilistic script. Pending restarts are played first; otherwise one
// move available in the current phase is picked by weight and run. Counter bookkeeping ends a
// counter after its beats or once the ball reaches the final third.
import { PROTO_CONFIG } from '../core/config.ts';
import { toAttack } from '../core/pitch.ts';
import { demoFixture } from '../core/squads.ts';
import type { Fixture, Script } from '../core/types.ts';
import { DEFAULT_MOVES, SAFE, type MoveDef } from './moves.ts';
import { playRestart } from './restarts.ts';
import { initialState, phaseAt, type ScriptState } from './state.ts';

export interface GenerateOptions {
  seconds?: number;
  moves?: readonly MoveDef[];
  fixture?: Fixture;
}

const GRAMMAR = PROTO_CONFIG.grammar;

const chooseMove = (state: ScriptState, moves: readonly MoveDef[]): MoveDef => {
  const open: MoveDef[] = [];
  const weights: number[] = [];
  for (const m of moves) {
    if (!m.phases.includes(state.phase)) continue;
    const w = m.weight(state);
    if (w > 0) {
      open.push(m);
      weights.push(w);
    }
  }
  return open.length === 0 ? SAFE : state.rng.pick(open, weights);
};

const countDown = (state: ScriptState): void => {
  state.flags.counterBeats -= 1;
  const reached = toAttack(state.team, state.ball)[0] >= GRAMMAR.phaseX.finalThird;
  if (state.flags.counterBeats <= 0 || reached) {
    state.phase = phaseAt(state.team, state.ball);
    state.flags.counterBoost = state.phase === 'finalThird';
  }
};

const step = (state: ScriptState, moves: readonly MoveDef[]): void => {
  if (state.pending !== undefined) {
    playRestart(state);
    return;
  }
  const move = chooseMove(state, moves);
  const before = state.beats.length;
  const phase = state.phase;
  const team = state.team;
  move.run(state);
  if (state.beats.length === before) throw new Error(`generateScript: ${move.id} emitted nothing`);
  if (
    phase === 'counter' &&
    state.team === team &&
    state.phase === 'counter' &&
    state.pending === undefined
  ) {
    countDown(state);
  }
};

export function generateScript(seed: string, options: GenerateOptions = {}): Script {
  const limit = options.seconds ?? PROTO_CONFIG.duration * GRAMMAR.nominalFactor;
  const fixture = options.fixture ?? demoFixture();
  const moves = options.moves ?? DEFAULT_MOVES;
  const state = initialState(seed, fixture);
  while (state.clock < limit && state.beats.length < GRAMMAR.maxBeats) step(state, moves);
  return {
    seed,
    fixture,
    beats: state.beats,
    times: state.times,
    nominalSeconds: state.clock,
  };
}
