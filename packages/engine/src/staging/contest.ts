// Contests: the script names who wins the ball, and the stage makes sure he can. An interceptor
// meets a pass where its path passes nearest him, within the share of the path he may take it on;
// if the scripted man cannot be there in time, the lunge allowance and a slower ball
// let that same man get there. Cues put the next beat's
// opponent on his way one beat ahead, so nobody has to teleport when his beat starts.
import { STAGING_CONFIG } from './config';
import { ownGoal } from './pitch';
import type { Fixture, TeamId, Vec } from './types';
import { onPitch, presentPlayers } from './types';
import { add, clamp, dist, dot, lerp, norm, scale, sub } from './vec';
import { speedAt, timeToReach } from './motion';
import type { BeatContext } from './perform';
import { isBeaten, type StageState } from './world';

const STAGE = STAGING_CONFIG.stage;
const BALL = STAGING_CONFIG.ball;

export interface CutPlan {
  opponent: number;
  /** Where on the ball's path he meets it, and its 0–1 position along the path. */
  point: Vec;
  param: number;
  /** Seconds after the kick at which the ball is there. */
  time: number;
  /** His time to get there minus `time`; ≤ stage.cutSlack means he makes it. */
  margin: number;
}

const isKeeper = (state: StageState, index: number): boolean =>
  state.fixture.players[index].slot === 0;

/** The share of a path a player may meet it on: a keeper only near its end. */
export const cutRange = (state: StageState, index: number): readonly [number, number] =>
  isKeeper(state, index) ? [STAGE.keeperCutMin, 1] : [STAGE.cutMin, STAGE.cutMax];

export function planCut(
  state: StageState,
  opponent: number,
  from: Vec,
  to: Vec,
  flight: number,
  range: readonly [number, number],
  boost?: number,
): CutPlan {
  const body = state.bodies[opponent];
  const ab = sub(to, from);
  const l2 = dot(ab, ab);
  const raw = l2 === 0 ? 0 : dot(sub(body.pos, from), ab) / l2;
  const param = clamp(raw, range[0], range[1]);
  const point = lerp(from, to, param);
  const time = param * flight;
  const speed = speedAt(state, opponent, 'sprint', Infinity, boost);
  return { opponent, point, param, time, margin: timeToReach(body, point, speed) - time };
}

/**
 * Who meets a pass from `from` to `to` lasting `flight` seconds, and where: the scripted opponent
 * when he makes it, else that same player with the lunge allowance (`stretch`),
 * the ball slowed when even that is late. A recorded player is never replaced.
 */
export function resolveCut(
  state: StageState,
  scripted: number,
  from: Vec,
  to: Vec,
  flight: number,
  range?: readonly [number, number],
): { plan: CutPlan; flight: number; recast: boolean; stretch: boolean } {
  const rangeOf = (i: number): readonly [number, number] => range ?? cutRange(state, i);
  const own = planCut(state, scripted, from, to, flight, rangeOf(scripted));
  if (own.margin <= STAGE.cutSlack) return { plan: own, flight, recast: false, stretch: false };
  const lunge = planCut(state, scripted, from, to, flight, rangeOf(scripted), STAGE.lunge);
  if (lunge.margin <= STAGE.cutSlack) return { plan: lunge, flight, recast: false, stretch: true };
  return { ...slowed(lunge, from, to, flight), recast: false, stretch: true };
}

/** `plan` with the ball slowed (never below `ball.minSpeed`) so its man gets there, or as near as he can. */
function slowed(
  plan: CutPlan,
  from: Vec,
  to: Vec,
  flight: number,
): { plan: CutPlan; flight: number } {
  const slowest = dist(from, to) / BALL.minSpeed;
  const wanted = plan.param > 0 ? (plan.time + plan.margin - STAGE.cutSlack) / plan.param : flight;
  const longer = Math.max(flight, Math.min(slowest, wanted));
  const arrival = plan.time + plan.margin;
  const time = plan.param * longer;
  return { plan: { ...plan, time, margin: arrival - time }, flight: longer };
}

/** The nearest outfield opponent of player `index` now; with `unbeaten`, the nearest he has not gone past (`isBeaten`). */
export function nearestOpponent(
  state: StageState,
  index: number,
  unbeaten = false,
): { index: number; distance: number } {
  const other: TeamId = state.fixture.players[index].team === 0 ? 1 : 0;
  const pos = state.bodies[index].pos;
  let found = { index: -1, distance: Infinity };
  for (const p of presentPlayers(state.fixture, other)) {
    if (p.slot === 0 || (unbeaten && isBeaten(state, p.index))) continue;
    const d = dist(state.bodies[p.index].pos, pos);
    if (d < found.distance) found = { index: p.index, distance: d };
  }
  return found;
}

/** The point on the lane from `from` to `to` where an interceptor of `team` waits. */
export function shadowPoint(team: TeamId, from: Vec, to: Vec, period?: Fixture['period']): Vec {
  const lane = lerp(from, to, STAGE.shadowAt);
  return add(lane, scale(norm(sub(ownGoal(team, period), lane)), STAGE.shadowOff));
}

/** The point goal-side of `at` where a defender of `team` jockeys. */
export function jockeyPoint(team: TeamId, at: Vec, period?: Fixture['period']): Vec {
  return add(at, scale(norm(sub(ownGoal(team, period), at)), STAGE.jockey));
}

/**
 * Cues the next beat of the same side one beat ahead (`at` = where the ball will be when this beat
 * ends): a pressed next beat tightens the press now, and its outfield opponent sets off to the
 * lane's shadow point (an interception) or to jockey the ball (a tackle, foul, block or take-on).
 */
export function cueNext(state: StageState, ctx: BeatContext, at: Vec): void {
  const next = ctx.next;
  if (!next || next.team !== ctx.beat.team) return;
  if (next.reason === 'pressed') state.tight = true;
  const opponent = next.opponent;
  if (
    opponent === undefined ||
    !onPitch(state.fixture, opponent) ||
    isKeeper(state, opponent) ||
    next.original?.period !== ctx.beat.original?.period
  )
    return;
  const team = state.fixture.players[opponent].team;
  if (next.outcome === 'intercepted') {
    state.cues.set(opponent, {
      target: shadowPoint(team, at, next.to, state.fixture.period),
      pace: 'run',
    });
    return;
  }
  const jockeys =
    next.kind === 'takeOn' ||
    next.outcome === 'tackled' ||
    next.outcome === 'foul' ||
    next.outcome === 'blocked';
  if (jockeys)
    state.cues.set(opponent, { target: jockeyPoint(team, at, state.fixture.period), pace: 'run' });
}
