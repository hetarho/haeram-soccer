// The pluggable table of moves the generator picks from. A move's `weight` reads the state and
// draws nothing (the order of draws is part of the script's identity); its `run` emits at least one
// beat through `emit`. This task ships four basic moves; T794 rewrites `DEFAULT_MOVES` with the
// football catalogue and keeps `circulate` and `carryForward` as they are.
import { PROTO_CONFIG } from '../core/config.ts';
import { PITCH, clampToPitch, toAttack } from '../core/pitch.ts';
import type { Phase } from '../core/types.ts';
import { dist, lerp } from '../core/vec.ts';
import {
  canCast,
  castOpponentNear,
  castReceiver,
  drawOutcome,
  feetPoint,
  prob,
  type CastRule,
} from './cast.ts';
import { emit } from './emit.ts';
import { outToTouch } from './restarts.ts';
import { attackBall, player, spot, type ScriptState } from './state.ts';

export interface MoveDef {
  id: string;
  phases: readonly Phase[];
  /** 0 = not available now. Must draw no random number. */
  weight(state: ScriptState): number;
  /** Emits at least one beat through `emit`. */
  run(state: ScriptState): void;
}

const GRAMMAR = PROTO_CONFIG.grammar;
const AXIS = PITCH.width / 2;
const ALL_PHASES: readonly Phase[] = [
  'buildUp',
  'progression',
  'finalThird',
  'counter',
  'setPiece',
];
const OPEN_PLAY: readonly Phase[] = ['buildUp', 'progression', 'finalThird', 'counter'];
const WEIGHTS = GRAMMAR.weights;

const buildHold = (state: ScriptState): number => state.rng.range(...GRAMMAR.hold.build);

/** Fallback: to the outfield teammate nearest the ball. */
export const SAFE: MoveDef = {
  id: 'safe',
  phases: ALL_PHASES,
  weight: () => WEIGHTS.safe,
  run(state) {
    const actor = state.holder;
    let receiver = -1;
    let best = Infinity;
    for (const p of state.fixture.teams[state.team].players) {
      if (p.slot === 0 || p.index === actor) continue;
      const d = dist(spot(state, p.index), state.ball);
      if (d < best) {
        best = d;
        receiver = p.index;
      }
    }
    const to = feetPoint(state, receiver);
    const hold = buildHold(state);
    const complete = state.rng.chance(GRAMMAR.p.safe);
    emit(state, {
      move: 'safe',
      kind: 'pass',
      actor,
      receiver,
      to,
      hold,
      outcome: complete ? 'complete' : 'intercepted',
      opponent: complete
        ? undefined
        : castOpponentNear(state, lerp(state.ball, to, GRAMMAR.interceptAt)),
    });
  },
};

const CIRCULATE_RULES: readonly CastRule[] = [
  { position: 'GK', w: 1 },
  { position: 'CB', w: 3 },
  { position: 'LB', w: 2 },
  { position: 'RB', w: 2 },
  { position: 'DM', w: 2 },
];

const nearBall =
  (state: ScriptState) =>
  (index: number): number =>
    Math.exp(-dist(spot(state, index), state.ball) / GRAMMAR.shortRange);

/** Short passing among the back line, the keeper and the holding midfielder in build-up. */
export const circulate: MoveDef = {
  id: 'circulate',
  phases: ['buildUp'],
  weight: (state) => (canCast(state, CIRCULATE_RULES, nearBall(state)) ? WEIGHTS.circulate : 0),
  run(state) {
    const actor = state.holder;
    const receiver = castReceiver(state, CIRCULATE_RULES, nearBall(state));
    if (receiver === undefined) throw new Error('circulate: nobody to cast');
    const to = feetPoint(state, receiver);
    const hold = buildHold(state);
    const back = toAttack(state.team, to)[0] < attackBall(state)[0] - GRAMMAR.resetBehind;
    const complete = state.rng.chance(
      prob(GRAMMAR.p.circulate, player(state, actor).attrs.passing, GRAMMAR.prob.passK),
    );
    emit(state, {
      move: 'circulate',
      kind: 'pass',
      actor,
      receiver,
      to,
      hold,
      reason: back ? 'reset' : undefined,
      outcome: complete ? 'complete' : 'intercepted',
      opponent: complete
        ? undefined
        : castOpponentNear(state, lerp(state.ball, to, GRAMMAR.interceptAt), {
            lines: ['FW', 'MF'],
          }),
    });
  },
};

const CARRY_WEIGHT: Partial<Record<Phase, number>> = WEIGHTS.carry;

/** The holder carries the ball forward. */
export const carryForward: MoveDef = {
  id: 'carryForward',
  phases: ['buildUp', 'progression', 'finalThird', 'counter'],
  weight: (state) =>
    player(state, state.holder).slot === 0 ? 0 : (CARRY_WEIGHT[state.phase] ?? 0),
  run(state) {
    const actor = state.holder;
    const phase = state.phase;
    const carry = GRAMMAR.carry;
    const [bx, by] = attackBall(state);
    const [lo, hi]: readonly [number, number] = carry[phase];
    const d = state.rng.range(lo, hi);
    let y = by + state.rng.range(-carry.drift, carry.drift);
    if (phase === 'finalThird') y += (AXIS - y) * GRAMMAR.carryInfield;
    const x = Math.min(bx + d, GRAMMAR.carryMaxX);
    const to = clampToPitch(toAttack(state.team, [x, y]), PROTO_CONFIG.margin);
    const hold = state.rng.range(...GRAMMAR.hold.carry);
    const keep = prob(
      GRAMMAR.p.carry[phase],
      player(state, actor).attrs.dribbling,
      GRAMMAR.prob.dribbleK,
    );
    const foul = GRAMMAR.p.carryFoul;
    const outcome = drawOutcome(state.rng, [
      ['complete', keep],
      ['foul', foul],
      ['tackled', Math.max(GRAMMAR.p.tackledMin, 1 - keep - foul)],
    ] as const);
    emit(state, {
      move: 'carryForward',
      kind: 'carry',
      actor,
      to,
      hold,
      outcome,
      opponent:
        outcome === 'complete'
          ? undefined
          : castOpponentNear(state, lerp(state.ball, to, GRAMMAR.tackleAt)),
    });
  },
};

/** A clearance into touch. */
export const hoofOut: MoveDef = {
  id: 'hoofOut',
  phases: OPEN_PLAY,
  weight: () => GRAMMAR.p.hoof,
  run(state) {
    const { to, then } = outToTouch(
      state,
      attackBall(state)[0] + state.rng.range(...GRAMMAR.hoofAhead),
    );
    emit(state, {
      move: 'hoofOut',
      kind: 'clearance',
      actor: state.holder,
      to,
      loft: true,
      hold: state.rng.range(...GRAMMAR.hold.carry),
      outcome: 'out',
      then,
    });
  },
};

export const DEFAULT_MOVES: readonly MoveDef[] = [SAFE, circulate, carryForward, hoofOut];
