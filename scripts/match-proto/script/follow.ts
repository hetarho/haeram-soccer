// Shared follow-ups of the move catalogue: what a long ball, a lay-off, a clearance, a keeper's
// distribution, a through ball and a shot emit, and what follows a shot. Every piece takes the state
// and emits through `emit`; none pushes a beat by hand. The chances are a first hand-written
// grammar (T800 measures and tunes them).
import { PROTO_CONFIG } from '../core/config.ts';
import {
  POST_HIGH,
  POST_LOW,
  BOX_X,
  PITCH,
  clampToPitch,
  oppGoal,
  toAttack,
} from '../core/pitch.ts';
import { nominalLineX } from '../core/shape.ts';
import type { Beat, BeatKind, BeatOutcome, Vec } from '../core/types.ts';
import { add, clamp, dist, lerp, norm, scale, sub } from '../core/vec.ts';
import {
  castOpponentNear,
  castReceiver,
  drawOutcome,
  feetPoint,
  keeperOf,
  prob,
  type CastRule,
} from './cast.ts';
import { emit, turnover } from './emit.ts';
import { cornerFor, outOverByline, outToTouch } from './restarts.ts';
import {
  attackBall,
  attackSpot,
  other,
  phaseAt,
  player,
  spot,
  type ScriptFlags,
  type ScriptState,
} from './state.ts';

export const G = PROTO_CONFIG.grammar;
const P = G.p;
const HOLD = G.hold;
const AXIS = PITCH.width / 2;
const MARGIN = PROTO_CONFIG.margin;

export type ShotKind = 'oneOnOne' | 'header' | 'firstTime' | 'box' | 'edge' | 'freeKick';
export type BoxZone = keyof typeof G.box;
export type TakenFlags = Pick<
  ScriptFlags,
  'counterBoost' | 'beatMan' | 'boostLong' | 'boostSwitch'
>;

/** The world point of attack-frame `[x, y]` for the team in possession, kept `margin` inside the lines. */
export const A = (state: ScriptState, x: number, y: number): Vec =>
  clampToPitch(toAttack(state.team, [x, y]), MARGIN);

/** A copy of the four one-beat flags, all set false: every catalogue move's `run` starts with it. */
export function takeFlags(state: ScriptState): TakenFlags {
  const f = state.flags;
  const taken = {
    counterBoost: f.counterBoost,
    beatMan: f.beatMan,
    boostLong: f.boostLong,
    boostSwitch: f.boostSwitch,
  };
  f.counterBoost = false;
  f.beatMan = false;
  f.boostLong = false;
  f.boostSwitch = false;
  return taken;
}

/** Offside chance of a through ball's runner: likelier the poorer his decisions, within its bounds. */
export function offsideChance(decisions: number): number {
  const o = G.offside;
  return clamp(o.base * Math.exp(-(decisions - o.pivot) / o.spread), o.min, o.max);
}

/** A box zone on the ball's side of goal (world frame). */
export function boxPoint(state: ScriptState, zone: BoxZone): Vec {
  const [x, off] = G.box[zone];
  const side = attackBall(state)[1] >= AXIS ? 1 : -1;
  return A(state, x, AXIS + side * off);
}

/** Where a shot crosses the goal line (world frame, not clamped): inside the posts unless wide. */
export function goalPoint(state: ScriptState, outcome: BeatOutcome): Vec {
  let y: number;
  if (outcome === 'wide') {
    const low = state.rng.chance(0.5);
    const by = state.rng.range(0.8, 4);
    y = low ? POST_LOW - by : POST_HIGH + by;
  } else {
    y = state.rng.range(POST_LOW + 0.4, POST_HIGH - 0.4);
  }
  return toAttack(state.team, [PITCH.length, y]);
}

/** `[x, y]` plus ± `by` metres on each axis (x then y), kept inside the lines. */
const jittered = (state: ScriptState, p: Vec, by: number): Vec =>
  clampToPitch([p[0] + state.rng.range(-by, by), p[1] + state.rng.range(-by, by)], MARGIN);

/** Fallback: to the outfield teammate nearest the ball (`SAFE` of moves.ts). */
export function safePass(state: ScriptState): void {
  takeFlags(state);
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
  const hold = state.rng.range(...HOLD.build);
  const back = toAttack(state.team, to)[0] < attackBall(state)[0] - G.resetBehind;
  const complete = state.rng.chance(P.safe);
  emit(state, {
    move: 'safe',
    kind: 'pass',
    actor,
    receiver,
    to,
    hold,
    reason: back ? 'reset' : undefined,
    outcome: complete ? 'complete' : 'intercepted',
    opponent: complete ? undefined : castOpponentNear(state, lerp(state.ball, to, G.interceptAt)),
  });
}

const SHOT_MOVE: Record<ShotKind, string> = {
  oneOnOne: 'oneOnOne',
  header: 'header',
  firstTime: 'firstTime',
  box: 'boxShot',
  edge: 'edgeShot',
  freeKick: 'freeKickShot',
};

const shotHold = (kind: ShotKind): readonly [number, number] =>
  kind === 'header' || kind === 'firstTime'
    ? HOLD.firstTime
    : kind === 'edge' || kind === 'freeKick'
      ? HOLD.edgeShot
      : HOLD.shot;

/** The holder strikes at goal; `afterShot` settles what follows. */
export function finish(state: ScriptState, kind: ShotKind, beatKind: BeatKind = 'shot'): Beat {
  const actor = state.holder;
  const t = P.shot[kind];
  const attrs = player(state, actor).attrs;
  const goal = prob(t.goal, kind === 'header' ? attrs.heading : attrs.finishing, P.shotAttr[kind]);
  const outcome = drawOutcome(state.rng, [
    ['goal', goal],
    ['saved', t.saved],
    ['blocked', t.blocked],
    ['wide', Math.max(0.05, 1 - goal - t.saved - t.blocked)],
  ] as const);
  const to = goalPoint(state, outcome);
  let opponent: number | undefined;
  if (outcome === 'saved') opponent = keeperOf(state, other(state.team));
  if (outcome === 'blocked') {
    const toward = norm(sub(oppGoal(state.team), state.ball));
    opponent = castOpponentNear(state, add(state.ball, scale(toward, G.blockAhead)), {
      lines: ['DF', 'MF'],
    });
  }
  const beat = emit(state, {
    move: SHOT_MOVE[kind],
    kind: beatKind,
    actor,
    to,
    hold: state.rng.range(...shotHold(kind)),
    header: kind === 'header',
    outcome,
    opponent,
  });
  afterShot(state, beat);
  return beat;
}

const AFTER_BLOCK_RULES: readonly CastRule[] = [
  { line: 'MF', w: 2 },
  { line: 'FW', w: 2 },
];

/** What follows a saved or blocked shot; a goal and a wide shot are settled by `emit`. */
export function afterShot(state: ScriptState, beat: Beat): void {
  if (beat.outcome === 'saved') {
    if (state.rng.chance(P.saveHold)) {
      state.ball = lerp(beat.from, beat.to, 0.9);
      turnover(state, keeperOf(state, other(beat.team)));
      gkDistribute(state);
    } else {
      state.pending = cornerFor(state, beat.team, toAttack(beat.team, beat.to)[1]);
    }
    return;
  }
  if (beat.outcome !== 'blocked') return;
  const u = state.rng.next();
  if (u < P.blockedCorner) {
    state.pending = cornerFor(state, beat.team, toAttack(beat.team, beat.to)[1]);
  } else if (u < P.blockedCorner + P.blockedDefender) {
    state.ball = add(beat.from, scale(norm(sub(beat.to, beat.from)), G.blockAhead));
    turnover(state, beat.opponent ?? keeperOf(state, other(beat.team)));
    defensiveClear(state);
  } else {
    // The attack keeps it: a second ball won outside the scramble.
    const [bx] = toAttack(beat.team, beat.from);
    state.holder =
      castReceiver(state, AFTER_BLOCK_RULES, (i) =>
        Math.exp(-dist(spot(state, i), state.ball) / 15),
      ) ?? beat.actor;
    const x = clamp(bx - state.rng.range(4, 9), 72, 100);
    state.ball = A(state, x, AXIS + state.rng.range(-12, 12));
    state.phase = phaseAt(state.team, state.ball);
  }
}

const GK_SHORT_RULES: readonly CastRule[] = [
  { position: 'CB', w: 3 },
  { position: 'LB', w: 2 },
  { position: 'RB', w: 2 },
  { position: 'DM', w: 1 },
];

/** The keeper on the ball plays it long or short. */
export function gkDistribute(state: ScriptState): void {
  const flags = takeFlags(state);
  if (state.rng.chance(P.gkLong[state.fixture.teams[state.team].style])) {
    playLongBall(state, 'gkLong', 'pass', flags);
    return;
  }
  const actor = state.holder;
  const receiver = castReceiver(state, GK_SHORT_RULES);
  if (receiver === undefined) {
    safePass(state);
    return;
  }
  const to = feetPoint(state, receiver);
  const complete = state.rng.chance(G.restart.goalKickComplete);
  emit(state, {
    move: 'gkShort',
    kind: 'pass',
    actor,
    receiver,
    to,
    hold: state.rng.range(...HOLD.keeper),
    outcome: complete ? 'complete' : 'intercepted',
    opponent: complete ? undefined : castOpponentNear(state, to, { lines: ['FW'] }),
  });
}

export const LONG_RULES: readonly CastRule[] = [
  { role: 'targetMan', w: 4 },
  { role: 'falseNine', w: 0.8 },
  { position: 'ST', w: 2 },
  { position: 'LW', w: 1 },
  { position: 'RW', w: 1 },
  { position: 'LM', w: 1 },
  { position: 'RM', w: 1 },
];

/** A long ball to the front men: won and laid off, headed away by a defender or out. */
export function playLongBall(
  state: ScriptState,
  moveId: string,
  kind: BeatKind,
  flags: TakenFlags,
): void {
  const actor = state.holder;
  const receiver = castReceiver(state, LONG_RULES);
  if (receiver === undefined) {
    if (kind !== 'pass') throw new Error(`playLongBall: nobody to cast for ${moveId}`);
    safePass(state);
    return;
  }
  let to = jittered(state, spot(state, receiver), 3);
  const keeper = player(state, actor).slot === 0;
  const holdRange: readonly [number, number] = keeper ? HOLD.keeper : HOLD.build;
  const hold = state.rng.range(...holdRange);
  const win = prob(P.longWin, player(state, receiver).attrs.heading, 0.004);
  const outcome = drawOutcome(state.rng, [
    ['complete', win],
    ['intercepted', P.longLose],
    ['out', Math.max(0.02, 1 - win - P.longLose)],
  ] as const);
  const reason = flags.boostLong ? 'pressed' : undefined;
  if (outcome === 'out') {
    const [ax, ay] = toAttack(state.team, to);
    const out = ax >= 90 ? outOverByline(state, ay) : outToTouch(state, ax);
    to = out.to;
    emit(state, {
      move: moveId,
      kind,
      actor,
      receiver,
      to,
      hold,
      loft: true,
      reason,
      outcome,
      then: out.then,
    });
    return;
  }
  const opponent =
    outcome === 'intercepted' ? castOpponentNear(state, to, { lines: ['DF'] }) : undefined;
  emit(state, {
    move: moveId,
    kind,
    actor,
    receiver,
    to,
    hold,
    loft: true,
    reason,
    outcome,
    opponent,
  });
  if (outcome === 'complete') layOff(state);
  else defensiveClear(state);
}

const LAYOFF_RULES: readonly CastRule[] = [
  { position: 'CM', w: 3 },
  { position: 'DM', w: 2 },
  { role: 'invertedFullBack', w: 2 },
  { position: 'LW', w: 2 },
  { position: 'RW', w: 2 },
  { position: 'LM', w: 1.5 },
  { position: 'RM', w: 1.5 },
  { position: 'LB', w: 1 },
  { position: 'RB', w: 1 },
];

/** The target lays the ball off to a supporting teammate. */
export function layOff(state: ScriptState): void {
  const actor = state.holder;
  const receiver = castReceiver(state, LAYOFF_RULES, (i) =>
    Math.exp(-dist(spot(state, i), state.ball) / 12),
  );
  if (receiver === undefined) {
    safePass(state);
    return;
  }
  const to = feetPoint(state, receiver);
  const complete = state.rng.chance(P.layOff);
  emit(state, {
    move: 'layOff',
    kind: 'pass',
    actor,
    receiver,
    to,
    hold: state.rng.range(...HOLD.quick),
    reason: 'layoff',
    outcome: complete ? 'complete' : 'intercepted',
    opponent: complete ? undefined : castOpponentNear(state, lerp(state.ball, to, G.interceptAt)),
  });
}

const CLEAR_RULES: readonly CastRule[] = [
  { line: 'FW', w: 3 },
  { position: 'LM', w: 1.5 },
  { position: 'RM', w: 1.5 },
];

/** The holder clears his lines: into touch, to a front man on the break, or back to the attack. */
export function defensiveClear(state: ScriptState): void {
  const actor = state.holder;
  const [bx, by] = attackBall(state);
  const hold = state.rng.range(...HOLD.carry);
  let outcome = drawOutcome(state.rng, [
    ['out', P.clearOut],
    ['complete', P.clearKeep],
    ['intercepted', Math.max(0, 1 - P.clearOut - P.clearKeep)],
  ] as const);
  let receiver: number | undefined;
  if (outcome === 'complete') {
    receiver = castReceiver(state, CLEAR_RULES);
    if (receiver === undefined) outcome = 'out';
  }
  const base = { move: 'defensiveClear', kind: 'clearance', actor, hold, loft: true } as const;
  if (outcome === 'out') {
    const { to, then } = outToTouch(state, bx + state.rng.range(15, 30));
    emit(state, { ...base, to, outcome, then });
    return;
  }
  if (outcome === 'complete' && receiver !== undefined) {
    const to = jittered(state, spot(state, receiver), 3);
    emit(state, { ...base, receiver, to, outcome });
    state.phase = 'counter';
    state.flags.counterBeats = state.rng.int(...G.counter.beats);
    return;
  }
  const to = A(state, bx + state.rng.range(18, 30), by + state.rng.range(-10, 10));
  const opponent = castOpponentNear(state, to, { lines: ['MF', 'DF'] });
  emit(state, { ...base, to, outcome: 'intercepted', opponent });
}

export const RUNNER_RULES: readonly CastRule[] = [
  { role: 'poacher', w: 4 },
  { role: 'invertedWinger', w: 2.5 },
  { role: 'falseNine', w: 0.4 },
  { role: 'targetMan', w: 0.6 },
  { position: 'ST', w: 2 },
  { role: 'mezzala', w: 1.5 },
  { role: 'traditionalWinger', w: 1.5 },
  { role: 'overlappingFullBack', w: 1 },
  { role: 'wideMidfielder', w: 1 },
];

/** The runners' extra weight: those within `nearLine` of the defending line. */
export const runnerExtra = (state: ScriptState): ((i: number) => number) => {
  const line = nominalLineX({ fixture: state.fixture, ball: state.ball }, state.team);
  return (i) => (attackSpot(state, i)[0] >= line - G.through.nearLine ? 1 : 0);
};

/**
 * True when a through ball has room to land behind the defending line: at least the nearest of
 * `through.behind` before `through.maxX`. A line already deep at the byline leaves none, and a
 * runner there can never be staged beyond it.
 */
export const hasThroughRoom = (state: ScriptState): boolean =>
  G.through.maxX - nominalLineX({ fixture: state.fixture, ball: state.ball }, state.team) >=
  G.through.behind[0];

/** A ball in behind the defending line for a runner: offside, through on goal, cut out or out. */
export function playThrough(state: ScriptState, moveId: string): void {
  const actor = state.holder;
  const th = G.through;
  const line = nominalLineX({ fixture: state.fixture, ball: state.ball }, state.team);
  const runner = castReceiver(state, RUNNER_RULES, runnerExtra(state));
  if (runner === undefined) {
    safePass(state);
    return;
  }
  const rs = attackSpot(state, runner);
  const x = Math.min(th.maxX, Math.max(line + state.rng.range(...th.behind), rs[0] + 8));
  let to = A(state, x, rs[1] + (AXIS - rs[1]) * th.narrow);
  const loft = dist(state.ball, to) > th.loftFrom;
  const hold = state.rng.range(...HOLD.through);
  const base = {
    move: moveId,
    kind: 'pass',
    actor,
    receiver: runner,
    hold,
    loft,
    through: true,
  } as const;
  if (state.rng.chance(offsideChance(player(state, runner).attrs.decisions))) {
    emit(state, { ...base, to, outcome: 'offside' });
    return;
  }
  const complete = prob(P.through, player(state, actor).attrs.vision, 0.004);
  const outcome = drawOutcome(state.rng, [
    ['complete', complete],
    ['intercepted', P.throughCut],
    ['out', Math.max(0.02, 1 - complete - P.throughCut)],
  ] as const);
  if (outcome === 'out') {
    const out = outOverByline(state, toAttack(state.team, to)[1]);
    to = out.to;
    emit(state, { ...base, to, outcome, then: out.then });
    return;
  }
  if (outcome === 'intercepted') {
    const keeper =
      toAttack(state.team, to)[0] >= BOX_X && state.rng.chance(P.throughKeeper)
        ? keeperOf(state, other(state.team))
        : undefined;
    const opponent = keeper ?? castOpponentNear(state, to, { lines: ['DF'] });
    emit(state, { ...base, to, outcome, opponent });
    if (keeper !== undefined) gkDistribute(state);
    return;
  }
  emit(state, { ...base, to, outcome });
  // The runner is through on goal.
  const [bx, by] = attackBall(state);
  const d = Math.min(th.oneOnOneCarry, 96 - bx);
  if (d >= 2) {
    emit(state, {
      move: 'oneOnOne',
      kind: 'carry',
      actor: state.holder,
      to: A(state, bx + d, by + (AXIS - by) * 0.5),
      hold: state.rng.range(...HOLD.carry),
      outcome: 'complete',
    });
  }
  finish(state, 'oneOnOne');
}
