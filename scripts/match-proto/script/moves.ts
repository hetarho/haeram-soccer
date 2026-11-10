// The pluggable table of moves the generator picks from: the possession grammar of build-up,
// progression, the final third and the counter. A move's `weight` reads the state (and the live
// flags) and draws nothing (the order of draws is part of the script's identity); it is the
// configured weight when its guard holds and a receiver can be cast, else 0. Its `run` starts with
// `takeFlags` and emits at least one beat through `emit`; shared follow-ups live in follow.ts.
import { PROTO_CONFIG } from '../core/config.ts';
import { PITCH, inBox, toAttack } from '../core/pitch.ts';
import type { Phase } from '../core/types.ts';
import { dist, lerp } from '../core/vec.ts';
import {
  canCast,
  castOpponentNear,
  castReceiver,
  drawOutcome,
  feetPoint,
  keeperOf,
  prob,
  stridePoint,
  type CastRule,
} from './cast.ts';
import { emit } from './emit.ts';
import {
  A,
  LONG_RULES,
  RUNNER_RULES,
  boxPoint,
  defensiveClear,
  finish,
  gkDistribute,
  layOff,
  playLongBall,
  playThrough,
  runnerExtra,
  safePass,
  takeFlags,
} from './follow.ts';
import { outForCorner, outOverByline, outToTouch } from './restarts.ts';
import { attackBall, attackSpot, other, player, spot, type ScriptState } from './state.ts';

export interface MoveDef {
  id: string;
  phases: readonly Phase[];
  /** 0 = not available now. Must draw no random number. */
  weight(state: ScriptState): number;
  /** Emits at least one beat through `emit`. */
  run(state: ScriptState): void;
}

const G = PROTO_CONFIG.grammar;
const P = G.p;
const HOLD = G.hold;
const W = G.weights;
const BOOST = W.boost;
const AXIS = PITCH.width / 2;
const ALL_PHASES: readonly Phase[] = [
  'buildUp',
  'progression',
  'finalThird',
  'counter',
  'setPiece',
];

type Extra = (index: number) => number;

const always: Extra = () => 1;
const keeperOnBall = (state: ScriptState): boolean => player(state, state.holder).slot === 0;
const isWide = (by: number): boolean => Math.abs(by - AXIS) >= G.wideFrom;
const passOf = (state: ScriptState): number => player(state, state.holder).attrs.passing;
/** The opponent nearest the point a failed pass is cut out. */
const byNear = (
  state: ScriptState,
  to: readonly [number, number],
  lines?: readonly ('DF' | 'MF' | 'FW')[],
): number => castOpponentNear(state, lerp(state.ball, to, G.interceptAt), lines ? { lines } : {});
const nearBall =
  (state: ScriptState, range: number): Extra =>
  (i) =>
    Math.exp(-dist(spot(state, i), state.ball) / range);
const castable = (
  state: ScriptState,
  rules: readonly CastRule[],
  extra: Extra,
  w: number,
): number => (w > 0 && canCast(state, rules, extra) ? w : 0);

/** Fallback: to the outfield teammate nearest the ball. */
export const SAFE: MoveDef = {
  id: 'safe',
  phases: ALL_PHASES,
  weight: () => W.safe,
  run: safePass,
};

const CIRCULATE_RULES: readonly CastRule[] = [
  { position: 'GK', w: 1 },
  { position: 'CB', w: 3 },
  { position: 'LB', w: 2 },
  { position: 'RB', w: 2 },
  { position: 'DM', w: 2 },
];

/** Short passing among the back line, the keeper and the holding midfielder in build-up. */
export const circulate: MoveDef = {
  id: 'circulate',
  phases: ['buildUp'],
  weight: (state) =>
    castable(state, CIRCULATE_RULES, nearBall(state, G.shortRange), W.buildUp.circulate),
  run(state) {
    takeFlags(state);
    const actor = state.holder;
    const receiver = castReceiver(state, CIRCULATE_RULES, nearBall(state, G.shortRange));
    if (receiver === undefined) throw new Error('circulate: nobody to cast');
    const to = feetPoint(state, receiver);
    const hold = state.rng.range(...HOLD.build);
    const back = toAttack(state.team, to)[0] < attackBall(state)[0] - G.resetBehind;
    const complete = state.rng.chance(prob(P.circulate, passOf(state), G.prob.passK));
    emit(state, {
      move: 'circulate',
      kind: 'pass',
      actor,
      receiver,
      to,
      hold,
      reason: back ? 'reset' : undefined,
      outcome: complete ? 'complete' : 'intercepted',
      opponent: complete ? undefined : byNear(state, to, ['FW', 'MF']),
    });
  },
};

const CARRY_WEIGHT: Partial<Record<Phase, number>> = {
  buildUp: W.buildUp.carryForward,
  progression: W.progression.carryForward,
  finalThird: W.finalThird.carryForward,
  counter: W.counter.carryForward,
};

/** The holder carries the ball forward. */
export const carryForward: MoveDef = {
  id: 'carryForward',
  phases: ['buildUp', 'progression', 'finalThird', 'counter'],
  weight: (state) => (keeperOnBall(state) ? 0 : (CARRY_WEIGHT[state.phase] ?? 0)),
  run(state) {
    takeFlags(state);
    const actor = state.holder;
    const phase = state.phase;
    const carry = G.carry;
    const [bx, by] = attackBall(state);
    const [lo, hi]: readonly [number, number] = carry[phase];
    const d = state.rng.range(lo, hi);
    let y = by + state.rng.range(-carry.drift, carry.drift);
    if (phase === 'finalThird') y += (AXIS - y) * G.carryInfield;
    const x = Math.min(bx + d, G.carryMaxX);
    const to = A(state, x, y);
    const hold = state.rng.range(...HOLD.carry);
    const keep = prob(P.carry[phase], player(state, actor).attrs.dribbling, G.prob.dribbleK);
    const foul = P.carryFoul;
    const outcome = drawOutcome(state.rng, [
      ['complete', keep],
      ['foul', foul],
      ['tackled', Math.max(P.tackledMin, 1 - keep - foul)],
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
          : castOpponentNear(state, lerp(state.ball, to, G.tackleAt)),
    });
  },
};

/** A simple pass to a cast receiver: complete by `pComplete`, else cut out by `opponentOf`. */
const simplePass = (
  state: ScriptState,
  move: string,
  receiver: number,
  to: readonly [number, number],
  hold: number,
  pComplete: number,
  opponentOf: (to: readonly [number, number]) => number,
  extra: { reason?: 'pressed' | 'blocked' | 'reset' | 'switch'; loft?: boolean } = {},
): boolean => {
  const complete = state.rng.chance(pComplete);
  emit(state, {
    move,
    kind: 'pass',
    actor: state.holder,
    receiver,
    to,
    hold,
    ...extra,
    outcome: complete ? 'complete' : 'intercepted',
    opponent: complete ? undefined : opponentOf(to),
  });
  return complete;
};

/** A three-way pass: complete, cut out by the opponent near, or out over the touchline. */
const riskyPass = (
  state: ScriptState,
  move: string,
  receiver: number,
  aim: readonly [number, number],
  hold: number,
  chances: readonly [number, number],
  extra: { reason?: 'switch'; loft?: boolean } = {},
): void => {
  const actor = state.holder;
  const outcome = drawOutcome(state.rng, [
    ['complete', chances[0]],
    ['intercepted', chances[1]],
    ['out', Math.max(0, 1 - chances[0] - chances[1])],
  ] as const);
  if (outcome === 'out') {
    const { to, then } = outToTouch(state, toAttack(state.team, aim)[0]);
    emit(state, { move, kind: 'pass', actor, receiver, to, hold, ...extra, outcome, then });
    return;
  }
  emit(state, {
    move,
    kind: 'pass',
    actor,
    receiver,
    to: aim,
    hold,
    ...extra,
    outcome,
    opponent: outcome === 'intercepted' ? byNear(state, aim) : undefined,
  });
};

const INTO_PIVOT_RULES: readonly CastRule[] = [
  { role: 'invertedFullBack', w: 3 },
  { position: 'DM', w: 3 },
  { position: 'CM', w: 1.2 },
];

export const intoPivot: MoveDef = {
  id: 'intoPivot',
  phases: ['buildUp'],
  weight: (state) => castable(state, INTO_PIVOT_RULES, always, W.buildUp.intoPivot),
  run(state) {
    takeFlags(state);
    const receiver = castReceiver(state, INTO_PIVOT_RULES);
    if (receiver === undefined) return safePass(state);
    const to = feetPoint(state, receiver);
    const hold = state.rng.range(...HOLD.build);
    simplePass(
      state,
      'intoPivot',
      receiver,
      to,
      hold,
      prob(P.intoPivot, passOf(state), 0.002),
      (t) => byNear(state, t, ['MF', 'FW']),
    );
  },
};

const WIDE_OUT_RULES: readonly CastRule[] = [
  { role: 'invertedFullBack', w: 0.3 },
  { position: 'LB', w: 2 },
  { position: 'RB', w: 2 },
  { position: 'LW', w: 2 },
  { position: 'RW', w: 2 },
  { position: 'LM', w: 2 },
  { position: 'RM', w: 2 },
];

export const wideOut: MoveDef = {
  id: 'wideOut',
  phases: ['buildUp'],
  weight: (state) => castable(state, WIDE_OUT_RULES, always, W.buildUp.wideOut),
  run(state) {
    takeFlags(state);
    const receiver = castReceiver(state, WIDE_OUT_RULES);
    if (receiver === undefined) return safePass(state);
    const to = stridePoint(state, receiver, state.rng.range(2, 5));
    const hold = state.rng.range(...HOLD.build);
    riskyPass(state, 'wideOut', receiver, to, hold, P.wideOut);
  },
};

export const longBall: MoveDef = {
  id: 'longBall',
  phases: ['buildUp'],
  weight: (state) =>
    castable(
      state,
      LONG_RULES,
      always,
      W.buildUp.longBall[state.fixture.teams[state.team].style] *
        (state.flags.boostLong ? BOOST.long : 1),
    ),
  run(state) {
    const flags = takeFlags(state);
    playLongBall(state, 'longBall', 'pass', flags);
  },
};

const PRESSED_BACK_RULES: readonly CastRule[] = [
  { position: 'GK', w: 2 },
  { position: 'CB', w: 2 },
];

export const pressedBack: MoveDef = {
  id: 'pressedBack',
  phases: ['buildUp'],
  weight: (state) =>
    keeperOnBall(state) ? 0 : castable(state, PRESSED_BACK_RULES, always, W.buildUp.pressedBack),
  run(state) {
    takeFlags(state);
    const receiver = castReceiver(state, PRESSED_BACK_RULES);
    if (receiver === undefined) return safePass(state);
    const to = feetPoint(state, receiver);
    const hold = state.rng.range(...HOLD.pressed);
    const kept = simplePass(
      state,
      'pressedBack',
      receiver,
      to,
      hold,
      P.pressedBack,
      (t) => castOpponentNear(state, t, { lines: ['FW'] }),
      { reason: 'pressed' },
    );
    if (kept) state.flags.boostLong = true;
  },
};

const INTERIOR_RULES: readonly CastRule[] = [
  { position: 'CM', w: 3 },
  { position: 'DM', w: 2 },
  { role: 'invertedFullBack', w: 2 },
  { role: 'falseNine', w: 1.5 },
  { position: 'LW', w: 1 },
  { position: 'RW', w: 1 },
  { position: 'LM', w: 1 },
  { position: 'RM', w: 1 },
];

const interiorExtra =
  (state: ScriptState): Extra =>
  (i) => {
    const bx = attackBall(state)[0];
    return (
      Math.exp(-dist(spot(state, i), state.ball) / 15) *
      (attackSpot(state, i)[0] >= bx - 6 ? 1 : 0.2)
    );
  };

export const interior: MoveDef = {
  id: 'interior',
  phases: ['progression'],
  weight: (state) => castable(state, INTERIOR_RULES, interiorExtra(state), W.progression.interior),
  run(state) {
    takeFlags(state);
    const receiver = castReceiver(state, INTERIOR_RULES, interiorExtra(state));
    if (receiver === undefined) return safePass(state);
    const to = feetPoint(state, receiver);
    const hold = state.rng.range(...HOLD.build);
    simplePass(state, 'interior', receiver, to, hold, prob(P.interior, passOf(state), 0.002), (t) =>
      byNear(state, t, ['MF']),
    );
  },
};

const DROP_LINK_RULES: readonly CastRule[] = [
  { role: 'falseNine', w: 4 },
  { role: 'targetMan', w: 2 },
  { position: 'ST', w: 1 },
  { role: 'mezzala', w: 1 },
];

const dropLinkExtra =
  (state: ScriptState): Extra =>
  (i) =>
    attackSpot(state, i)[0] > attackBall(state)[0] + 4 ? 1 : 0;

const hasLinkMan = (state: ScriptState): boolean =>
  state.fixture.teams[state.team].players.some(
    (p) => p.role === 'falseNine' || p.role === 'targetMan',
  );

export const dropLink: MoveDef = {
  id: 'dropLink',
  phases: ['progression'],
  weight: (state) =>
    castable(
      state,
      DROP_LINK_RULES,
      dropLinkExtra(state),
      hasLinkMan(state) ? W.progression.dropLink : W.progression.dropLinkNoLink,
    ),
  run(state) {
    takeFlags(state);
    const receiver = castReceiver(state, DROP_LINK_RULES, dropLinkExtra(state));
    if (receiver === undefined) return safePass(state);
    const to = feetPoint(state, receiver);
    const hold = state.rng.range(...HOLD.build);
    const complete = simplePass(
      state,
      'dropLink',
      receiver,
      to,
      hold,
      prob(P.dropLink, passOf(state), 0.002),
      (t) => castOpponentNear(state, t, { lines: ['DF', 'MF'] }),
    );
    if (!complete) return;
    if (state.rng.chance(P.layOffAfterLink)) {
      layOff(state);
      return;
    }
    // He turns his man and goes.
    const [bx, by] = attackBall(state);
    const turnTo = A(state, bx + state.rng.range(5, 8), by + (AXIS - by) * 0.3);
    const actor = state.holder;
    const kept = state.rng.chance(prob(P.turn, player(state, actor).attrs.dribbling, 0.003));
    emit(state, {
      move: 'turn',
      kind: 'carry',
      actor,
      to: turnTo,
      hold: state.rng.range(...HOLD.carry),
      outcome: kept ? 'complete' : 'tackled',
      opponent: kept ? undefined : castOpponentNear(state, lerp(state.ball, turnTo, G.tackleAt)),
    });
  },
};

const SWITCH_RULES: readonly CastRule[] = [
  { role: 'invertedFullBack', w: 0 },
  { position: 'LW', w: 2 },
  { position: 'RW', w: 2 },
  { position: 'LM', w: 2 },
  { position: 'RM', w: 2 },
  { position: 'LB', w: 1.5 },
  { position: 'RB', w: 1.5 },
];

const switchExtra =
  (state: ScriptState): Extra =>
  (i) =>
    Math.abs(attackSpot(state, i)[1] - attackBall(state)[1]) >= G.switchMin ? 1 : 0;

export const switchPlay: MoveDef = {
  id: 'switchPlay',
  phases: ['progression'],
  weight: (state) =>
    castable(
      state,
      SWITCH_RULES,
      switchExtra(state),
      W.progression.switchPlay * (state.flags.boostSwitch ? BOOST.switch : 1),
    ),
  run(state) {
    takeFlags(state);
    const receiver = castReceiver(state, SWITCH_RULES, switchExtra(state));
    if (receiver === undefined) return safePass(state);
    const to = stridePoint(state, receiver, 3);
    const hold = state.rng.range(...HOLD.build);
    riskyPass(
      state,
      'switchPlay',
      receiver,
      to,
      hold,
      [prob(P.switchPlay[0], passOf(state), 0.003), P.switchPlay[1]],
      { reason: 'switch', loft: true },
    );
  },
};

const WIDE_RELEASE_RULES: readonly CastRule[] = [
  { role: 'invertedFullBack', w: 0.2 },
  { role: 'overlappingFullBack', w: 2 },
  { position: 'LW', w: 3 },
  { position: 'RW', w: 3 },
  { position: 'LM', w: 3 },
  { position: 'RM', w: 3 },
  { position: 'LB', w: 1 },
  { position: 'RB', w: 1 },
];

const wideReleaseExtra =
  (state: ScriptState): Extra =>
  (i) => {
    const [bx, by] = attackBall(state);
    const a = attackSpot(state, i);
    return Math.exp(-Math.abs(a[1] - by) / 20) * (a[0] >= bx - 2 ? 1 : 0);
  };

export const wideRelease: MoveDef = {
  id: 'wideRelease',
  phases: ['progression'],
  weight: (state) =>
    castable(state, WIDE_RELEASE_RULES, wideReleaseExtra(state), W.progression.wideRelease),
  run(state) {
    takeFlags(state);
    const receiver = castReceiver(state, WIDE_RELEASE_RULES, wideReleaseExtra(state));
    if (receiver === undefined) return safePass(state);
    const to = stridePoint(state, receiver, state.rng.range(4, 7));
    const hold = state.rng.range(...HOLD.build);
    riskyPass(state, 'wideRelease', receiver, to, hold, [
      prob(P.wideRelease[0], passOf(state), 0.002),
      P.wideRelease[1],
    ]);
  },
};

const RECYCLE_RULES: readonly CastRule[] = [
  { position: 'DM', w: 3 },
  { role: 'invertedFullBack', w: 3 },
  { position: 'CM', w: 2 },
  { position: 'CB', w: 1.5 },
];

const recycleExtra =
  (state: ScriptState): Extra =>
  (i) =>
    (attackSpot(state, i)[0] <= attackBall(state)[0] - 4 ? 1 : 0) *
    Math.exp(-dist(spot(state, i), state.ball) / 25);

export const recycle: MoveDef = {
  id: 'recycle',
  phases: ['progression', 'finalThird'],
  weight(state) {
    if (state.phase === 'finalThird') {
      if (state.flags.beatMan || state.flags.counterBoost) return 0;
      return castable(state, RECYCLE_RULES, recycleExtra(state), W.finalThird.recycle);
    }
    return castable(state, RECYCLE_RULES, recycleExtra(state), W.progression.recycle);
  },
  run(state) {
    takeFlags(state);
    const reason = state.phase === 'finalThird' ? 'blocked' : 'reset';
    const receiver = castReceiver(state, RECYCLE_RULES, recycleExtra(state));
    if (receiver === undefined) return safePass(state);
    const to = feetPoint(state, receiver);
    const hold = state.rng.range(...HOLD.recycle);
    const kept = simplePass(
      state,
      'recycle',
      receiver,
      to,
      hold,
      P.recycle,
      (t) => byNear(state, t),
      {
        reason,
      },
    );
    if (kept) state.flags.boostSwitch = true;
  },
};

export const throughEarly: MoveDef = {
  id: 'throughEarly',
  phases: ['progression', 'counter'],
  weight: (state) =>
    castable(
      state,
      RUNNER_RULES,
      runnerExtra(state),
      state.phase === 'counter' ? W.counter.throughEarly : W.progression.throughEarly,
    ),
  run(state) {
    takeFlags(state);
    playThrough(state, 'throughEarly');
  },
};

export const throughBall: MoveDef = {
  id: 'throughBall',
  phases: ['finalThird'],
  weight: (state) =>
    castable(
      state,
      RUNNER_RULES,
      runnerExtra(state),
      W.finalThird.throughBall * (state.flags.counterBoost ? BOOST.counterThrough : 1),
    ),
  run(state) {
    takeFlags(state);
    playThrough(state, 'throughBall');
  },
};

const CROSS_RULES: readonly CastRule[] = [
  { role: 'targetMan', w: 4 },
  { role: 'poacher', w: 3 },
  { position: 'ST', w: 3 },
  { role: 'boxToBox', w: 1.5 },
  { role: 'mezzala', w: 1.5 },
  { position: 'LW', w: 2 },
  { position: 'RW', w: 2 },
  { position: 'LM', w: 1.5 },
  { position: 'RM', w: 1.5 },
];

const crossExtra =
  (state: ScriptState): Extra =>
  (i) =>
    Math.abs(attackSpot(state, i)[1] - attackBall(state)[1]) < 8 ? 0 : 1;

const ZONES = ['near', 'far', 'spot'] as const;
const ZONE_WEIGHTS = [1, 1.2, 0.8];

export const cross: MoveDef = {
  id: 'cross',
  phases: ['finalThird'],
  weight: (state) =>
    castable(
      state,
      CROSS_RULES,
      crossExtra(state),
      isWide(attackBall(state)[1]) ? W.finalThird.cross : W.finalThird.crossNarrow,
    ),
  run(state) {
    takeFlags(state);
    const actor = state.holder;
    const receiver = castReceiver(state, CROSS_RULES, crossExtra(state));
    if (receiver === undefined) return safePass(state);
    const aim = boxPoint(state, state.rng.pick(ZONES, ZONE_WEIGHTS));
    const hold = state.rng.range(...HOLD.cross);
    const outcome = drawOutcome(state.rng, [
      ['complete', prob(P.cross[0], passOf(state), 0.002)],
      ['cleared', P.cross[1]],
      ['claimed', P.cross[2]],
      ['out', 1 - P.cross[0] - P.cross[1] - P.cross[2]],
    ] as const);
    const base = { move: 'cross', kind: 'pass', actor, receiver, hold, loft: true } as const;
    if (outcome === 'complete') {
      emit(state, { ...base, to: aim, outcome });
      finish(state, 'header');
    } else if (outcome === 'cleared') {
      const opponent = castOpponentNear(state, aim, { lines: ['DF'] });
      emit(state, { ...base, to: aim, outcome: 'intercepted', opponent });
      defensiveClear(state);
    } else if (outcome === 'claimed') {
      const opponent = keeperOf(state, other(state.team));
      emit(state, { ...base, to: aim, outcome: 'intercepted', opponent });
      gkDistribute(state);
    } else {
      const ay = toAttack(state.team, aim)[1];
      const out = state.rng.chance(P.crossOutGoalKick)
        ? outOverByline(state, ay)
        : outForCorner(state, ay);
      emit(state, { ...base, to: out.to, outcome: 'out', then: out.then });
    }
  },
};

const CUT_BACK_RULES: readonly CastRule[] = [
  { role: 'boxToBox', w: 3 },
  { role: 'mezzala', w: 3 },
  { role: 'falseNine', w: 3 },
  { position: 'CM', w: 2 },
  { position: 'LW', w: 1.5 },
  { position: 'RW', w: 1.5 },
  { position: 'ST', w: 1.5 },
];

const cutBackOn = (state: ScriptState): boolean => {
  const [bx, by] = attackBall(state);
  return bx >= G.cutBackFromX && Math.abs(by - AXIS) >= G.cutBackWide;
};

export const cutBack: MoveDef = {
  id: 'cutBack',
  phases: ['finalThird'],
  weight: (state) =>
    cutBackOn(state) ? castable(state, CUT_BACK_RULES, always, W.finalThird.cutBack) : 0,
  run(state) {
    takeFlags(state);
    const actor = state.holder;
    const receiver = castReceiver(state, CUT_BACK_RULES);
    if (receiver === undefined) return safePass(state);
    const aim = boxPoint(state, state.rng.pick(['spot', 'edge'] as const));
    const hold = state.rng.range(...HOLD.quick);
    const outcome = drawOutcome(state.rng, [
      ['complete', P.cutBack[0]],
      ['intercepted', P.cutBack[1]],
      ['out', Math.max(0, 1 - P.cutBack[0] - P.cutBack[1])],
    ] as const);
    const base = {
      move: 'cutBack',
      kind: 'pass',
      actor,
      receiver,
      hold,
      reason: 'cutBack',
    } as const;
    if (outcome === 'complete') {
      emit(state, { ...base, to: aim, outcome });
      finish(state, 'firstTime');
    } else if (outcome === 'intercepted') {
      const opponent = castOpponentNear(state, aim, { lines: ['DF', 'MF'] });
      emit(state, { ...base, to: aim, outcome, opponent });
      defensiveClear(state);
    } else {
      const out = outForCorner(state, toAttack(state.team, aim)[1]);
      emit(state, { ...base, to: out.to, outcome, then: out.then });
    }
  },
};

const counterShot = (state: ScriptState): number =>
  state.flags.counterBoost ? BOOST.counterShot : 1;

export const edgeShot: MoveDef = {
  id: 'edgeShot',
  phases: ['finalThird'],
  weight(state) {
    const b = attackBall(state);
    if (inBox(b) || keeperOnBall(state)) return 0;
    const w =
      Math.abs(b[1] - AXIS) <= G.edgeHalfWidth ? W.finalThird.edgeShot : W.finalThird.edgeShotWide;
    return w * counterShot(state);
  },
  run(state) {
    takeFlags(state);
    finish(state, 'edge');
  },
};

export const boxShot: MoveDef = {
  id: 'boxShot',
  phases: ['finalThird'],
  weight: (state) =>
    inBox(attackBall(state)) && !keeperOnBall(state)
      ? W.finalThird.boxShot * counterShot(state)
      : 0,
  run(state) {
    takeFlags(state);
    finish(state, 'box');
  },
};

const WIDE_POSITIONS = ['LW', 'RW', 'LM', 'RM'];

export const takeOn: MoveDef = {
  id: 'takeOn',
  phases: ['finalThird'],
  weight(state) {
    const p = player(state, state.holder);
    if (p.slot === 0 || p.position === 'CB') return 0;
    return (
      W.finalThird.takeOn * (WIDE_POSITIONS.includes(p.position) ? W.finalThird.takeOnWide : 1)
    );
  },
  run(state) {
    takeFlags(state);
    const actor = state.holder;
    const [bx, by] = attackBall(state);
    let to: readonly [number, number];
    if (isWide(by)) {
      to = state.rng.chance(0.5)
        ? A(state, Math.min(101, bx + 9), by)
        : A(state, bx + 7, by + Math.sign(AXIS - by) * 6);
    } else {
      to = A(state, Math.min(100, bx + 8), by + state.rng.range(-3, 3));
    }
    const opponent = castOpponentNear(state, A(state, bx + 3, by), { lines: ['DF', 'MF'] });
    const hold = state.rng.range(...HOLD.carry);
    const beat = player(state, actor).attrs.dribbling - player(state, opponent).attrs.tackling + 60;
    const win = prob(P.takeOn, beat, 0.004);
    const outcome = drawOutcome(state.rng, [
      ['complete', win],
      ['foul', P.takeOnFoul],
      ['tackled', Math.max(0.05, 1 - win - P.takeOnFoul)],
    ] as const);
    emit(state, { move: 'takeOn', kind: 'takeOn', actor, to, hold, outcome, opponent });
    if (outcome === 'complete') state.flags.beatMan = true;
  },
};

const COMBINE_RULES: readonly CastRule[] = [
  { line: 'MF', w: 2 },
  { line: 'FW', w: 2 },
  { role: 'overlappingFullBack', w: 2 },
];

const combineExtra =
  (state: ScriptState): Extra =>
  (i) =>
    Math.exp(-dist(spot(state, i), state.ball) / 10) *
    (attackSpot(state, i)[0] >= attackBall(state)[0] - 3 ? 1 : 0.1);

export const combine: MoveDef = {
  id: 'combine',
  phases: ['finalThird'],
  weight: (state) =>
    castable(
      state,
      COMBINE_RULES,
      combineExtra(state),
      W.finalThird.combine * (state.flags.beatMan ? BOOST.beatManCombine : 1),
    ),
  run(state) {
    takeFlags(state);
    const receiver = castReceiver(state, COMBINE_RULES, combineExtra(state));
    if (receiver === undefined) return safePass(state);
    const to = feetPoint(state, receiver);
    const hold = state.rng.range(...HOLD.combine);
    simplePass(state, 'combine', receiver, to, hold, prob(P.combine, passOf(state), 0.002), (t) =>
      byNear(state, t),
    );
  },
};

const OUTLET_RULES: readonly CastRule[] = [
  { position: 'ST', w: 3 },
  { position: 'LW', w: 2 },
  { position: 'RW', w: 2 },
  { position: 'LM', w: 2 },
  { position: 'RM', w: 2 },
  { role: 'boxToBox', w: 1 },
];

const outletExtra =
  (state: ScriptState): Extra =>
  (i) =>
    attackSpot(state, i)[0] >= attackBall(state)[0] + 8 ? 1 : 0;

export const outlet: MoveDef = {
  id: 'outlet',
  phases: ['counter'],
  weight: (state) => castable(state, OUTLET_RULES, outletExtra(state), W.counter.outlet),
  run(state) {
    takeFlags(state);
    const receiver = castReceiver(state, OUTLET_RULES, outletExtra(state));
    if (receiver === undefined) return safePass(state);
    const to = stridePoint(state, receiver, state.rng.range(5, 9));
    const hold = state.rng.range(...HOLD.quick);
    simplePass(
      state,
      'outlet',
      receiver,
      to,
      hold,
      prob(P.outlet, passOf(state), 0.002),
      (t) => byNear(state, t),
      { loft: dist(state.ball, to) > 30 },
    );
  },
};

export const DEFAULT_MOVES: readonly MoveDef[] = [
  circulate,
  intoPivot,
  wideOut,
  longBall,
  pressedBack,
  carryForward,
  interior,
  dropLink,
  switchPlay,
  wideRelease,
  recycle,
  throughEarly,
  throughBall,
  cross,
  cutBack,
  edgeShot,
  boxShot,
  takeOn,
  combine,
  outlet,
];
