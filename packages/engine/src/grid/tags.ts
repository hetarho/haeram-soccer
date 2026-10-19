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
import type { GridPlayer, GridState } from './state';
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

const onPitch = (gp: GridPlayer) => gp.onPitch && !gp.sentOff;

/** The tags for the player `(side, idx)` on the ball; `opts` marks restarts and loose balls. */
export function computeTags(
  s: GridState,
  side: 0 | 1,
  idx: number,
  opts: { setPiece?: boolean; contest?: boolean } = {},
): Tags {
  const other = (1 - side) as 0 | 1;
  const me = s.players[side][idx]!;
  const c: Point = attackFrame(side, me.pos);
  const cell = cellOf(c);
  const band = bandOf(c[0]);
  const lane = laneOf(c[1]);
  const opponents = s.players[other]
    .filter(onPitch)
    .map((gp) => ({ gp, p: attackFrame(side, gp.pos) }));
  let pressure = 0,
    nearest = Infinity,
    nearGoalSide = false;
  for (const { p } of opponents) {
    const d = Math.hypot(p[0] - c[0], p[1] - c[1]);
    nearest = Math.min(nearest, d);
    if (d <= TAG_CONFIG.pressureRadius) pressure += p[0] > c[0] ? 1 : 0.5;
    if (d <= TAG_CONFIG.backToGoalRadius && p[0] > c[0]) nearGoalSide = true;
  }
  // The opponent's lines in the carrier's frame (its own frame's x runs the other way).
  const dfX = 105 - lineX(s, other, 'DF');
  const mfX = 105 - lineX(s, other, 'MF');
  const betweenLines = c[0] >= mfX && c[0] <= dfX && lane >= 1 && lane <= 3;
  const slotPosition = (gp: GridPlayer) =>
    FORMATIONS[s.setup.tactics[other]].slots[gp.slot]?.position;
  let channel = false;
  if ((lane === 1 || lane === 3) && Math.abs(c[0] - dfX) <= TAG_CONFIG.channelReach) {
    const pick = (positions: readonly string[]) =>
      opponents
        .filter(({ gp }) => positions.includes(slotPosition(gp) ?? ''))
        .sort((a, b) => Math.abs(a.p[1] - c[1]) - Math.abs(b.p[1] - c[1]))[0];
    const cb = pick(['CB']);
    const fb = pick(['LB', 'RB', 'LWB', 'RWB']);
    if (cb && fb)
      channel = c[1] >= Math.min(cb.p[1], fb.p[1]) && c[1] <= Math.max(cb.p[1], fb.p[1]);
  }
  const ball = attackFrame(side, s.ball);
  let overload = 0;
  for (const gp of s.players[side])
    if (
      onPitch(gp) &&
      Math.hypot(gp.pos[0] - s.ball[0], gp.pos[1] - s.ball[1]) <= TAG_CONFIG.overloadRadius
    )
      overload++;
  for (const gp of s.players[other])
    if (
      onPitch(gp) &&
      Math.hypot(gp.pos[0] - s.ball[0], gp.pos[1] - s.ball[1]) <= TAG_CONFIG.overloadRadius
    )
      overload--;
  const goalSide = opponents.filter(({ p }) => p[0] > ball[0]).length;
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
  const men = (sd: 0 | 1) => s.players[sd].filter(onPitch).length;
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
    inBehind: c[0] > offsideLine(s, other),
    channel,
    overload,
    lead: s.score[side] - s.score[other],
    minute: Math.floor(s.elapsed / 60) + 1,
    menDiff: men(side) - men(other),
  };
}
