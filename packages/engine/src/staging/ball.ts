// The ball on the stage: held at its owner's feet, in flight along a quadratic curve (a lofted ball
// on a parabola above it), or lying still while loose or dead. The named motion stream alone
// shapes its curve and height; every departure and destination remains the handler's.
import { STAGING_CONFIG } from './config';
import type { Vec } from './types';
import { approach, clamp, dist, lerp } from './vec';
import type { Flight, StageState } from './world';

const BALL = STAGING_CONFIG.ball;

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
    control: flightControl(state, from, to),
    to: [to[0], to[1]],
    t0: state.t,
    t1: state.t + flightTime(from, to, speed),
    apex: Math.min(BALL.loftMax, apexFor(d, loft) * loftVariation(state)),
  };
  state.ball.mode = 'flight';
  state.ball.owner = -1;
  state.ball.flight = flight;
  return flight;
}

/** Kicks the ball from where it is now to `to` in `seconds`, rising to `apex`; nobody owns it. */
export function startFlightTimed(
  state: StageState,
  to: Vec,
  seconds: number,
  apex: number,
): Flight {
  const flight: Flight = {
    from: [state.ball.pos[0], state.ball.pos[1]],
    control: flightControl(state, state.ball.pos, to),
    to: [to[0], to[1]],
    t0: state.t,
    t1: state.t + Math.max(0, seconds),
    apex: Math.min(BALL.loftMax, apex * loftVariation(state)),
  };
  state.ball.mode = 'flight';
  state.ball.owner = -1;
  state.ball.flight = flight;
  return flight;
}

/** The apex `startFlight` gives a kick over `d` metres. */
export function apexFor(d: number, loft: boolean): number {
  return loft ? clamp(d * BALL.loftPerMetre, BALL.loftMin, BALL.loftMax) : 0;
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
    const p = lerp(lerp(f.from, f.control, s), lerp(f.control, f.to, s), s);
    ball.pos = [p[0], p[1]];
    ball.z = 4 * f.apex * s * (1 - s);
    return;
  }
  if (ball.mode === 'dead' && state.retrieve) {
    const p = approach(ball.pos, state.retrieve, BALL.retrieval * STAGING_CONFIG.tick);
    ball.pos = [p[0], p[1]];
  }
  ball.z = 0;
}

/** The midpoint bends sideways in proportion to distance; its endpoints never move. */
function flightControl(state: StageState, from: Vec, to: Vec): Vec {
  const [low, high] = BALL.curve.bend;
  const sign = state.motion() < 0.5 ? -1 : 1;
  const bend = sign * (low + (high - low) * state.motion());
  const midpoint = (k: number): Vec => [
    (from[0] + to[0]) / 2 - k * (to[1] - from[1]),
    (from[1] + to[1]) / 2 + k * (to[0] - from[0]),
  ];
  const control = midpoint(bend);
  // As in the existing match flight, curl back into the pitch near the touchlines.
  const y = (from[1] + 2 * control[1] + to[1]) / 4;
  return y < 0 || y > 68 ? midpoint(-bend) : control;
}
function loftVariation(state: StageState): number {
  const [low, high] = BALL.curve.loftVariation;
  return low + (high - low) * state.motion();
}
