/**
 * Who reaches a ball's path before it has passed (→MATCH-31, T441): the shared reach module a pass
 * reads for its lane and its interceptor, and deliveries and second balls after it. It imports
 * nothing from `resolve.ts`, so the resolutions can all read it. The defending side reads it too,
 * to shut the carrier's lanes (→MATCH-32, T442). Candidate model only: it reads the players'
 * velocities, and its distances are square roots of sums of squares, IEEE-754 basic operations that
 * give the same bits on every host (→ARCH-9).
 */
import { CELL_BASELINES } from './baselines';
import { GRID_BALL_CONFIG, GRID_MOVEMENT_CONFIG, readAt } from './movement';
import { attackFrame, cellOf, type Point } from './pitch';
import { speedOf } from './shape';
import { onPitch, other, type GridPlayer, type GridState } from './state';

/** Initial values (T441); T437 calibrates them. */
export const LANE_CONFIG = {
  /** Metres from the ball within which an opponent plays it. */
  reach: 1.2,
  /** Metres at full stretch: within them, and never within `reach`, he only gets a touch on it. */
  stretch: 2.2,
  /** Seconds to spare within `reach` from which a failed pass is his, cleanly; less is a deflection. */
  sure: 0.25,
  /**
   * The completion chance a pass loses per unit of its lane's summed weight (`laneWeight`). T441
   * set it where the candidate's completion holds its frame (calibration round 69, core, 120
   * matches: 77.32% before; 79.1% with no lane term, 74.8% at 0.08 and 77.43% at 0.033, the final
   * source).
   */
  risk: 0.033,
  /**
   * An opponent's weight in a lane: his seconds to spare against `full` (0 when he only just gets
   * there, 1 from `full` on), times `stretch` when he gets there only at full stretch.
   */
  weight: { full: 0.5, stretch: 0.5 },
  /** Metres between the points of the path scanned for an opponent's first reach. */
  step: 1,
  /** Halvings that place the first reach between two scanned points (to 1/32 of `step`). */
  refine: 5,
} as const;

/** Initial values (T442, →MATCH-32); T437 calibrates them. */
export const SHADOW_CONFIG = {
  /** Metres from the carrier within which a teammate is a nearby option (`dangerousOption`). */
  near: 25,
  /** Metres at most a presser's target moves toward the line to the option he shadows (`coverShadow`). */
  curve: 1.5,
  /**
   * A screen: a defending midfielder or defender whose shape place is within `reach` m of a lane
   * stands in it, at most `step` m from that place.
   */
  screen: { reach: 10, step: 6 },
} as const;

/** The threat `side` gains passing from `from` to `to` (engine frame): the xT of their cells. */
export function threatGain(
  side: 0 | 1,
  from: readonly [number, number],
  to: readonly [number, number],
): number {
  return (
    CELL_BASELINES[cellOf(attackFrame(side, to))]!.xT -
    CELL_BASELINES[cellOf(attackFrame(side, from))]!.xT
  );
}

/**
 * Whether `option`, a teammate of `side`'s `carrier`, is a nearby option that gains threat: on the
 * pitch, within `SHADOW_CONFIG.near` m of him and in a cell of higher xT (`threatGain`).
 */
export function nearbyThreat(
  side: 0 | 1,
  carrier: GridPlayer,
  option: GridPlayer,
): boolean {
  if (option === carrier || !onPitch(option)) return false;
  const dx = option.pos[0] - carrier.pos[0],
    dy = option.pos[1] - carrier.pos[1];
  return (
    Math.sqrt(dx * dx + dy * dy) <= SHADOW_CONFIG.near &&
    threatGain(side, carrier.pos, option.pos) > 0
  );
}

/**
 * The carrier's most dangerous nearby option (→MATCH-32): among `side`'s teammates of `carrier`
 * that are nearby options gaining threat (`nearbyThreat`), the one with the highest gain (equal
 * gains by player ID) whose path no opponent reaches as everyone stands (`reachOnPath`, kicked
 * now), or none.
 */
export function dangerousOption(
  s: GridState,
  side: 0 | 1,
  carrier: GridPlayer,
): GridPlayer | undefined {
  const options: { gp: GridPlayer; gain: number }[] = [];
  for (const gp of s.players[side])
    if (nearbyThreat(side, carrier, gp))
      options.push({ gp, gain: threatGain(side, carrier.pos, gp.pos) });
  options.sort((a, b) => b.gain - a.gain || (a.gp.player.id < b.gp.player.id ? -1 : 1));
  return options.find(({ gp }) => !reachOnPath(s, side, carrier.pos, gp.pos, 0).first)?.gp;
}

/**
 * The cover shadow (→MATCH-32): `point`, where a presser goes for `carrier`, moved by at most
 * `SHADOW_CONFIG.curve` m toward the point of the line from `carrier` to `option` that lies as far
 * from the carrier (never past the option), so the presser approaches between the carrier and that
 * option and keeps it behind him. Any frame the three points share.
 */
export function coverShadow(point: Point, carrier: Point, option: Point): [number, number] {
  const ox = option[0] - carrier[0],
    oy = option[1] - carrier[1];
  const length = Math.sqrt(ox * ox + oy * oy);
  if (length === 0) return [point[0], point[1]];
  const px = point[0] - carrier[0],
    py = point[1] - carrier[1];
  const r = Math.min(length, Math.sqrt(px * px + py * py));
  const sx = (ox / length) * r - px,
    sy = (oy / length) * r - py;
  const d = Math.sqrt(sx * sx + sy * sy);
  const k = d > SHADOW_CONFIG.curve ? SHADOW_CONFIG.curve / d : 1;
  return [point[0] + sx * k, point[1] + sy * k];
}

/** An opponent who reaches a ball's path before it has passed (engine frame, seconds from now). */
export interface LaneReach {
  gp: GridPlayer;
  /** The first point of the path he reaches: where the ball meets him. */
  at: [number, number];
  /** Metres along the path from where it is played to `at`. */
  along: number;
  /** When the ball gets to `at`: its kick plus its flight there. */
  ball: number;
  /** The most seconds he has in hand before the ball, anywhere on the path from `at` on. */
  spare: number;
  /** He gets within `LANE_CONFIG.stretch` of the path but never within `LANE_CONFIG.reach`. */
  stretch: boolean;
}

/** A path's reach: the opponent the ball meets first, if any, and every reaching opponent's summed weight. */
export interface PathReach {
  first?: LaneReach;
  weight: number;
}

/** An opponent's weight in a lane he reaches (`LANE_CONFIG.weight`). */
function laneWeight(reach: Pick<LaneReach, 'spare' | 'stretch'>): number {
  const W = LANE_CONFIG.weight;
  return Math.min(1, Math.max(0, reach.spare) / W.full) * (reach.stretch ? W.stretch : 1);
}

/**
 * Seconds to run `d` metres in a straight line from `u0` m/s toward it, accelerating at
 * `GRID_MOVEMENT_CONFIG.acceleration` up to `vmax`.
 */
function runSeconds(d: number, u0: number, vmax: number): number {
  if (d <= 0) return 0;
  const a = GRID_MOVEMENT_CONFIG.acceleration;
  const u = Math.min(Math.max(0, u0), vmax);
  const ramp = (vmax * vmax - u * u) / (2 * a);
  if (d <= ramp) return (Math.sqrt(u * u + 2 * a * d) - u) / a;
  return (vmax - u) / a + (d - ramp) / vmax;
}

/**
 * For each opponent of `side` on the pitch, the first point along the ball's path from `from` to
 * `to` (engine frame) he can get within `LANE_CONFIG.reach` of, or at full stretch within
 * `LANE_CONFIG.stretch` of, before the ball gets there, the ball kicked `kickAt` seconds from now
 * at `GRID_BALL_CONFIG.pass` speed. He starts from where he stands and how he moves now, keeps on
 * so until he reads the pass (T324's read, `readAt`: up to `GRID_MOVEMENT_CONFIG.read` times his
 * 위치선정 share of the wind-up before the kick), then runs straight there: his speed toward it
 * carried over, accelerating within the movement rules up to his top speed with fatigue
 * (`speedOf`). His reach times are closed-form (`runSeconds`), scanned only over the part of the
 * path he could get to at top speed. Returns the opponent the ball meets first and the summed
 * weights (`laneWeight`) of all who reach it.
 */
export function reachOnPath(
  s: GridState,
  side: 0 | 1,
  from: readonly [number, number],
  to: readonly [number, number],
  kickAt: number,
): PathReach {
  const L = LANE_CONFIG;
  const dx = to[0] - from[0],
    dy = to[1] - from[1];
  const length = Math.sqrt(dx * dx + dy * dy);
  const ux = length > 0 ? dx / length : 0,
    uy = length > 0 ? dy / length : 0;
  const speed = Math.min(GRID_BALL_CONFIG.pass, GRID_BALL_CONFIG.max);
  let first: LaneReach | undefined;
  let weight = 0;
  for (const gp of s.players[other(side)]) {
    if (!onPitch(gp)) continue;
    const react = kickAt > 0 ? readAt(s, gp, side, kickAt) : 0;
    const v = gp.vel ?? [0, 0];
    const vmax = speedOf(s, gp);
    // Where he is when he reads it, having kept on as he was moving.
    const px = gp.pos[0] + v[0] * react,
      py = gp.pos[1] + v[1] * react;
    const along = (px - from[0]) * ux + (py - from[1]) * uy;
    const off = (px - from[0]) * uy - (py - from[1]) * ux;
    // Running at top speed from the read on, the path he could be within stretch of before the
    // ball is where (a − along)² + off² ≤ (stretch + vmax·(kickAt − react + a/speed))²: one
    // interval of a, which bounds the scan.
    const k = vmax / speed;
    const r0 = L.stretch + vmax * (kickAt - react);
    const qa = 1 - k * k,
      qb = along + k * r0,
      qc = along * along + off * off - r0 * r0;
    const disc = qb * qb - qa * qc;
    if (qa <= 0 || disc < 0) continue;
    const root = Math.sqrt(disc);
    const lo = Math.max(0, (qb - root) / qa),
      hi = Math.min(length, (qb + root) / qa);
    if (lo > hi) continue;
    const m = RUN;
    m.fx = from[0];
    m.fy = from[1];
    m.ux = ux;
    m.uy = uy;
    m.speed = speed;
    m.start = kickAt - react;
    m.px = px;
    m.py = py;
    m.vx = v[0];
    m.vy = v[1];
    m.vmax = vmax;
    // Within reach of a point he is within stretch of it too, so his reach starts no earlier.
    const wide = firstReach(lo, hi, L.stretch);
    if (Number.isNaN(wide)) continue;
    const wideSpare = m.spare;
    const close = firstReach(wide, hi, L.reach);
    const stretch = Number.isNaN(close);
    const meets = stretch ? wide : close;
    const r: LaneReach = {
      gp,
      at: [from[0] + ux * meets, from[1] + uy * meets],
      along: meets,
      ball: kickAt + meets / speed,
      spare: stretch ? wideSpare : m.spare,
      stretch,
    };
    weight += laneWeight(r);
    if (!first || r.along < first.along) first = r;
  }
  return { first, weight };
}

/**
 * The runner `reachOnPath` scans, in one object so a scan allocates nothing: the ball's path from
 * (`fx`, `fy`) along (`ux`, `uy`) at `speed`, reaching a point `start` + its flight there after
 * he reads it; where he is then (`px`, `py`), his velocity (`vx`, `vy`) and his top speed.
 * `spare` holds `firstReach`'s second answer.
 */
const RUN = {
  fx: 0,
  fy: 0,
  ux: 0,
  uy: 0,
  speed: 1,
  start: 0,
  px: 0,
  py: 0,
  vx: 0,
  vy: 0,
  vmax: 1,
  spare: 0,
};

/** Seconds the runner (`RUN`) has in hand at `a` metres along the path, within `radius` of it. */
function margin(a: number, radius: number): number {
  const m = RUN;
  const qx = m.fx + m.ux * a - m.px,
    qy = m.fy + m.uy * a - m.py;
  const d = Math.sqrt(qx * qx + qy * qy);
  const toward = d > 0 ? (m.vx * qx + m.vy * qy) / d : 0;
  return m.start + a / m.speed - runSeconds(d - radius, toward, m.vmax);
}

/**
 * The first point between `lo` and `hi` metres along the runner's path where his `margin` within
 * `radius` is above zero, found on `LANE_CONFIG.step` and placed by halving (NaN when there is
 * none), with the most margin from there on in `RUN.spare`.
 */
function firstReach(lo: number, hi: number, radius: number): number {
  const L = LANE_CONFIG;
  const points = Math.max(1, Math.ceil((hi - lo) / L.step));
  let found = NaN;
  let spare = 0;
  let before = lo;
  for (let k = 0; k <= points; k++) {
    const a = k === points ? hi : lo + k * L.step;
    const m = margin(a, radius);
    if (!Number.isNaN(found)) spare = Math.max(spare, m);
    else if (m > 0) {
      spare = m;
      // Between the last point he missed and this one.
      let hit = a,
        miss = before;
      for (let i = 0; k > 0 && i < L.refine; i++) {
        const mid = (miss + hit) / 2;
        if (margin(mid, radius) > 0) hit = mid;
        else miss = mid;
      }
      found = hit;
    } else before = a;
  }
  RUN.spare = spare;
  return found;
}
