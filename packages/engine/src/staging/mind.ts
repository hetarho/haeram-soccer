import { PORTABLE_MATH } from '../portable-math';
// A free player's mind (T816): he acts on the shape's inputs as they were a moment ago, his place
// follows the place he wants with a lag, and he moves to it at a speed that fits how far it is, so
// twenty outfield players do not start, run and stop as one. Everything here is read from
// positions, attributes and the clock: no random number, no seed (ARCH-5); it only presents beats
// already settled (ARCH-7). `world.ts` decides who is free; this module only computes. T817: what
// kind of turnover it was shapes them for `motion.turn.window` seconds — a settled one is believed
// later the farther a player is from the ball and the shape re-forms slowly; after a counter
// everyone turns at once and runs.
import { STAGING_CONFIG } from './config';
import { disciplineScale } from './tendency';
import { clampToPitch } from './pitch';
import type { Phase, PlayerSpec, TeamId, Vec } from './types';
import { lineOf } from './types';
import type { StageState } from './world';

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

const OWN = STAGING_CONFIG.motion.own;
const TURN = STAGING_CONFIG.motion.turn;

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
    (d.perAnticipation * (100 - spec.attrs.anticipation)) / 100 +
    d.perMetre * Math.min(ballMetres, OWN.farCap)
  );
}

/** The kind of turnover a free player moves under: the last change of sides while `motion.turn.window` lasts. */
export interface Turn {
  counter: boolean;
}

/** The turnover shaping free players now: the last one while `motion.turn.window` seconds have not passed. */
export function turnOf(state: StageState): Turn | undefined {
  const turn = state.turn;
  if (!turn || state.t - turn.at >= TURN.window) return undefined;
  return { counter: turn.counter };
}

/**
 * Time constant (s) his place follows the wanted place with; the back line shares one. Inside a
 * settled turnover's window it is at least `turn.lag.settled`, inside a counter's at most
 * `turn.lag.counter`; a man marking (`marking`) uses at most `shape.mark.lag` whatever the window.
 * Discipline scales that lag; defenders share their line's mean discipline.
 */
export function placeLag(
  spec: PlayerSpec,
  ballMetres: number,
  turn?: Turn,
  marking = false,
  lineDiscipline = spec.discipline,
): number {
  if (isLine(spec)) return OWN.lag.line * disciplineScale(lineDiscipline);
  let lag = OWN.lag.base + OWN.lag.perMetre * Math.min(ballMetres, OWN.farCap);
  if (turn) lag = turn.counter ? Math.min(lag, TURN.lag.counter) : Math.max(lag, TURN.lag.settled);
  return (
    (marking ? Math.min(lag, STAGING_CONFIG.shape.mark.lag) : lag) *
    disciplineScale(spec.discipline)
  );
}

/** Appends this tick's true inputs to `state.seen`, keeping `own.memory` seconds of them, newest last. */
export function remember(state: StageState): void {
  state.seen.push({ ref: shapeRef(state), team: state.team, phase: state.phase });
  const keep = Math.round(OWN.memory / STAGING_CONFIG.tick) + 1;
  if (state.seen.length > keep) state.seen.splice(0, state.seen.length - keep);
}

/**
 * The inputs player `index` acts on: the point of his delay ago and the side and phase of
 * `turn.delayPerMetre` seconds a metre earlier still while a settled turnover's window lasts (the
 * back line excepted), each the oldest kept when there are fewer.
 */
export function seenBy(state: StageState, index: number, ballMetres: number): Seen {
  const spec = state.fixture.players[index];
  const back = Math.round(reactionDelay(spec, ballMetres) / STAGING_CONFIG.tick);
  const turn = turnOf(state);
  const extra =
    turn && !turn.counter && !isLine(spec)
      ? TURN.delayPerMetre * Math.min(ballMetres, OWN.farCap)
      : 0;
  const backSide = Math.round((reactionDelay(spec, ballMetres) + extra) / STAGING_CONFIG.tick);
  const seen = state.seen;
  const at = seen[Math.max(0, seen.length - 1 - back)];
  if (backSide === back) return at;
  const side = seen[Math.max(0, seen.length - 1 - backSide)];
  return { ref: at.ref, team: side.team, phase: side.phase };
}

/** One tick of his place following `want` with time constant `lag` seconds; mutates `mind`. */
export function followPlace(mind: Mind, want: Vec, lag: number): void {
  const k = 1 - PORTABLE_MATH.exp(-STAGING_CONFIG.tick / lag);
  mind.place = [
    mind.place[0] + (want[0] - mind.place[0]) * k,
    mind.place[1] + (want[1] - mind.place[1]) * k,
  ];
}

/**
 * His speed toward a place `d` metres away when he is `ballMetres` from the ball: still within
 * `own.hold` scaled by discipline (a disciplined player settles closer), else the distance over
 * the seconds he gives himself (`own.arrive`, briskest at the
 * ball), at least `own.minSpeed` and at most `cap`. Inside a counter's window a place farther than
 * `turn.runBeyond` is gone to at `cap` (the caller passes the sprint beyond `turn.sprintBeyond`).
 */
export function freeSpeed(
  d: number,
  ballMetres: number,
  cap: number,
  turn?: Turn,
  discipline = 50,
): number {
  if (d <= OWN.hold * disciplineScale(discipline)) return 0;
  if (turn?.counter && d > TURN.runBeyond) return cap;
  const a = OWN.arrive;
  const arriveIn = a.near + (a.far - a.near) * Math.min(1, ballMetres / a.farAt);
  return Math.min(cap, Math.max(OWN.minSpeed, d / arriveIn));
}
