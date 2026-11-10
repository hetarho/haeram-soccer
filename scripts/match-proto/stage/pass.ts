// A completed pass: the passer holds and takes a touch toward his pass while the receiver moves to
// the reception point, the ball is kicked once the receiver can be there when it arrives (else to
// the nearest point he can reach), and the receiver takes it. `holdForPass`, `reachablePoint` and
// `kickTo` are the steps T796 and T797 reuse for their own pass-like beats.
import { PROTO_CONFIG } from '../core/config.ts';
import { clampToPitch } from '../core/pitch.ts';
import type { Vec } from '../core/types.ts';
import { add, approach, norm, scale, sub } from '../core/vec.ts';
import { flightTime, giveBall, startFlight } from './ball.ts';
import { paceSpeed, timeToReach } from './motion.ts';
import type { BeatContext } from './perform.ts';
import { ensureOwner, pushEvent, runUntil, setPossession, type StageState } from './world.ts';

const STAGE = PROTO_CONFIG.stage;
const MOTION = PROTO_CONFIG.motion;

const sprintOf = (state: StageState, index: number): number =>
  paceSpeed('sprint', state.fixture.players[index]);

/** The receiver can sprint to `to` before a kick from the ball's place at `speed` gets there. */
export function canReceive(state: StageState, receiver: number, to: Vec, speed: number): boolean {
  return (
    timeToReach(state.bodies[receiver], to, sprintOf(state, receiver)) <=
    flightTime(state.ball.pos, to, speed) + STAGE.receiveSlack
  );
}

/**
 * The passer holds the ball at least `hold` seconds, drifting toward `to`, while the receiver runs
 * there; he waits up to `stage.maxExtraHold` more for the receiver to be in reach. True when the
 * receiver can be at `to` in time.
 */
export function holdForPass(
  state: StageState,
  actor: number,
  receiver: number,
  to: Vec,
  speed: number,
  hold: number,
): boolean {
  state.orders.set(actor, {
    target: () => {
      const pos = state.bodies[actor].pos;
      return add(pos, scale(norm(sub(to, pos)), STAGE.holdDrift));
    },
    pace: 'walk',
  });
  state.orders.set(receiver, { target: to, pace: 'run' });
  const start = state.t;
  runUntil(
    state,
    () => state.t - start >= hold - 1e-9 && canReceive(state, receiver, to, speed),
    hold + STAGE.maxExtraHold,
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

/** Kicks the ball to `to`; the receiver sprints there and the stage runs until the ball arrives. */
export function kickTo(
  state: StageState,
  actor: number,
  receiver: number,
  to: Vec,
  speed: number,
  loft: boolean,
): void {
  pushEvent(state, { kind: 'kick', actor, other: receiver, at: [...state.ball.pos] as Vec });
  const flight = startFlight(state, to, speed, loft);
  state.orders.delete(actor);
  state.orders.set(receiver, { target: to, pace: 'sprint' });
  runUntil(state, () => state.t >= flight.t1 - 1e-9, flight.t1 - state.t + PROTO_CONFIG.tick);
}

/** `pass:complete` for every pass-like kind. */
export function performPass(state: StageState, ctx: BeatContext): void {
  const beat = ctx.beat;
  const receiver = beat.receiver;
  if (receiver === undefined) throw new Error('pass without receiver ' + beat.index);
  setPossession(state, beat);
  ensureOwner(state, beat.actor);
  let to = clampToPitch(beat.to, 0.5);
  const speed = beat.loft ? PROTO_CONFIG.ball.loft : PROTO_CONFIG.ball.ground;
  if (!holdForPass(state, beat.actor, receiver, to, speed, beat.hold)) {
    to = reachablePoint(state, receiver, to, speed);
  }
  kickTo(state, beat.actor, receiver, to, speed, beat.loft);
  giveBall(state, receiver);
  pushEvent(state, { kind: 'receive', actor: beat.actor, other: receiver, at: to });
  state.orders.clear();
}
