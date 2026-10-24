/**
 * Bounded movement on one match clock for the candidate match model (→MATCH-12, MATCH-17;
 * docs/MATCH-MODEL-CONTRACT.md "One match-time coordinate"): players accelerate, brake and turn
 * within limits up to their pace/fatigue speed, the ball flies at bounded speeds, and an action or a
 * restart lasts until its route is physically done. The pre-feature path keeps `moveAll`. Only the
 * candidate moves this way, so its distances and turns use the portable `hypot`, `cos` and `sin`
 * (→ARCH-9, T358): the same paths on every host.
 */
import { cos, hypot, sin } from '../portable-math';
import { defendSetPiece, restartPlaces, restartTaken } from './intentions';
import {
  attackFrame,
  BAND_EDGES,
  cellBand,
  cellLane,
  clamp,
  LANE_EDGES,
  PITCH,
  toEngine,
} from './pitch';
import type { Restart, RestartPreparer } from './restarts';
import { intentionTarget, SHAPE_CONFIG, speedOf, targetOf, type ShapeCache } from './shape';
import { kickOffPoint, onPitch, skill, type GridPlayer, type GridState } from './state';

/**
 * Player motion. Top speed is `speedOf` (pace and fatigue); these bound how it changes. Initial
 * values from the contract, to be measured (T278 may tune them against the unchanged targets).
 */
export const GRID_MOVEMENT_CONFIG = {
  /** m/s² speeding up and slowing down. */
  acceleration: 4,
  braking: 6,
  /** Degrees a moving player's heading turns per match second; a standing player faces any way. */
  turn: 180,
  /** Integration step, match seconds; reach times are whole steps. */
  step: 0.2,
  /** Metres within which a player has arrived and stops. */
  arrive: 0.05,
  /** Match seconds a reach estimate looks ahead before giving up. */
  horizon: 300,
  /**
   * Off the ball a player reacts to a kicked ball when it is kicked, not when the action starts
   * (T324); a defender reads it earlier by this many times his 위치선정 share of its wind-up, from
   * the start once that covers it (→MATCH-8/9: the defenders' positioning suppresses the chances a
   * ball in behind creates). T324 measured 1, every defender reading late, against the MATCH-2
   * curve: favourites won more (mean error 3.3 points against 2.8).
   */
  read: 3,
} as const;

/**
 * Ball speeds in metres per match second, never above `max`; a ball out of play is carried back to
 * its restart spot at `retrieval` and set down in `placement` seconds.
 */
export const GRID_BALL_CONFIG = {
  pass: 20,
  turnover: 20,
  restart: 18,
  shot: 30,
  max: 40,
  retrieval: 6,
  placement: 1.5,
} as const;

export type BallSpeed = Exclude<keyof typeof GRID_BALL_CONFIG, 'retrieval' | 'placement'>;

/**
 * The player on the ball between receiving it and playing it (→MATCH-12 r27, T426): he takes it in
 * stride at `speed` m/s, a fresh player of average pace's, scaled by pace and fatigue as his top
 * speed is (`strideSpeed`); with an opponent within `pressureRadius` metres of him he shields it on
 * the move, taking it away from that opponent at the same pace.
 */
export const IN_STRIDE_CONFIG = {
  speed: 3.5,
  pressureRadius: 3,
} as const;

/** The middle of the 1–99 attribute scale: the pace `IN_STRIDE_CONFIG.speed` is a stride of. */
const AVERAGE_PACE = 50;

/** A semantic point of the ball's route (engine frame, absolute elapsed match seconds). */
export interface MotionKnot {
  kind: 'retrieve' | 'place' | 'kick' | 'touch' | 'receive' | 'arrive' | 'carry' | 'tackle';
  at: number;
  ball: [number, number];
}

/** What moves: a position and, once moving, a velocity (m/s, engine frame). */
export interface Mover {
  pos: [number, number];
  vel?: [number, number];
}

const RAD = Math.PI / 180;
const FULL_TURN = GRID_MOVEMENT_CONFIG.turn * RAD * GRID_MOVEMENT_CONFIG.step;
const FULL_COS = cos(FULL_TURN);
const FULL_SIN = sin(FULL_TURN);

/**
 * One step of `h` seconds toward `target`: the heading turns at most `turn`·h, speed changes by at
 * most `acceleration`·h up or `braking`·h down, never past `vmax`, and the player slows so as to
 * stop on the target (he slows further while facing away from it).
 */
export function stepToward(m: Mover, target: readonly [number, number], vmax: number, h: number) {
  const C = GRID_MOVEMENT_CONFIG;
  const v = (m.vel ??= [0, 0]);
  // Standing on the point already: nothing to do.
  if (v[0] === 0 && v[1] === 0 && m.pos[0] === target[0] && m.pos[1] === target[1]) return;
  const dx = target[0] - m.pos[0],
    dy = target[1] - m.pos[1];
  const dist = hypot(dx, dy);
  const speed = hypot(v[0], v[1]);
  // Arrived: within reach of the point at a speed one whole step's braking stops.
  if (dist <= C.arrive && speed <= C.braking * C.step + 1e-9) {
    m.pos[0] = target[0];
    m.pos[1] = target[1];
    v[0] = v[1] = 0;
    return;
  }
  const ux = dist > 0 ? dx / dist : speed > 0 ? v[0] / speed : 1;
  const uy = dist > 0 ? dy / dist : speed > 0 ? v[1] / speed : 0;
  let hx = ux,
    hy = uy,
    aligned = true;
  if (speed > 1e-9) {
    const cx = v[0] / speed,
      cy = v[1] / speed;
    const full = h === C.step;
    const turn = full ? FULL_TURN : C.turn * RAD * h;
    const c = full ? FULL_COS : cos(turn);
    if (cx * ux + cy * uy < c) {
      aligned = false;
      const s = (cx * uy - cy * ux >= 0 ? 1 : -1) * (full ? FULL_SIN : sin(turn));
      hx = cx * c - cy * s;
      hy = cx * s + cy * c;
    }
  }
  const facing = aligned ? 1 : Math.max(0, hx * ux + hy * uy);
  // The fastest speed that braking step by step still stops within `dist`.
  const stop = C.braking * (Math.sqrt((h * h) / 4 + (2 * dist) / C.braking) - h / 2);
  const want = Math.min(vmax, stop) * facing;
  const next =
    want > speed
      ? Math.min(want, speed + C.acceleration * h)
      : Math.max(want, speed - C.braking * h);
  v[0] = hx * next;
  v[1] = hy * next;
  if (dist > 0 && aligned && next * h >= dist) {
    m.pos[0] = target[0];
    m.pos[1] = target[1];
    return;
  }
  m.pos[0] = clamp(m.pos[0] + v[0] * h, 0, PITCH.length);
  m.pos[1] = clamp(m.pos[1] + v[1] * h, 0, PITCH.width);
}

/** On the point and slow enough that the next step stops him there. */
const at = (m: Mover, p: readonly [number, number]) =>
  m.pos[0] === p[0] &&
  m.pos[1] === p[1] &&
  hypot(m.vel?.[0] ?? 0, m.vel?.[1] ?? 0) <=
    GRID_MOVEMENT_CONFIG.braking * GRID_MOVEMENT_CONFIG.step + 1e-9;

/**
 * Match seconds, in whole steps, `m` needs to stand on `target` from where and how he moves now
 * (a running player brakes and comes back); a dry run of `stepToward`, so `advance` gets him there
 * in exactly that time and he stays.
 */
export function reachSeconds(m: Mover, point: readonly [number, number], vmax: number): number {
  const C = GRID_MOVEMENT_CONFIG;
  const target = inside(point);
  if (at(m, target)) return 0;
  const probe: Mover = {
    pos: [m.pos[0], m.pos[1]],
    vel: m.vel ? [m.vel[0], m.vel[1]] : [0, 0],
  };
  let steps = 0;
  while (!at(probe, target) && steps * C.step < C.horizon) {
    stepToward(probe, target, vmax, C.step);
    steps++;
  }
  return steps * C.step;
}

/** Seconds a ball takes from `from` to `to` at a kind's speed, capped at `max`. */
export function flightSeconds(
  from: readonly [number, number],
  to: readonly [number, number],
  speed: BallSpeed,
): number {
  const v = Math.min(GRID_BALL_CONFIG[speed], GRID_BALL_CONFIG.max);
  return hypot(to[0] - from[0], to[1] - from[1]) / v;
}

/**
 * A player sent to `to`, or to his shape target when absent; `holdUntil` keeps him where he stands
 * for that many seconds first (the player on the ball until he plays it). `before` sends him on to
 * the point he was heading for before the action until `readAt` seconds, when he reads the kick
 * and turns to `to` (→MATCH-17: off the ball a player reacts to the ball once it is played, not to
 * where it will land).
 */
export interface Move {
  gp: GridPlayer;
  to?: readonly [number, number];
  holdUntil?: number;
  before?: readonly [number, number];
  readAt?: number;
}

/** A player a restart needs on a spot: its taker or one of its scene. */
export type Placement = Required<Pick<Move, 'gp' | 'to'>>;

/** A point on the pitch: players never leave it, so neither do the points they run to. */
const inside = (p: readonly [number, number]): [number, number] => [
  clamp(p[0], 0, PITCH.length),
  clamp(p[1], 0, PITCH.width),
];

/**
 * Moves every player on the pitch for `dt` match seconds in whole steps: the planned ones toward
 * their points, everyone else toward his shape target (→MATCH-17). Targets and top speeds are read
 * once at the start, before anyone moves.
 */
export function advance(s: GridState, dt: number, plan: readonly Move[] = []): void {
  const C = GRID_MOVEMENT_CONFIG;
  const cache: ShapeCache = { offside: [], pressers: [], defence: [] };
  // Each side's planned moves by roster index; a player planned twice takes his last move.
  const planned: [(Move | undefined)[], (Move | undefined)[]] = [[], []];
  for (const m of plan) planned[m.gp.side][m.gp.idx] = m;
  const movers: {
    gp: GridPlayer;
    to: readonly [number, number];
    vmax: number;
    holdUntil: number;
    hold: readonly [number, number];
  }[] = [];
  for (const side of [0, 1] as const)
    for (const gp of s.players[side]) {
      if (!onPitch(gp)) continue;
      const p = planned[side][gp.idx];
      const before = p?.before && (p.readAt ?? 0) > 0;
      movers.push({
        gp,
        to: inside(p?.to ?? targetOf(s, side, gp.idx, cache)),
        vmax: speedOf(s, gp),
        holdUntil: before ? p.readAt! : (p?.holdUntil ?? 0),
        hold: before ? inside(p.before!) : [gp.pos[0], gp.pos[1]],
      });
    }
  const whole = Math.floor(dt / C.step + 1e-9);
  const rest = dt - whole * C.step;
  for (let i = 0; i <= whole; i++) {
    const h = i < whole ? C.step : rest;
    if (h <= 1e-9) break;
    const t = i * C.step;
    for (let k = 0; k < movers.length; k++) {
      const m = movers[k]!;
      stepToward(m.gp, t + 1e-9 < m.holdUntil ? m.hold : m.to, m.vmax, h);
    }
  }
}

/** His in-stride pace (→MATCH-12 r27): `IN_STRIDE_CONFIG.speed` scaled as his top speed (`speedOf`). */
export function strideSpeed(s: GridState, gp: GridPlayer): number {
  const { base, pace } = SHAPE_CONFIG.speed;
  return (IN_STRIDE_CONFIG.speed * speedOf(s, gp)) / (base + (pace * AVERAGE_PACE) / 99);
}

/** The nearest opponent within `IN_STRIDE_CONFIG.pressureRadius` of him, who makes him shield it. */
export function presserOf(s: GridState, gp: GridPlayer): GridPlayer | undefined {
  let near: GridPlayer | undefined,
    best: number = IN_STRIDE_CONFIG.pressureRadius;
  for (const o of s.players[gp.side === 0 ? 1 : 0]) {
    if (!onPitch(o)) continue;
    const d = s.math.hypot(o.pos[0] - gp.pos[0], o.pos[1] - gp.pos[1]);
    if (d <= best) [near, best] = [o, d];
  }
  return near;
}

/**
 * The player on the ball takes it in stride for `seconds` (whole steps) of the match before he
 * plays it (→MATCH-12 r27, T426), at his stride pace (`strideSpeed`) within the movement rules and
 * the pitch and, given `cell` (his side's attack-frame cell), never out of that cell: along his
 * heading blended evenly with the direction to `aim`, or, with an opponent close (`presserOf`),
 * shielding it on the move away from him. He keeps running through it, so he is still in stride
 * when he plays it. Everyone else moves meanwhile on his intention: a target that follows another
 * player (a presser, a marker, a cover) is read again every step, so they track the carrier and
 * the men they mark; the rest are read once, as `advance` reads them. Moves everyone and the ball
 * with him; the caller runs the clock.
 */
export function carryInStride(
  s: GridState,
  gp: GridPlayer,
  aim: readonly [number, number],
  seconds: number,
  cell?: number,
): void {
  const C = GRID_MOVEMENT_CONFIG;
  const vmax = strideSpeed(s, gp);
  const speed = s.math.hypot(gp.vel?.[0] ?? 0, gp.vel?.[1] ?? 0);
  const [dx, dy] = strideHeading(s, gp, aim);
  // A point past where his stride takes him, by its braking distance.
  const top = Math.max(vmax, speed);
  const reach = top * seconds + (top * top) / (2 * C.braking);
  const bounds = cell === undefined ? undefined : cellBounds(cell);
  /** Puts `p` back inside the cell on each axis it left; the attack frame mirrors each axis alone. */
  const keep = (p: [number, number], stop?: [number, number]) => {
    if (!bounds) return;
    const q = attackFrame(gp.side, p);
    const kept = [clamp(q[0], bounds[0], bounds[1]), clamp(q[1], bounds[2], bounds[3])] as const;
    const back = toEngine(gp.side, kept);
    for (const i of [0, 1] as const)
      if (kept[i] !== q[i]) {
        p[i] = back[i];
        // Stopped at the cell's edge on that axis.
        if (stop) stop[i] = 0;
      }
  };
  const point = inside([gp.pos[0] + dx * reach, gp.pos[1] + dy * reach]);
  keep(point);
  const cache: ShapeCache = { offside: [], pressers: [], defence: [] };
  const others: { gp: GridPlayer; to: readonly [number, number]; vmax: number }[] = [];
  for (const side of [0, 1] as const)
    for (const o of s.players[side])
      if (o !== gp && onPitch(o))
        others.push({ gp: o, to: inside(targetOf(s, side, o.idx, cache)), vmax: speedOf(s, o) });
  const steps = Math.round(seconds / C.step);
  for (let i = 0; i < steps; i++) {
    stepToward(gp, point, vmax, C.step);
    keep(gp.pos, gp.vel);
    s.ball = [gp.pos[0], gp.pos[1]];
    for (const m of others)
      stepToward(m.gp, m.gp.intention ? inside(intentionTarget(s, m.gp)) : m.to, m.vmax, C.step);
  }
}

/**
 * Which way the player on the ball takes it in stride (a unit vector): straight away from the
 * opponent close to him (`presserOf`), else his heading blended evenly with the direction to `aim`
 * — toward it when he stands or runs straight away from it.
 */
function strideHeading(
  s: GridState,
  gp: GridPlayer,
  aim: readonly [number, number],
): [number, number] {
  const { hypot } = s.math;
  const unit = (x: number, y: number): [number, number] => {
    const n = hypot(x, y);
    return n > 1e-9 ? [x / n, y / n] : [0, 0];
  };
  const presser = presserOf(s, gp);
  if (presser) {
    const away = unit(gp.pos[0] - presser.pos[0], gp.pos[1] - presser.pos[1]);
    if (away[0] !== 0 || away[1] !== 0) return away;
  }
  const to = unit(aim[0] - gp.pos[0], aim[1] - gp.pos[1]);
  const run = unit(gp.vel?.[0] ?? 0, gp.vel?.[1] ?? 0);
  const blended = unit(to[0] + run[0], to[1] + run[1]);
  return blended[0] !== 0 || blended[1] !== 0 ? blended : to;
}

/** An attack-frame cell as `[x0, x1, y0, y1]`; a cell holds its near edges, so its far ones are kept just inside. */
function cellBounds(cell: number): [number, number, number, number] {
  const band = cellBand(cell),
    lane = cellLane(cell);
  const edge = 1e-6;
  return [
    BAND_EDGES[band]!,
    BAND_EDGES[band + 1]! - edge,
    LANE_EDGES[lane]!,
    LANE_EDGES[lane + 1]! - edge,
  ];
}

/**
 * When an off-ball player turns from where he was heading to a ball kicked `kick` seconds into the
 * action by `attacking`: a teammate at the kick, a defender up to `read` of the wind-up earlier by
 * his 위치선정.
 */
export function readAt(s: GridState, gp: GridPlayer, attacking: 0 | 1, kick: number): number {
  if (gp.side === attacking) return kick;
  const positioning = clamp(skill(s, gp.side, gp.idx, 'positioning'), 1, 99) / 99;
  return Math.max(0, kick * (1 - GRID_MOVEMENT_CONFIG.read * positioning));
}

/**
 * Where every player on the pitch is heading now (engine frame): his intention's or his shape's
 * target, read before an action changes the state so `before` can keep him on it until the kick.
 */
export function heading(s: GridState): Map<GridPlayer, [number, number]> {
  const cache: ShapeCache = { offside: [], pressers: [], defence: [] };
  const out = new Map<GridPlayer, [number, number]>();
  for (const side of [0, 1] as const)
    for (const gp of s.players[side])
      if (onPitch(gp)) out.set(gp, inside(targetOf(s, side, gp.idx, cache)));
  return out;
}

/** Where a substitute waits to come on: the halfway line on his side's touchline. */
export const benchPoint = (side: 0 | 1): [number, number] => [
  PITCH.length / 2,
  side === 0 ? 0 : PITCH.width,
];

/**
 * Prepares a restart on the clock (→MATCH-12, MATCH-18): the ball is carried from `rest`, where it
 * went dead, to the spot and set down while the taker walks there and `scene` takes its places;
 * everyone else moves to his shape. Its dead time is the nominal one or, when longer, what that
 * takes, never both. Advances the clock, hands the taker the ball on the spot, sets `rs.dead` to
 * the time used and returns the retrieval and placement knots.
 */
export function prepareRestart(
  s: GridState,
  rs: Restart,
  taker: number,
  rest: readonly [number, number],
  scene: readonly Placement[] = [],
): MotionKnot[] {
  const B = GRID_BALL_CONFIG;
  const start = s.elapsed;
  const gp = s.players[rs.side][taker]!;
  const spot: [number, number] = [rs.spot[0], rs.spot[1]];
  const carried = hypot(spot[0] - rest[0], spot[1] - rest[1]);
  const placed = carried / B.retrieval + B.placement;
  const plan = [{ gp, to: spot }, ...scene.filter((m) => m.gp !== gp)];
  let seconds = Math.max(rs.dead, placed);
  for (const m of plan) seconds = Math.max(seconds, reachSeconds(m.gp, m.to, speedOf(s, m.gp)));
  s.ball = spot;
  s.possession = rs.side;
  s.owner = [rs.side, taker];
  advance(s, seconds, plan);
  s.t += seconds;
  s.elapsed += seconds;
  gp.pos = [spot[0], spot[1]];
  gp.vel = [0, 0];
  rs.dead = seconds;
  return [
    { kind: 'retrieve', at: start, ball: [rest[0], rest[1]] },
    { kind: 'place', at: start + placed, ball: spot },
  ];
}

/**
 * The candidate model's `RestartPreparer` for a ball that went dead at `rest` (→MATCH-12,
 * MATCH-17, MATCH-18): the taker and the restart's scene (a delivery's, or every player's kick-off
 * spot after a goal) commit to their places and walk there on the clock (`prepareRestart`), whose
 * retrieval and placement knots go to `out.knots`. At the kick the places are reached; for the
 * second ball the players who went up hold their box spots and the defenders keep their marks,
 * zones and goal for as long (`defendSetPiece`, T348). `kick` sees the state at the kick, before
 * the places end (an observed match's `Tracer.kick`, T359); it only reads, so it changes no play.
 */
export function prepareOnClock(
  rest: readonly [number, number],
  out: { knots: MotionKnot[] },
  kick?: (s: GridState) => void,
): RestartPreparer {
  return (s, restart, taker, scene) => {
    const moves: Placement[] = scene ? [...scene.up, ...scene.marks] : [];
    if (restart.kind === 'kickoff')
      for (const sd of [0, 1] as const)
        for (const gp of s.players[sd])
          if (onPitch(gp) && gp.slot >= 0)
            moves.push({ gp, to: kickOffPoint(s.setup, sd, gp.slot) });
    const gp = s.players[restart.side][taker]!;
    restartPlaces(s, [{ gp, to: restart.spot }, ...moves.filter((m) => m.gp !== gp)]);
    out.knots = prepareRestart(s, restart, taker, rest, moves);
    kick?.(s);
    const until = s.elapsed + SHAPE_CONFIG.setPiece.stay;
    restartTaken(s, scene?.up ?? [], until);
    if (scene) defendSetPiece(s, scene, until);
  };
}
