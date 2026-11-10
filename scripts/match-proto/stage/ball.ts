// The ball on the stage: held at its owner's feet, in flight along a straight line (a lofted ball
// on a parabola above it), or lying still while loose or dead. It moves only where a handler sends
// it; nothing here draws a random number.
import { PROTO_CONFIG } from '../core/config.ts';
import type { Vec } from '../core/types.ts';
import { clamp, dist, lerp } from '../core/vec.ts';
import type { Flight, StageState } from './world.ts';

const BALL = PROTO_CONFIG.ball;

/** Seconds a kick from `from` to `to` at `speed` m/s takes, never under `ball.minFlight`. */
export function flightTime(from: Vec, to: Vec, speed: number): number {
  return Math.max(BALL.minFlight, dist(from, to) / speed);
}

/** Kicks the ball from where it is now toward `to`; the ball is in flight and nobody owns it. */
export function startFlight(state: StageState, to: Vec, speed: number, loft: boolean): Flight {
  const from: Vec = [state.ball.pos[0], state.ball.pos[1]];
  const d = dist(from, to);
  const flight: Flight = {
    from,
    to: [to[0], to[1]],
    t0: state.t,
    t1: state.t + flightTime(from, to, speed),
    apex: loft ? clamp(d * BALL.loftPerMetre, BALL.loftMin, BALL.loftMax) : 0,
  };
  state.ball.mode = 'flight';
  state.ball.owner = -1;
  state.ball.flight = flight;
  return flight;
}

/** Player `index` has the ball at his feet at once. */
export function giveBall(state: StageState, index: number): void {
  const ball = state.ball;
  ball.mode = 'held';
  ball.owner = index;
  delete ball.flight;
  placeAtFeet(state);
}

const placeAtFeet = (state: StageState): void => {
  const body = state.bodies[state.ball.owner];
  state.ball.pos = [
    body.pos[0] + body.face[0] * BALL.carryOffset,
    body.pos[1] + body.face[1] * BALL.carryOffset,
  ];
  state.ball.z = 0;
};

/** Moves the ball for the current time: at the owner's feet, along its flight, or nowhere. */
export function updateBall(state: StageState): void {
  const ball = state.ball;
  if (ball.mode === 'held') {
    placeAtFeet(state);
    return;
  }
  if (ball.mode === 'flight' && ball.flight) {
    const f = ball.flight;
    const span = f.t1 - f.t0;
    const s = span <= 0 ? 1 : clamp((state.t - f.t0) / span, 0, 1);
    const p = lerp(f.from, f.to, s);
    ball.pos = [p[0], p[1]];
    ball.z = 4 * f.apex * s * (1 - s);
    return;
  }
  ball.z = 0;
}
