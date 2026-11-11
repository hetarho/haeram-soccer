import { invalidDetail } from '../script/failure';
// A completed take-on: the defender jockeys goal-side while the attacker holds, the attacker
// steps past him on the side nearer his goal for the run while the beaten defender is slow to
// turn, then accelerates away to the beat's end with the defender chasing behind.
import { STAGING_CONFIG } from './config';
import { clampToPitch, inPitch } from './pitch';
import type { Vec } from './types';
import { add, dist, norm, perp, scale, sub } from './vec';
import { cueNext, jockeyPoint } from './contest';
import { paceSpeed } from './motion';
import type { BeatContext } from './perform';
import { ensureOwner, runUntil, setPossession, type StageState } from './world';

const STAGE = STAGING_CONFIG.stage;
const TAKE_ON = STAGE.takeOn;

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
  yield* runUntil(state, () => state.t - holdStart >= beat.hold - 1e-9, beat.hold);

  const E = clampToPitch(beat.to, 0.5);
  const dir = norm(sub(E, actorPos()));
  const here: Vec = [state.bodies[defender].pos[0], state.bodies[defender].pos[1]];
  const plus = add(here, scale(perp(dir), TAKE_ON.side));
  const minus = add(here, scale(perp(dir), -TAKE_ON.side));
  const plusIn = inPitch(plus, 1);
  const minusIn = inPitch(minus, 1);
  const side =
    plusIn !== minusIn ? (plusIn ? plus : minus) : dist(minus, E) < dist(plus, E) ? minus : plus;
  state.orders.set(actor, { target: side, pace: 'run', speedCap: TAKE_ON.speed });
  state.orders.set(defender, { target: here, pace: 'walk', speedCap: TAKE_ON.beatenSpeed });
  yield* runUntil(state, () => dist(actorPos(), side) <= 0.8, TAKE_ON.beatenTime + 1);

  const sprint = paceSpeed('sprint', state.fixture.players[actor]);
  state.orders.set(actor, { target: E, pace: 'sprint', speedCap: 0.9 * sprint });
  state.orders.set(defender, { target: actorPos, pace: 'run' });
  cueNext(state, ctx, E);
  yield* runUntil(
    state,
    () => dist(actorPos(), E) <= STAGE.arrive,
    dist(actorPos(), E) / STAGE.dribbleSpeed + 2,
  );
  state.orders.clear();
}
