/**
 * The box scene of open play on the candidate model (→MATCH-33, MATCH-34, T443;
 * docs/MATCH-ENGINE-DESIGN.md §4.8). With the ball wide in the final third or in a cut-back zone
 * (MATCH-14), the attack occupies the box's zones with runs timed to the delivery and the defence
 * protects the same zones goal-side. The zones are points in the attacking side's frame, named by
 * the ball's side of the goal, so T444 can aim deliveries at them and T445 can drop second balls
 * near them. Everything here reads the state and changes nothing: `coordination.ts` gives out the
 * jobs, `intentions.ts` keeps and ends them, `shape.ts` moves the players.
 */
import type { Position, RoleId } from '../../../contracts/src/player';
import { lineOf } from '../player';
import { byId, COORDINATION_CONFIG, gap } from './coordination';
import { attackFrame, BAND_EDGES, clamp, laneOf, PITCH, toEngine } from './pitch';
import type { Point } from './pitch';
import { BOX_ROLES, SHAPE_CONFIG } from './shape';
import { SPOTS } from './spots';
import { onPitch, other, slotOf, type GridPlayer, type GridState } from './state';

/** The zones the attack occupies, in the order a tie between equal distances takes them. */
export const BOX_ZONES = ['nearPost', 'farPost', 'spot', 'edge'] as const;
export type BoxZone = (typeof BOX_ZONES)[number];
/** What a defender guards: one of the zones, or the middle of the goal between the posts' zones. */
export type BoxGuard = BoxZone | 'middle';
/** The ball's side of the goal in the attacking side's frame: −1 its left (low y), 1 its right. */
export type BallSide = -1 | 1;

/**
 * A box-scene job an intention carries (T443): the zone a runner attacks or a defender guards, and
 * the ball's side it was named for. Replaced, never changed in place, since traces keep it.
 */
export interface BoxJob {
  readonly zone: BoxGuard;
  readonly ball: BallSide;
}

/** Initial values for the candidate model; T437 calibrates them against the unchanged targets. */
export const BOX_CONFIG = {
  /** The scene is on with the ball in a wide lane from this many metres (the attack frame) up. */
  wideFrom: 70,
  /** Half the goal's width (7.32 m): how far a post stands from the goal's middle. */
  post: 3.66,
  /**
   * The zones, in metres from the goal line (`out`) and across from the posts: the near post 3 m
   * inside the near post, the far post 1 m beyond the far post, the penalty spot and the edge of
   * the box (아크 정면) on the goal's middle.
   */
  zones: {
    nearPost: { out: 3.5, inside: 3 },
    farPost: { out: 3, beyond: 1 },
    spot: { out: 11 },
    edge: { out: 19 },
  },
  /** A runner waits this many metres short of his zone (toward halfway) until a delivery is decided. */
  load: 4,
  /** An attacker further than this many metres from a zone cannot arrive in time and is not sent. */
  reach: 30,
  /** Seconds a box-scene job holds at most; one still called for is given again at once. */
  seconds: 8,
  /** Roles that arrive in the box besides `SHAPE_CONFIG`'s box-run roles (→PLAYER-5). */
  roles: ['shadowStriker', 'attackingMidfielder'] as readonly RoleId[],
  defend: {
    /**
     * Metres from its goal the defending back line drops to: the deeper end with the ball on the
     * byline, the shallower with it `wideFrom` up, linear between.
     */
    line: [5.5, 11] as readonly [number, number],
    /** The share of its distance from the centre line a back-line player keeps as it narrows. */
    narrow: 0.6,
  },
} as const;

const B = BOX_CONFIG;
const CENTRE = PITCH.width / 2;

/** The wing positions on each side of the attack frame, for the far-side winger. */
const WINGERS: Record<BallSide, readonly Position[]> = { [-1]: ['RW', 'RM'], 1: ['LW', 'LM'] };
/** The full-backs and wing-backs on each side of the defending frame, for the far post. */
const FULL_BACKS: Record<BallSide, readonly Position[]> = { [-1]: ['LB', 'LWB'], 1: ['RB', 'RWB'] };

/** The zones for a ball on `ball`'s side of the goal, in the attacking side's frame. */
export function boxZones(ball: BallSide): Record<BoxZone, Point> {
  const Z = B.zones;
  const near = CENTRE + ball * (B.post - Z.nearPost.inside);
  const far = CENTRE - ball * (B.post + Z.farPost.beyond);
  return {
    nearPost: [PITCH.length - Z.nearPost.out, near],
    farPost: [PITCH.length - Z.farPost.out, far],
    spot: [PITCH.length - Z.spot.out, CENTRE],
    edge: [PITCH.length - Z.edge.out, CENTRE],
  };
}

/**
 * Whether a set piece's jobs hold (→MATCH-18, §4.7): a restart being prepared, a box spot held
 * for its second ball, or a defender's set-piece mark or guard. Its defence stays §4.7's, so the
 * open-play scene waits.
 */
function setPieceHeld(s: GridState): boolean {
  for (const roster of s.players)
    for (const gp of roster) {
      const i = gp.intention;
      if (!i || !onPitch(gp)) continue;
      if (i.priority === 'restart') return true;
      if (i.priority !== 'committed' || i.box) continue;
      if (i.kind === 'mark' || (i.kind === 'cover' && i.zone) || i.kind === 'run') return true;
    }
  return false;
}

/**
 * The ball's side of the goal while `side`'s box scene is on, else undefined: the candidate
 * model, `side` on the ball in open play, the ball (its attack frame) in a wide lane from
 * `wideFrom` up or in a cut-back zone (the half-space cells of the goal-area band, MATCH-14).
 */
export function boxSide(s: GridState, side: 0 | 1): BallSide | undefined {
  if (s.setup.model === undefined || s.possession !== side || s.owner?.[0] !== side) return;
  const [x, y] = attackFrame(side, s.ball);
  const lane = laneOf(y);
  const wide = (lane === 0 || lane === 4) && x >= B.wideFrom;
  const cutBack = (lane === 1 || lane === 3) && x >= BAND_EDGES[7];
  if (!wide && !cutBack) return;
  if (setPieceHeld(s)) return;
  return y < CENTRE ? -1 : 1;
}

/**
 * Whether a box-scene job of `attacking`'s attack, named for `ball`, still holds: `attacking` keeps
 * the ball in its final third (the scene's area, from `wideFrom` up) and, while the scene is on,
 * the ball is still on that side of the goal. It releases when the ball leaves the area or is
 * cleared (a turnover).
 */
export function boxHeld(s: GridState, attacking: 0 | 1, ball: BallSide): boolean {
  if (s.possession !== attacking) return false;
  if (attackFrame(attacking, s.ball)[0] < B.wideFrom) return false;
  const now = boxSide(s, attacking);
  return now === undefined || now === ball;
}

/** A side's box scene now: the ball's side of the goal, its zones and who attacks each. */
export interface BoxScene {
  /** The attacking side. */
  side: 0 | 1;
  ball: BallSide;
  /** Each zone, in the attacking side's frame. */
  zones: Record<BoxZone, Point>;
  /** Who attacks each zone (roster index): the runner already on it, else the attacker picked now. */
  runners: Partial<Record<BoxZone, number>>;
}

/** Whether his role makes box runs (→PLAYER-5): `SHAPE_CONFIG`'s box-run roles and `BOX_CONFIG.roles`. */
const boxRole = (role: RoleId) =>
  BOX_ROLES.includes(role) ||
  SHAPE_CONFIG.candidate.boxRun.extra.includes(role) ||
  B.roles.includes(role);

/**
 * `side`'s box scene (→MATCH-33), or undefined while it is off (`boxSide`). Each zone gets at most
 * one attacker: one already on its run keeps it, and the free zones go nearest suitable pair
 * first, ties by player ID. The forwards take the near and the far post; a midfielder whose role
 * makes box runs or the far-side winger takes the penalty spot or a post left free; another
 * midfielder takes the edge. Never the carrier, the rest defence (`COORDINATION_CONFIG.rest`), a
 * man `claimed` for another job, one holding anything but a tactical run, or one further than
 * `reach` m from the zone.
 */
export function boxScene(
  s: GridState,
  side: 0 | 1,
  claimed?: ReadonlySet<GridPlayer>,
): BoxScene | undefined {
  const ball = boxSide(s, side);
  if (ball === undefined) return undefined;
  const zones = boxZones(ball);
  const runners: Partial<Record<BoxZone, number>> = {};
  const roster = s.players[side];
  for (const gp of [...roster].sort(byId)) {
    const job = gp.intention?.kind === 'run' ? gp.intention.box : undefined;
    if (!job || job.ball !== ball || !onPitch(gp) || job.zone === 'middle') continue;
    runners[job.zone] ??= gp.idx;
  }
  const taken = new Set(Object.values(runners));
  const pool = roster.filter((gp) => {
    if (!onPitch(gp) || gp.slot <= 0 || taken.has(gp.idx) || claimed?.has(gp)) return false;
    if (s.owner?.[0] === side && s.owner[1] === gp.idx) return false;
    if (COORDINATION_CONFIG.rest.includes(slotOf(s, gp).position)) return false;
    const i = gp.intention;
    return !i || (i.kind === 'run' && i.priority === 'tactical');
  });
  const pairUp = (wanted: readonly BoxZone[], who: (gp: GridPlayer) => boolean) => {
    const pairs: { zone: BoxZone; gp: GridPlayer; d: number }[] = [];
    for (const zone of wanted) {
      if (runners[zone] !== undefined) continue;
      for (const gp of pool) {
        if (taken.has(gp.idx) || !who(gp)) continue;
        const d = gap(attackFrame(side, gp.pos), zones[zone]);
        if (d <= B.reach) pairs.push({ zone, gp, d });
      }
    }
    pairs.sort(
      (a, b) =>
        a.d - b.d || byId(a.gp, b.gp) || BOX_ZONES.indexOf(a.zone) - BOX_ZONES.indexOf(b.zone),
    );
    for (const { zone, gp } of pairs) {
      if (runners[zone] !== undefined || taken.has(gp.idx)) continue;
      runners[zone] = gp.idx;
      taken.add(gp.idx);
    }
  };
  const line = (gp: GridPlayer) => lineOf(slotOf(s, gp).position);
  pairUp(['nearPost', 'farPost'], (gp) => line(gp) === 'FW');
  pairUp(
    ['spot', 'nearPost', 'farPost'],
    (gp) =>
      (line(gp) === 'MF' && boxRole(slotOf(s, gp).role)) ||
      WINGERS[ball].includes(slotOf(s, gp).position),
  );
  pairUp(['edge'], (gp) => line(gp) === 'MF');
  return { side, ball, zones, runners };
}

/**
 * Where `side`'s runner of `zone` heads (engine frame): his load point `load` m short of it
 * toward halfway, or, once a cross or cut-back is decided, the zone itself (`attack`).
 */
export function boxRunPoint(
  side: 0 | 1,
  ball: BallSide,
  zone: BoxZone,
  attack: boolean,
): [number, number] {
  const p = boxZones(ball)[zone];
  return toEngine(side, attack ? p : [p[0] - B.load, p[1]]);
}

/**
 * How far from its goal `side`'s back line stands against the box scene now (its own frame):
 * `defend.line`'s deeper end with the ball on the byline, the shallower with it `wideFrom` up.
 */
export function boxLineDepth(s: GridState, side: 0 | 1): number {
  const [lo, hi] = B.defend.line;
  const ball = attackFrame(side, s.ball)[0];
  return lo + (hi - lo) * clamp(ball / (PITCH.length - B.wideFrom), 0, 1);
}

/**
 * Where a defender of `side` guarding `guard` against a scene named for `ball` stands now (engine
 * frame, →MATCH-34): the near post, the middle (between the posts' zones) and the far post on the
 * back line's depth (`boxLineDepth`), the penalty spot and the edge on their zones.
 */
export function boxGuardPoint(
  s: GridState,
  side: 0 | 1,
  guard: BoxGuard,
  ball: BallSide,
): [number, number] {
  const att = other(side);
  const zones = boxZones(ball);
  // A zone in the defending side's frame: both axes mirror between the two sides' frames.
  const own = (p: Point): Point => [PITCH.length - p[0], PITCH.width - p[1]];
  const depth = boxLineDepth(s, side);
  if (guard === 'spot' || guard === 'edge') return toEngine(att, zones[guard]);
  const y =
    guard === 'middle'
      ? (own(zones.nearPost)[1] + own(zones.farPost)[1]) / 2
      : own(zones[guard])[1];
  return toEngine(side, [depth, y]);
}

/** The opponent of `side` attacking `zone` of a scene named for `ball`, if one is on that run. */
export function zoneRunner(
  s: GridState,
  side: 0 | 1,
  zone: BoxGuard,
  ball: BallSide,
): GridPlayer | undefined {
  if (zone === 'middle') return undefined;
  for (const gp of s.players[other(side)]) {
    const job = gp.intention?.kind === 'run' ? gp.intention.box : undefined;
    if (job && job.zone === zone && job.ball === ball && onPitch(gp)) return gp;
  }
  return undefined;
}

/**
 * Where `gp`, guarding `guard` of a scene named for `ball`, stands now (engine frame, →MATCH-34):
 * goal-side of the runner who attacks his zone, between him and it (`boxMarkPoint`); with nobody
 * attacking it, on his guard point (`boxGuardPoint`): the zone is held by position.
 */
export function boxGuardTarget(
  s: GridState,
  gp: GridPlayer,
  guard: BoxGuard,
  ball: BallSide,
): [number, number] {
  const runner = zoneRunner(s, gp.side, guard, ball);
  return (runner && boxMarkPoint(gp.side, runner)) ?? boxGuardPoint(s, gp.side, guard, ball);
}

/**
 * The defending side's place in the scene (`side`'s frame, →MATCH-34): a back-line player drops to
 * the line's depth and narrows by `defend.narrow` toward the centre line.
 */
export const boxBackLine = (s: GridState, side: 0 | 1, y: number): Point => [
  boxLineDepth(s, side),
  CENTRE + (y - CENTRE) * B.defend.narrow,
];

/**
 * The ball's side of the goal while `side` defends against a box scene, else undefined: the
 * opponent's scene is on, or one of `side`'s guards still holds its job (the scene not released).
 */
export function defendingBox(s: GridState, side: 0 | 1): BallSide | undefined {
  const on = boxSide(s, other(side));
  if (on !== undefined) return on;
  for (const gp of s.players[side]) {
    const job = gp.intention?.kind === 'cover' ? gp.intention.box : undefined;
    if (job && onPitch(gp)) return job.ball;
  }
  return undefined;
}

/**
 * Who of the defending `side` takes which guard against `scene` (→MATCH-34): the ball-side
 * centre-back the near post, the most central other centre-back the middle, the far full-back or
 * wing-back the far post, and the nearest holding or central midfielder the edge, or the spot
 * when the attack fills the spot and not the edge. Only men `free` for a job, and only guards no
 * teammate already holds; ties by player ID.
 */
export function boxGuards(
  s: GridState,
  side: 0 | 1,
  scene: BoxScene,
  free: (gp: GridPlayer) => boolean,
): { gp: GridPlayer; guard: BoxGuard }[] {
  const roster = s.players[side].filter((gp) => onPitch(gp) && gp.slot > 0);
  const held = new Set<BoxGuard>();
  for (const gp of roster) {
    const job = gp.intention?.kind === 'cover' ? gp.intention.box : undefined;
    if (job && job.ball === scene.ball) held.add(job.zone);
  }
  const out: { gp: GridPlayer; guard: BoxGuard }[] = [];
  const used = new Set<GridPlayer>();
  const pos = (gp: GridPlayer) => slotOf(s, gp).position;
  // The ball's side in the defending frame is the other one; a slot's spot y is in that frame.
  const ballSide = -scene.ball;
  const spotY = (gp: GridPlayer) => SPOTS[s.setup.tactics[side]][gp.slot]![1];
  const toBall = (gp: GridPlayer) => ballSide * (spotY(gp) - CENTRE);
  const give = (gp: GridPlayer | undefined, guard: BoxGuard) => {
    if (!gp || held.has(guard)) return;
    out.push({ gp, guard });
    used.add(gp);
  };
  const cbs = roster
    .filter((gp) => pos(gp) === 'CB' && free(gp))
    .sort((a, b) => toBall(b) - toBall(a) || byId(a, b));
  give(cbs[0], 'nearPost');
  const central = cbs
    .filter((gp) => !used.has(gp))
    .sort(
      (a, b) =>
        Math.abs(spotY(a) - CENTRE) - Math.abs(spotY(b) - CENTRE) ||
        toBall(b) - toBall(a) ||
        byId(a, b),
    )[0];
  give(central, 'middle');
  give(
    roster
      .filter((gp) => FULL_BACKS[scene.ball].includes(pos(gp)) && free(gp) && !used.has(gp))
      .sort(byId)[0],
    'farPost',
  );
  if (!held.has('edge') && !held.has('spot')) {
    const zone: BoxGuard =
      scene.runners.edge === undefined && scene.runners.spot !== undefined ? 'spot' : 'edge';
    const at = boxGuardPoint(s, side, zone, scene.ball);
    const mid = roster
      .filter((gp) => (pos(gp) === 'DM' || pos(gp) === 'CM') && free(gp) && !used.has(gp))
      .map((gp) => ({ gp, d: gap(gp.pos, at) }))
      .sort((a, b) => a.d - b.d || byId(a.gp, b.gp))[0];
    give(mid?.gp, zone);
  }
  return out;
}

/**
 * Where a marker of `side` stands against a runner on a box-scene run (engine frame, →MATCH-34):
 * goal-side of him, between him and the zone he attacks, `SHAPE_CONFIG.markGoalSide` m from him;
 * straight goal-side once he is that close to his zone. Undefined for any other runner.
 */
export function boxMarkPoint(side: 0 | 1, runner: GridPlayer): [number, number] | undefined {
  const job = runner.intention?.kind === 'run' ? runner.intention.box : undefined;
  if (!job || job.zone === 'middle') return undefined;
  const zone = toEngine(other(side), boxZones(job.ball)[job.zone]);
  const dx = zone[0] - runner.pos[0],
    dy = zone[1] - runner.pos[1];
  const d = gap(zone, runner.pos);
  const step = SHAPE_CONFIG.markGoalSide;
  if (d > step) return [runner.pos[0] + (dx / d) * step, runner.pos[1] + (dy / d) * step];
  const o = attackFrame(side, runner.pos);
  return toEngine(side, [Math.max(0, o[0] - step), o[1]]);
}
