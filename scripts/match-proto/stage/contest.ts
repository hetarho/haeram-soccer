// Contests: the script names who wins the ball, and the stage makes sure he can. An interceptor
// meets a pass where its path passes nearest him, within the share of the path he may take it on;
// if the scripted man cannot be there in time a nearer teammate takes his place, and if nobody can,
// the lunge allowance and a slower ball let the nearest one get there. Cues put the next beat's
// opponent on his way one beat ahead, so nobody has to teleport when his beat starts.
import { PROTO_CONFIG } from '../core/config.ts';
import { ownGoal } from '../core/pitch.ts';
import type { TeamId, Vec } from '../core/types.ts';
import { add, clamp, dist, dot, lerp, norm, scale, sub } from '../core/vec.ts';
import { paceSpeed, timeToReach } from './motion.ts';
import type { BeatContext } from './perform.ts';
import type { StageState } from './world.ts';

const STAGE = PROTO_CONFIG.stage;
const BALL = PROTO_CONFIG.ball;

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
  const speed = paceSpeed('sprint', state.fixture.players[opponent]) + (boost ?? 0);
  return { opponent, point, param, time, margin: timeToReach(body, point, speed) - time };
}

/** Smallest margin first, ties to the lower index. */
const best = (plans: readonly CutPlan[]): CutPlan | undefined =>
  [...plans].sort((a, b) => a.margin - b.margin || a.opponent - b.opponent)[0];

/**
 * Who meets a pass from `from` to `to` lasting `flight` seconds, and where: the scripted opponent
 * when he makes it, else the teammate with the smallest margin when he makes it (`recast`), else
 * the smallest margin with the lunge allowance (`stretch`), the ball slowed when even that is late.
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
  const team = state.fixture.players[scripted].team;
  const keeperToo = isKeeper(state, scripted);
  const mates = state.fixture.teams[team].players
    .filter((p) => p.index !== scripted && (p.slot !== 0 || keeperToo))
    .map((p) => p.index);
  const mate = best(mates.map((i) => planCut(state, i, from, to, flight, rangeOf(i))));
  if (mate && mate.margin <= STAGE.cutSlack) {
    return { plan: mate, flight, recast: true, stretch: false };
  }
  const lunging = [scripted, ...mates].map((i) =>
    planCut(state, i, from, to, flight, rangeOf(i), STAGE.lunge),
  );
  const plan = best(lunging) ?? own;
  const recast = plan.opponent !== scripted;
  if (plan.margin <= STAGE.cutSlack) return { plan, flight, recast, stretch: true };
  const slowest = dist(from, to) / BALL.minSpeed;
  const wanted = plan.param > 0 ? (plan.time + plan.margin - STAGE.cutSlack) / plan.param : flight;
  const longer = Math.max(flight, Math.min(slowest, wanted));
  const arrival = plan.time + plan.margin;
  const time = plan.param * longer;
  return {
    plan: { ...plan, time, margin: arrival - time },
    flight: longer,
    recast,
    stretch: true,
  };
}

/** The nearest outfield opponent of player `index` now. */
export function nearestOpponent(
  state: StageState,
  index: number,
): { index: number; distance: number } {
  const other: TeamId = state.fixture.players[index].team === 0 ? 1 : 0;
  const pos = state.bodies[index].pos;
  let found = { index: -1, distance: Infinity };
  for (const p of state.fixture.teams[other].players) {
    if (p.slot === 0) continue;
    const d = dist(state.bodies[p.index].pos, pos);
    if (d < found.distance) found = { index: p.index, distance: d };
  }
  return found;
}

/** The point on the lane from `from` to `to` where an interceptor of `team` waits. */
export function shadowPoint(team: TeamId, from: Vec, to: Vec): Vec {
  const lane = lerp(from, to, STAGE.shadowAt);
  return add(lane, scale(norm(sub(ownGoal(team), lane)), STAGE.shadowOff));
}

/** The point goal-side of `at` where a defender of `team` jockeys. */
export function jockeyPoint(team: TeamId, at: Vec): Vec {
  return add(at, scale(norm(sub(ownGoal(team), at)), STAGE.jockey));
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
  if (opponent === undefined || isKeeper(state, opponent)) return;
  const team = state.fixture.players[opponent].team;
  if (next.outcome === 'intercepted') {
    state.cues.set(opponent, { target: shadowPoint(team, at, next.to), pace: 'run' });
    return;
  }
  const jockeys =
    next.kind === 'takeOn' ||
    next.outcome === 'tackled' ||
    next.outcome === 'foul' ||
    next.outcome === 'blocked';
  if (jockeys) state.cues.set(opponent, { target: jockeyPoint(team, at), pace: 'run' });
}
