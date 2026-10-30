/** Per-touch tags: the football situation of the player on the ball, read from positions (→MATCH-15). */
import {
  attackFrame,
  bandOf,
  cellOf,
  laneOf,
  PITCH,
  type Band,
  type Lane,
  type Point,
} from './pitch';
import { lineX, offsideLine } from './shape';
import { onPitch, other, type GridPlayer, type GridState } from './state';
import { FORMATIONS } from '../player';

export interface Tags {
  cell: number;
  band: Band;
  lane: Lane;
  phase: 'buildUp' | 'progression' | 'finalThird' | 'counter' | 'settled' | 'setPiece' | 'contest';
  /** Σ over opponents within 4.6 m: 1 if goal-side of the carrier, else 0.5. */
  pressure: number;
  /** Metres to the nearest opponent. */
  nearest: number;
  orientation: 'facing' | 'halfTurn' | 'backToGoal';
  betweenLines: boolean;
  pocket: boolean;
  inBehind: boolean;
  channel: boolean;
  /** Own players minus opponents within 15 m of the ball. */
  overload: number;
  /** Own minus opponent goals, the minute and own minus opponent men on the pitch. */
  lead: number;
  minute: number;
  menDiff: number;
}

export const TAG_CONFIG = {
  pressureRadius: 4.6,
  backToGoalRadius: 3,
  pocketGap: 6,
  channelReach: 6,
  overloadRadius: 15,
  counterSeconds: 8,
  counterMaxGoalSide: 5,
  settledSeconds: 20,
} as const;

/** The tags for the player `(side, idx)` on the ball; `opts` marks restarts and loose balls. */
export function computeTags(
  s: GridState,
  side: 0 | 1,
  idx: number,
  opts: { setPiece?: boolean; contest?: boolean } = {},
): Tags {
  const foe = other(side);
  const me = s.players[side][idx]!;
  const c: Point = attackFrame(side, me.pos);
  const cell = cellOf(c);
  const band = bandOf(c[0]);
  const lane = laneOf(c[1]);
  const { hypot } = s.math;
  // The ball's x in the carrier's frame (`attackFrame`, without allocating).
  const bx = side === 0 ? s.ball[0] : PITCH.length - s.ball[0];
  let pressure = 0,
    nearest = Infinity,
    nearGoalSide = false,
    goalSide = 0,
    overload = 0,
    foesOn = 0;
  // Each opponent on the pitch, in the carrier's frame (`attackFrame` inlined, so the scan allocates
  // nothing), and the opponents around the ball.
  for (const gp of s.players[foe]) {
    if (!onPitch(gp)) continue;
    foesOn++;
    const px = side === 0 ? gp.pos[0] : PITCH.length - gp.pos[0];
    const py = side === 0 ? gp.pos[1] : PITCH.width - gp.pos[1];
    const d = hypot(px - c[0], py - c[1]);
    nearest = Math.min(nearest, d);
    if (d <= TAG_CONFIG.pressureRadius) pressure += px > c[0] ? 1 : 0.5;
    if (d <= TAG_CONFIG.backToGoalRadius && px > c[0]) nearGoalSide = true;
    if (px > bx) goalSide++;
    if (hypot(gp.pos[0] - s.ball[0], gp.pos[1] - s.ball[1]) <= TAG_CONFIG.overloadRadius)
      overload--;
  }
  // The opponent's lines in the carrier's frame (its own frame's x runs the other way).
  const dfX = PITCH.length - lineX(s, foe, 'DF');
  const mfX = PITCH.length - lineX(s, foe, 'MF');
  const betweenLines = c[0] >= mfX && c[0] <= dfX && lane >= 1 && lane <= 3;
  let channel = false;
  if ((lane === 1 || lane === 3) && Math.abs(c[0] - dfX) <= TAG_CONFIG.channelReach) {
    const slots = FORMATIONS[s.setup.tactics[foe]].slots;
    const opponents = s.players[foe]
      .filter(onPitch)
      .map((gp) => ({ gp, p: attackFrame(side, gp.pos) }));
    const cb = nearestAcross(opponents, slots, CENTRE_BACKS, c);
    const fb = nearestAcross(opponents, slots, FULL_BACKS, c);
    if (cb && fb)
      channel = c[1] >= Math.min(cb.p[1], fb.p[1]) && c[1] <= Math.max(cb.p[1], fb.p[1]);
  }
  let menOn = 0;
  for (const gp of s.players[side])
    if (onPitch(gp)) {
      menOn++;
      if (hypot(gp.pos[0] - s.ball[0], gp.pos[1] - s.ball[1]) <= TAG_CONFIG.overloadRadius)
        overload++;
    }
  let phase: Tags['phase'];
  if (opts.setPiece) phase = 'setPiece';
  else if (opts.contest) phase = 'contest';
  else if (
    s.lastRegain?.side === side &&
    s.elapsed - s.lastRegain.at <= TAG_CONFIG.counterSeconds &&
    goalSide <= TAG_CONFIG.counterMaxGoalSide
  )
    phase = 'counter';
  else if (s.elapsed - s.possessionSince > TAG_CONFIG.settledSeconds && band < 5) phase = 'settled';
  else phase = band <= 2 ? 'buildUp' : band <= 4 ? 'progression' : 'finalThird';
  const pass = s.lastPass;
  const orientation: Tags['orientation'] =
    pass && pass.dx < 0 && nearGoalSide
      ? 'backToGoal'
      : pass && Math.abs(pass.dx) <= Math.abs(pass.dy) && !nearGoalSide
        ? 'halfTurn'
        : 'facing';
  return {
    cell,
    band,
    lane,
    phase,
    pressure,
    nearest: Number.isFinite(nearest) ? nearest : PITCH.length,
    orientation,
    betweenLines,
    pocket: betweenLines && nearest >= TAG_CONFIG.pocketGap,
    inBehind: c[0] > offsideLine(s, foe),
    channel,
    overload,
    lead: s.score[side] - s.score[foe],
    minute: Math.floor(s.elapsed / 60) + 1,
    menDiff: menOn - foesOn,
  };
}

const CENTRE_BACKS: readonly string[] = ['CB'];
const FULL_BACKS: readonly string[] = ['LB', 'RB', 'LWB', 'RWB'];
/**
 * The opponent at one of `positions` (his slot's, `slots`) nearest across to the carrier at `c`
 * (equal gaps in roster order): a function of the module rather than closures made per call (T450).
 */
function nearestAcross(
  opponents: readonly { gp: GridPlayer; p: Point }[],
  slots: (typeof FORMATIONS)[keyof typeof FORMATIONS]['slots'],
  positions: readonly string[],
  c: Point,
) {
  return opponents
    .filter(({ gp }) => positions.includes(slots[gp.slot]?.position ?? ''))
    .sort((a, b) => Math.abs(a.p[1] - c[1]) - Math.abs(b.p[1] - c[1]))[0];
}
