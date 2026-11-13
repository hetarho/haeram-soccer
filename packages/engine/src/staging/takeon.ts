import { invalidDetail } from '../script/failure';
// Going past a man. A completed take-on: the defender jockeys goal-side while the attacker holds,
// the attacker steps past him on the side nearer his goal for the run while the beaten defender is
// slow to turn, then accelerates away to the beat's end with the defender chasing behind. A carry
// through an opponent close ahead of it goes past him the same way (`manInTheWay`, `slipPast`).
// A man gone past is beaten (`StageState.beaten`): until `GO_PAST.beatenFor` seconds after the beat
// he neither presses nor holds the carrier up, so the carrier goes on instead of turning back.
import { STAGING_CONFIG } from './config';
import { clampToPitch, inPitch } from './pitch';
import type { Vec } from './types';
import { add, dist, dot, norm, perp, scale, sub } from './vec';
import { cueNext, jockeyPoint, nearestOpponent } from './contest';
import { paceSpeed } from './motion';
import { holdOver } from './release';
import type { BeatContext } from './perform';
import { ensureOwner, runUntil, setPossession, type StageState } from './world';

const STAGE = STAGING_CONFIG.stage;
const TAKE_ON = STAGE.takeOn;
/**
 * Going past a man (a completed take-on, or a carry through an opponent within `reach` metres
 * ahead of it); the man is out of the press until `beatenFor` seconds after the beat. Module
 * constants rather than lab tunables (the lab catalog lists only the config objects).
 */
export const GO_PAST = { reach: 4, beatenFor: 3 };

/**
 * The opponent (not yet beaten, not a keeper) within `GO_PAST.reach` of the man on the ball who
 * stands in the way of his carry to `end`: ahead of him within 60° of its line, more than
 * `takeOn.side` short of its end; -1 when there is none.
 */
export function manInTheWay(state: StageState, actor: number, end: Vec): number {
  const man = nearestOpponent(state, actor, true);
  if (man.index < 0 || man.distance > GO_PAST.reach) return -1;
  const pos = state.bodies[actor].pos;
  const line = norm(sub(end, pos));
  const at = sub(state.bodies[man.index].pos, pos);
  const along = dot(at, line);
  return along > 0.5 * man.distance && along < dist(pos, end) - TAKE_ON.side ? man.index : -1;
}

/**
 * The man on the ball steps past `defender` on his way to `end` (the side nearer `end`, kept on
 * the pitch) at `takeOn.speed` while the defender turns slowly; the defender is beaten from then
 * on, until the caller's `release`.
 */
export function* slipPast(
  state: StageState,
  actor: number,
  defender: number,
  end: Vec,
): Generator<void, void> {
  const actorPos = (): Vec => state.bodies[actor].pos;
  const dir = norm(sub(end, actorPos()));
  const here: Vec = [state.bodies[defender].pos[0], state.bodies[defender].pos[1]];
  const plus = add(here, scale(perp(dir), TAKE_ON.side));
  const minus = add(here, scale(perp(dir), -TAKE_ON.side));
  const plusIn = inPitch(plus, 1);
  const minusIn = inPitch(minus, 1);
  const side =
    plusIn !== minusIn
      ? plusIn
        ? plus
        : minus
      : dist(minus, end) < dist(plus, end)
        ? minus
        : plus;
  state.beaten.set(defender, Infinity);
  state.orders.set(actor, { target: side, pace: 'run', speedCap: TAKE_ON.speed });
  state.orders.set(defender, { target: here, pace: 'walk', speedCap: TAKE_ON.beatenSpeed });
  yield* runUntil(state, () => dist(actorPos(), side) <= 0.8, TAKE_ON.beatenTime + 1);
}

/** The men beaten in this beat recover `GO_PAST.beatenFor` seconds from now. */
export function releaseBeaten(state: StageState): void {
  for (const [index, until] of state.beaten) {
    if (until === Infinity) state.beaten.set(index, state.t + GO_PAST.beatenFor);
  }
}

/** `takeOn:complete`. */
export function* performTakeOn(state: StageState, ctx: BeatContext): Generator<void, void> {
  const beat = ctx.beat;
  const actor = beat.actor;
  const defender = beat.opponent;
  if (defender === undefined) throw invalidDetail(`staging:beat:${beat.index}`);
  setPossession(state, beat);
  yield* ensureOwner(state, actor);
  const team = state.fixture.players[defender].team;
  const actorPos = (): Vec => state.bodies[actor].pos;
  state.orders.set(actor, { target: actorPos, pace: 'walk' });
  state.orders.set(defender, {
    target: () => jockeyPoint(team, actorPos(), state.fixture.period),
    pace: 'run',
  });
  const holdStart = state.t;
  yield* runUntil(state, holdOver(state, actor, holdStart, beat.hold), beat.hold);

  const E = clampToPitch(beat.to, 0.5);
  yield* slipPast(state, actor, defender, E);

  const sprint = paceSpeed('sprint', state.fixture.players[actor]);
  state.orders.set(actor, { target: E, pace: 'sprint', speedCap: 0.9 * sprint });
  cueNext(state, ctx, E);
  // He chases behind unless the next beat already sends him to contest the ball.
  if (state.cues.has(defender)) state.orders.delete(defender);
  else state.orders.set(defender, { target: actorPos, pace: 'run' });
  yield* runUntil(
    state,
    () => dist(actorPos(), E) <= STAGE.arrive,
    dist(actorPos(), E) / STAGE.dribbleSpeed + 2,
  );
  releaseBeaten(state);
  state.orders.clear();
}
