// Pass-like beats. A completed pass: the passer holds and takes a touch toward his pass while the
// receiver moves to the reception point, the ball is kicked once the receiver can be there when it
// arrives (else to the nearest point he can reach), and the receiver takes it. An intercepted pass
// is kicked once its interceptor can meet it and ends at his feet; a pass out of play runs past
// the line and leaves the ball dead. A pressed pass also waits for its presser to be visibly close.
// `holdForPass`, `reachablePoint` and `kickTo` are the steps T797 reuses for its own beats.
import { PROTO_CONFIG } from '../core/config.ts';
import { clampToPitch, inPitch } from '../core/pitch.ts';
import type { Beat, Vec } from '../core/types.ts';
import { add, approach, dist, norm, scale, sub } from '../core/vec.ts';
import { apexFor, flightTime, giveBall, startFlight, startFlightTimed } from './ball.ts';
import { cueNext, cutRange, nearestOpponent, planCut, resolveCut, shadowPoint } from './contest.ts';
import { paceSpeed, timeToReach } from './motion.ts';
import type { BeatContext } from './perform.ts';
import { ensureOwner, pushEvent, runUntil, setPossession, type StageState } from './world.ts';

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

/**
 * The passer holds the ball at least `hold` seconds, drifting toward `to`, while the receiver (if
 * any) runs there; then he waits up to `stage.maxExtraHold` more until `ready()`.
 */
export function holdUntil(
  state: StageState,
  actor: number,
  receiver: number | undefined,
  to: Vec,
  hold: number,
  ready: () => boolean,
): void {
  state.orders.set(actor, {
    target: () => {
      const pos = state.bodies[actor].pos;
      return add(pos, scale(norm(sub(to, pos)), STAGE.holdDrift));
    },
    pace: 'walk',
  });
  if (receiver !== undefined) state.orders.set(receiver, { target: to, pace: 'run' });
  const start = state.t;
  runUntil(state, () => state.t - start >= hold - 1e-9 && ready(), hold + STAGE.maxExtraHold);
}

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
): boolean {
  holdUntil(
    state,
    actor,
    receiver,
    to,
    hold,
    () => canReceive(state, receiver, to, speed) && (wait ? wait() : true),
  );
  return canReceive(state, receiver, to, speed);
}

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
  const beat = ctx.beat;
  const receiver = beat.receiver;
  if (receiver === undefined) throw new Error('pass without receiver ' + beat.index);
  setPossession(state, beat);
  ensureOwner(state, beat.actor);
  let to = clampToPitch(beat.to, 0.5);
  const speed = speedOf(beat);
  if (!holdForPass(state, beat.actor, receiver, to, speed, beat.hold, pressWait(state, beat))) {
    to = reachablePoint(state, receiver, to, speed);
  }
  kickEvent(state, beat.actor, receiver);
  const flight = startFlight(state, to, speed, beat.loft);
  state.orders.delete(beat.actor);
  state.orders.set(receiver, { target: to, pace: 'sprint' });
  cueNext(state, ctx, to);
  runUntil(state, () => state.t >= flight.t1 - 1e-9, flight.t1 - state.t + PROTO_CONFIG.tick);
  giveBall(state, receiver);
  pushEvent(state, { kind: 'receive', actor: beat.actor, other: receiver, at: to });
  state.orders.clear();
}

/** `pass:intercepted` and `clearance:intercepted`: the ball ends at the interceptor's feet on its path. */
export function performPassIntercepted(state: StageState, ctx: BeatContext): void {
  const beat = ctx.beat;
  const scripted = beat.opponent;
  if (scripted === undefined) throw new Error('interception without opponent ' + beat.index);
  setPossession(state, beat);
  ensureOwner(state, beat.actor);
  const receiver = beat.receiver;
  const R = clampToPitch(beat.to, 0.5);
  const speed = speedOf(beat);
  const team = state.fixture.players[scripted].team;
  const range = cutRange(state, scripted);
  state.orders.set(scripted, {
    target: () => shadowPoint(team, state.ball.pos, R),
    pace: 'run',
  });
  const press = pressWait(state, beat);
  holdUntil(state, beat.actor, receiver, R, beat.hold, () => {
    const from: Vec = [state.ball.pos[0], state.ball.pos[1]];
    const cut = planCut(state, scripted, from, R, flightTime(from, R, speed), range);
    return cut.margin <= STAGE.cutSlack && press();
  });
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
  giveBall(state, opponent);
  pushEvent(state, {
    kind: 'intercept',
    actor: beat.actor,
    other: opponent,
    at: r.plan.point,
    recast: r.recast,
    stretch: r.stretch,
  });
  state.orders.clear();
}

/** `pass:out` and `clearance:out`: the ball runs out of play and lies dead where it left. */
export function performPassOut(state: StageState, ctx: BeatContext): void {
  const beat = ctx.beat;
  setPossession(state, beat);
  ensureOwner(state, beat.actor);
  const receiver = beat.receiver;
  const R = clampToPitch(beat.to, 0.5);
  const speed = speedOf(beat);
  holdForPass(state, beat.actor, receiver, R, speed, beat.hold, pressWait(state, beat));
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
