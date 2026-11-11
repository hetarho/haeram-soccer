// Pass-like beats. A completed pass: the passer holds and takes a touch toward his pass while the
// receiver moves to the reception point, the ball is kicked once the receiver can be there when it
// arrives (else to the nearest point he can reach), and the receiver takes it. An intercepted pass
// is kicked once its interceptor can meet it and ends at his feet; a pass out of play runs past
// the line and leaves the ball dead. A pressed pass also waits for its presser to be visibly close.
// `holdForPass`, `reachablePoint` and `kickTo` are the steps T797 reuses for its own beats.
import { PROTO_CONFIG } from '../core/config.ts';
import { CENTRE, HALFWAY, clampToPitch, inBox, inPitch, toAttack } from '../core/pitch.ts';
import { offsideLineX } from '../core/shape.ts';
import type { Beat, TeamId, Vec } from '../core/types.ts';
import { add, approach, dist, norm, scale, sub } from '../core/vec.ts';
import { apexFor, flightTime, startFlight, startFlightTimed } from './ball.ts';
import { cueNext, cutRange, nearestOpponent, planCut, resolveCut, shadowPoint } from './contest.ts';
import { paceSpeed, timeToReach } from './motion.ts';
import type { BeatContext } from './perform.ts';
import { performThrough } from './through.ts';
import {
  ensureOwner,
  isLate,
  positionsOf,
  pushEvent,
  runUntil,
  setPossession,
  type Order,
  type StageState,
} from './world.ts';

const SHAPE = PROTO_CONFIG.shape;
const STAGE = PROTO_CONFIG.stage;
const MOTION = PROTO_CONFIG.motion;
const BALL = PROTO_CONFIG.ball;

const sprintOf = (state: StageState, index: number): number =>
  paceSpeed('sprint', state.fixture.players[index]);

const speedOf = (beat: Beat): number => (beat.loft ? BALL.loft : BALL.ground);

/** The receiver can sprint to `to` before a kick from the ball's place at `speed` gets there; no receiver always can. */
export function canReceive(
  state: StageState,
  receiver: number | undefined,
  to: Vec,
  speed: number,
): boolean {
  if (receiver === undefined) return true;
  if (dist(state.bodies[receiver].pos, to) <= STAGE.controlRange) return true;
  return (
    timeToReach(state.bodies[receiver], to, sprintOf(state, receiver)) <=
    flightTime(state.ball.pos, to, speed) + STAGE.receiveSlack
  );
}

/** For a pressed beat, true once the nearest opponent is within `stage.pressVisible` of the actor. */
export function pressWait(state: StageState, beat: Beat): () => boolean {
  return () =>
    beat.reason !== 'pressed' || nearestOpponent(state, beat.actor).distance <= STAGE.pressVisible;
}

/** The passer's order while he holds: one touch of at most `stage.holdDrift` toward `to`, never nearer to `to` than `stage.kickGap`; the point is fixed when the hold starts. */
export function holdTouch(state: StageState, actor: number, to: Vec): Order {
  const pos = state.bodies[actor].pos;
  const start: Vec = [pos[0], pos[1]];
  const step = Math.min(STAGE.holdDrift, Math.max(0, dist(start, to) - STAGE.kickGap));
  return { target: step > 0 ? add(start, scale(norm(sub(to, start)), step)) : start, pace: 'walk' };
}

/** `to` moved straight away from the ball until it is `stage.kickGap` from it; unchanged when it is already that far. */
export function roomyAim(state: StageState, receiver: number, to: Vec): Vec {
  const ball: Vec = [state.ball.pos[0], state.ball.pos[1]];
  if (dist(ball, to) >= STAGE.kickGap) return to;
  const toward = (q: Vec): Vec | undefined => (dist(ball, q) >= 0.5 ? q : undefined);
  const aim = toward(to) ?? toward(state.bodies[receiver].pos) ?? CENTRE;
  return clampToPitch(add(ball, scale(norm(sub(aim, ball)), STAGE.kickGap)), 0.5);
}

/**
 * An ordinary pass (kind `pass`, not a through ball) is received `stage.kickGap` from the ball at
 * least; without a receiver the passer stands in for him, so an aim on the ball turns to the centre.
 */
const roomy = (state: StageState, beat: Beat, to: Vec): Vec =>
  beat.kind === 'pass' && !beat.through ? roomyAim(state, beat.receiver ?? beat.actor, to) : to;

/**
 * The passer holds the ball at least `hold` seconds, taking one touch toward `to` (`holdTouch`),
 * while the receiver (if any) runs there; then he waits up to `stage.maxExtraHold` more until `ready()`.
 */
export function holdUntil(
  state: StageState,
  actor: number,
  receiver: number | undefined,
  to: Vec,
  hold: number,
  ready: () => boolean,
  receiverOrder?: Order,
): void {
  state.orders.set(actor, holdTouch(state, actor, to));
  if (receiver !== undefined) {
    state.orders.set(receiver, receiverOrder ?? { target: to, pace: 'run' });
  }
  const start = state.t;
  runUntil(state, () => state.t - start >= hold - 1e-9 && ready(), hold + STAGE.maxExtraHold);
}

/**
 * After the hold and its extra allowance, an ordinary pass is still not played to a receiver in an
 * offside position: the passer keeps it, up to `stage.through.maxWait` more, while the receiver
 * (sprinting while beyond the line) gets back onside.
 */
const untilOnside = (state: StageState, held: { onside: () => boolean }): void =>
  runUntil(state, held.onside, STAGE.through.maxWait);

/**
 * `holdUntil` the receiver is in reach of `to` (and `wait()`, when given). True when the receiver
 * can be at `to` in time.
 */
export function holdForPass(
  state: StageState,
  actor: number,
  receiver: number | undefined,
  to: Vec,
  speed: number,
  hold: number,
  wait?: () => boolean,
  receiverOrder?: Order,
): boolean {
  holdUntil(
    state,
    actor,
    receiver,
    to,
    hold,
    () => canReceive(state, receiver, to, speed) && (wait ? wait() : true),
    receiverOrder,
  );
  return canReceive(state, receiver, to, speed);
}

/** The offside line of `team`'s attack now, as an attack-frame x. */
const lineNow = (state: StageState, team: TeamId): number =>
  offsideLineX(state.fixture, positionsOf(state), team);

/** `p` (world) with its attack x capped `shape.onsideGap` inside `team`'s offside line. */
const onsideCap = (state: StageState, team: TeamId, p: Vec): Vec => {
  const a = toAttack(team, p);
  const cap = lineNow(state, team) - SHAPE.onsideGap;
  return a[0] > cap ? toAttack(team, [cap, a[1]]) : p;
};

/** An ordinary pass (kind `pass`, not a through ball) is never played to a man offside. */
const guarded = (beat: Beat): boolean => beat.kind === 'pass' && !beat.through;

/**
 * How the receiver holds while the ball is not yet played, and what else the kick waits for: a
 * lofted delivery into the box has him wait at his run-up point; an ordinary pass keeps him onside
 * (sprinting back while he stands beyond the line) and waits until he is onside or not ahead of the ball.
 */
export function receiverHold(
  state: StageState,
  beat: Beat,
  receiver: number | undefined,
  R: Vec,
): { order?: Order; onside: () => boolean } {
  if (receiver === undefined) return { onside: () => true };
  const team = beat.team;
  const aim = toAttack(team, R);
  const base: Vec =
    beat.loft && inBox(toAttack(team, beat.to))
      ? clampToPitch(toAttack(team, [aim[0] - PROTO_CONFIG.stage.cross.runUp, aim[1]]), 0.5)
      : R;
  if (!guarded(beat)) return { order: { target: base, pace: 'run' }, onside: () => true };
  const rx = (): number => toAttack(team, state.bodies[receiver].pos)[0];
  return {
    order: {
      target: () => onsideCap(state, team, base),
      get pace() {
        return rx() > lineNow(state, team) ? 'sprint' : 'run';
      },
    },
    onside: () => rx() <= lineNow(state, team) - 0.05 || rx() <= toAttack(team, state.ball.pos)[0],
  };
}

/** At the kick an ordinary pass's aim in the opponents' half is kept onside too. */
const kickAim = (state: StageState, beat: Beat, R: Vec): Vec =>
  guarded(beat) && toAttack(beat.team, R)[0] > HALFWAY ? onsideCap(state, beat.team, R) : R;

/** The point on the way from the receiver to `to` he can sprint to while the ball travels there. */
export function reachablePoint(state: StageState, receiver: number, to: Vec, speed: number): Vec {
  const sprint = sprintOf(state, receiver);
  const from = state.bodies[receiver].pos;
  let p: Vec = to;
  for (let i = 0; i < 3; i++) {
    const t = flightTime(state.ball.pos, p, speed);
    const reach = Math.max(0, t + STAGE.receiveSlack - MOTION.reactTime) * sprint * 0.9;
    p = approach(from, to, reach);
  }
  return p;
}

const kickEvent = (state: StageState, actor: number, receiver: number | undefined): void => {
  pushEvent(state, {
    kind: 'kick',
    actor,
    ...(receiver !== undefined ? { other: receiver } : {}),
    at: [state.ball.pos[0], state.ball.pos[1]],
  });
};

/** Kicks the ball to `to`; the receiver sprints there and the stage runs until the ball arrives. */
export function kickTo(
  state: StageState,
  actor: number,
  receiver: number,
  to: Vec,
  speed: number,
  loft: boolean,
): void {
  kickEvent(state, actor, receiver);
  const flight = startFlight(state, to, speed, loft);
  state.orders.delete(actor);
  state.orders.set(receiver, { target: to, pace: 'sprint' });
  runUntil(state, () => state.t >= flight.t1 - 1e-9, flight.t1 - state.t + PROTO_CONFIG.tick);
}

/** `pass:complete` and `clearance:complete`. */
export function performPass(state: StageState, ctx: BeatContext): void {
  if (ctx.beat.through) return performThrough(state, ctx);
  const beat = ctx.beat;
  const receiver = beat.receiver;
  if (receiver === undefined) throw new Error('pass without receiver ' + beat.index);
  setPossession(state, beat);
  ensureOwner(state, beat.actor);
  let to = roomy(state, beat, clampToPitch(beat.to, 0.5));
  const speed = speedOf(beat);
  const press = pressWait(state, beat);
  const held = receiverHold(state, beat, receiver, to);
  const wait = (): boolean => press() && held.onside();
  holdForPass(state, beat.actor, receiver, to, speed, beat.hold, wait, held.order);
  untilOnside(state, held);
  to = kickAim(state, beat, to);
  if (!canReceive(state, receiver, to, speed)) {
    to = reachablePoint(state, receiver, to, speed);
  }
  kickEvent(state, beat.actor, receiver);
  const flight = startFlight(state, to, speed, beat.loft);
  state.orders.delete(beat.actor);
  state.orders.set(receiver, { target: to, pace: 'sprint' });
  cueNext(state, ctx, to);
  runUntil(state, () => state.t >= flight.t1 - 1e-9, flight.t1 - state.t + PROTO_CONFIG.tick);
  ensureOwner(state, receiver);
  pushEvent(state, {
    kind: 'receive',
    actor: beat.actor,
    other: receiver,
    at: [state.ball.pos[0], state.ball.pos[1]],
  });
  state.orders.clear();
}

/**
 * `pass:intercepted` and `clearance:intercepted`: the ball ends at the interceptor's feet on its path.
 * A through ball without a named runner (a fitted script's: the record names none for a ball that
 * never arrived) is cut out as an ordinary pass is.
 */
export function performPassIntercepted(state: StageState, ctx: BeatContext): void {
  if (ctx.beat.through && ctx.beat.outcome !== 'loose' && ctx.beat.receiver !== undefined)
    return performThrough(state, ctx);
  winOnPath(state, ctx, ctx.beat.outcome === 'loose' ? 'loose' : 'intercept');
}

/**
 * `pass:loose` and `clearance:loose`: with an opponent, he wins it on its path as an interceptor
 * does (a `loose` event); without one the ball lands at the beat's aim and lies for the next beat.
 */
export function performPassLoose(state: StageState, ctx: BeatContext): void {
  if (ctx.beat.opponent !== undefined) return winOnPath(state, ctx, 'loose');
  const beat = ctx.beat;
  setPossession(state, beat);
  ensureOwner(state, beat.actor);
  const R = clampToPitch(beat.to, 0.5);
  const speed = speedOf(beat);
  const held = receiverHold(state, beat, beat.receiver, R);
  holdForPass(
    state,
    beat.actor,
    beat.receiver,
    R,
    speed,
    beat.hold,
    pressWait(state, beat),
    held.order,
  );
  kickEvent(state, beat.actor, beat.receiver);
  const flight = startFlight(state, R, speed, beat.loft);
  state.orders.delete(beat.actor);
  runUntil(state, () => state.t >= flight.t1 - 1e-9, flight.t1 - state.t + PROTO_CONFIG.tick);
  const ball = state.ball;
  ball.mode = 'loose';
  ball.owner = -1;
  delete ball.flight;
  pushEvent(state, { kind: 'loose', actor: beat.actor, at: [ball.pos[0], ball.pos[1]] });
  state.orders.clear();
}

function winOnPath(state: StageState, ctx: BeatContext, kind: 'intercept' | 'loose'): void {
  const beat = ctx.beat;
  const scripted = beat.opponent;
  if (scripted === undefined) throw new Error('interception without opponent ' + beat.index);
  setPossession(state, beat);
  ensureOwner(state, beat.actor);
  const receiver = beat.receiver;
  let R = roomy(state, beat, clampToPitch(beat.to, 0.5));
  const speed = speedOf(beat);
  const team = state.fixture.players[scripted].team;
  const range = cutRange(state, scripted);
  const aimed = R;
  state.orders.set(scripted, {
    target: () => shadowPoint(team, state.ball.pos, aimed),
    pace: 'run',
  });
  const press = pressWait(state, beat);
  const held = receiverHold(state, beat, receiver, R);
  holdUntil(
    state,
    beat.actor,
    receiver,
    R,
    beat.hold,
    () => {
      const from: Vec = [state.ball.pos[0], state.ball.pos[1]];
      const cut = planCut(state, scripted, from, aimed, flightTime(from, aimed, speed), range);
      return cut.margin <= STAGE.cutSlack && press() && held.onside();
    },
    held.order,
  );
  untilOnside(state, held);
  R = kickAim(state, beat, R);
  const from: Vec = [state.ball.pos[0], state.ball.pos[1]];
  const r = resolveCut(state, scripted, from, R, flightTime(from, R, speed));
  kickEvent(state, beat.actor, receiver);
  const apex = apexFor(dist(from, R), beat.loft) * r.plan.param;
  const flight = startFlightTimed(state, r.plan.point, r.plan.time, apex);
  const opponent = r.plan.opponent;
  state.orders.clear();
  state.orders.set(opponent, {
    target: r.plan.point,
    pace: 'sprint',
    boost: r.stretch ? STAGE.lunge : 0,
  });
  if (receiver !== undefined) state.orders.set(receiver, { target: R, pace: 'sprint' });
  runUntil(state, () => state.t >= flight.t1 - 1e-9, flight.t1 - state.t + PROTO_CONFIG.tick);
  // A late interceptor collects the ball where it lies rather than it jumping to his feet.
  const late = state.bound && isLate(state, opponent);
  ensureOwner(state, opponent);
  pushEvent(state, {
    kind,
    actor: beat.actor,
    other: opponent,
    at: [state.ball.pos[0], state.ball.pos[1]],
    recast: r.recast,
    stretch: r.stretch,
    ...(late ? { late: true } : {}),
  });
  state.orders.clear();
}

/** `pass:out` and `clearance:out`: the ball runs out of play and lies dead where it left. */
export function performPassOut(state: StageState, ctx: BeatContext): void {
  if (ctx.beat.through) return performThrough(state, ctx);
  const beat = ctx.beat;
  setPossession(state, beat);
  ensureOwner(state, beat.actor);
  const receiver = beat.receiver;
  const R = clampToPitch(beat.to, 0.5);
  const speed = speedOf(beat);
  const press = pressWait(state, beat);
  const held = receiverHold(state, beat, receiver, R);
  const wait = (): boolean => press() && held.onside();
  holdForPass(state, beat.actor, receiver, R, speed, beat.hold, wait, held.order);
  untilOnside(state, held);
  const ballPos: Vec = [state.ball.pos[0], state.ball.pos[1]];
  const E: Vec = !inPitch(beat.to, -0.1)
    ? beat.to
    : add(beat.to, scale(norm(sub(beat.to, ballPos)), STAGE.restart.outRun));
  kickEvent(state, beat.actor, receiver);
  const flight = startFlight(state, E, speed, beat.loft);
  state.orders.delete(beat.actor);
  runUntil(state, () => state.t >= flight.t1 - 1e-9, flight.t1 - state.t + PROTO_CONFIG.tick);
  const ball = state.ball;
  ball.mode = 'dead';
  ball.owner = -1;
  delete ball.flight;
  state.live = false;
  pushEvent(state, { kind: 'out', actor: beat.actor, at: clampToPitch(E, 0) });
  state.orders.clear();
}
