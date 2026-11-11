// A free player's mind (T816): he acts on the shape's inputs as they were a moment ago, his place
// follows the place he wants with a lag, and he moves to it at a speed that fits how far it is, so
// twenty outfield players do not start, run and stop as one. Everything here is read from
// positions, attributes and the clock: no random number, no seed (ARCH-5); it only presents beats
// already settled (ARCH-7). `world.ts` decides who is free; this module only computes.
import { PROTO_CONFIG } from '../core/config.ts';
import { clampToPitch } from '../core/pitch.ts';
import type { Phase, PlayerSpec, TeamId, Vec } from '../core/types.ts';
import { lineOf } from '../core/types.ts';
import type { StageState } from './world.ts';

/** The shape's inputs as one tick saw them. */
export interface Seen {
  ref: Vec;
  team: TeamId;
  phase: Phase;
}
/** Where a free player himself wants to be now: the wanted place, followed with his lag. */
export interface Mind {
  place: [number, number];
}

const OWN = PROTO_CONFIG.motion.own;
const TICK = PROTO_CONFIG.tick;

/**
 * The point the shapes read: the dead-ball scene's point, a flight's landing point (on the line
 * when the ball is going out, so nobody presses beyond it) or the ball.
 */
export function shapeRef(state: StageState): Vec {
  if (state.shapeBall) return state.shapeBall;
  const ball = state.ball;
  return ball.mode === 'flight' && ball.flight ? clampToPitch(ball.flight.to, 0) : ball.pos;
}

const isLine = (spec: PlayerSpec): boolean => lineOf(spec.position) === 'DF';

/** Seconds before player `spec`, `ballMetres` from the ball, acts on a change; the back line shares one. */
export function reactionDelay(spec: PlayerSpec, ballMetres: number): number {
  if (isLine(spec)) return OWN.delay.line;
  const d = OWN.delay;
  return (
    d.base +
    (d.perIq * (100 - spec.attrs.decisions)) / 100 +
    d.perMetre * Math.min(ballMetres, OWN.farCap)
  );
}

/** Time constant (s) his place follows the wanted place with; the back line shares one. */
export function placeLag(spec: PlayerSpec, ballMetres: number): number {
  if (isLine(spec)) return OWN.lag.line;
  return OWN.lag.base + OWN.lag.perMetre * Math.min(ballMetres, OWN.farCap);
}

/** Appends this tick's true inputs to `state.seen`, keeping `own.memory` seconds of them, newest last. */
export function remember(state: StageState): void {
  state.seen.push({ ref: shapeRef(state), team: state.team, phase: state.phase });
  const keep = Math.round(OWN.memory / TICK) + 1;
  if (state.seen.length > keep) state.seen.splice(0, state.seen.length - keep);
}

/** The inputs player `index` acts on: those of his delay ago, the oldest kept when there are fewer. */
export function seenBy(state: StageState, index: number, ballMetres: number): Seen {
  const back = Math.round(reactionDelay(state.fixture.players[index], ballMetres) / TICK);
  const seen = state.seen;
  return seen[Math.max(0, seen.length - 1 - back)];
}

/** One tick of his place following `want` with time constant `lag` seconds; mutates `mind`. */
export function followPlace(mind: Mind, want: Vec, lag: number): void {
  const k = 1 - Math.exp(-TICK / lag);
  mind.place = [
    mind.place[0] + (want[0] - mind.place[0]) * k,
    mind.place[1] + (want[1] - mind.place[1]) * k,
  ];
}

/**
 * His speed toward a place `d` metres away when he is `ballMetres` from the ball: still within
 * `own.hold`, else the distance over the seconds he gives himself (`own.arrive`, briskest at the
 * ball), at least `own.minSpeed` and at most `cap`.
 */
export function freeSpeed(d: number, ballMetres: number, cap: number): number {
  if (d <= OWN.hold) return 0;
  const a = OWN.arrive;
  const arriveIn = a.near + (a.far - a.near) * Math.min(1, ballMetres / a.farAt);
  return Math.min(cap, Math.max(OWN.minSpeed, d / arriveIn));
}
