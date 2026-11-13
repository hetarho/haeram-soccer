import { invalidDetail } from '../script/failure';
// Carries. A completed carry: the carrier holds the ball for the beat's hold, then dribbles to the
// carry's end at a dribbling pace; the ball stays at his feet through `updateBall`. A man close
// ahead of the carry is gone past on the way (`slipPast`) and trails him, beaten. A carry (or a
// take-on) that is tackled or fouled: the scripted opponent jockeys goal-side while the carrier
// holds, then chases him as he runs, and wins the ball (or fouls him) once he is close enough; if he
// cannot get there, the scripted opponent lunges and the carrier waits for him.
import { STAGING_CONFIG } from './config';
import { clampToPitch } from './pitch';
import type { Vec } from './types';
import { add, approach, dist, norm, scale, sub } from './vec';
import { giveBall } from './ball';
import { speedAt } from './motion';
import { holdMove } from './pass';
import { cueNext, jockeyPoint } from './contest';
import { manInTheWay, releaseBeaten, slipPast } from './takeon';
import { holdOver } from './release';
import type { BeatContext } from './perform';
import {
  ensureOwner,
  pushEvent,
  runUntil,
  setPossession,
  nextTick,
  type StageState,
} from './world';

const STAGE = STAGING_CONFIG.stage;

/** `carry:complete`. */
export function* performCarry(state: StageState, ctx: BeatContext): Generator<void, void> {
  const beat = ctx.beat;
  const actor = beat.actor;
  setPossession(state, beat);
  yield* ensureOwner(state, actor);
  const end = clampToPitch(beat.to, 0.5);
  const start = state.t;
  state.orders.set(actor, holdMove(state, actor, end, true, start + beat.hold));
  yield* runUntil(state, holdOver(state, actor, start, beat.hold), beat.hold);
  // A carry through a man close ahead of it goes past him: he is beaten and trails the carrier.
  const man = manInTheWay(state, actor, end);
  if (man >= 0) yield* slipPast(state, actor, man, end);
  const d = dist(state.bodies[actor].pos, end);
  state.orders.set(actor, { target: end, pace: 'sprint', speedCap: STAGE.dribbleSpeed });
  cueNext(state, ctx, end);
  // He trails the carrier unless the next beat already sends him to contest the ball.
  if (man >= 0 && !state.cues.has(man))
    state.orders.set(man, { target: () => state.bodies[actor].pos, pace: 'jog' });
  yield* runUntil(
    state,
    () => dist(state.bodies[actor].pos, end) <= STAGE.arrive,
    (d / speedAt(state, actor, 'sprint', STAGE.dribbleSpeed)) * 1.5 + 2,
  );
  releaseBeaten(state);
  state.orders.clear();
}

/** `carry:tackled`, `carry:foul`, `takeOn:tackled` and `takeOn:foul`. */
export function* performCarryLost(state: StageState, ctx: BeatContext): Generator<void, void> {
  const beat = ctx.beat;
  const actor = beat.actor;
  const scripted = beat.opponent;
  if (scripted === undefined) throw invalidDetail(`staging:beat:${beat.index}`);
  setPossession(state, beat);
  yield* ensureOwner(state, actor);
  const team = state.fixture.players[scripted].team;
  const actorPos = (): Vec => state.bodies[actor].pos;
  state.orders.set(
    actor,
    holdMove(state, actor, clampToPitch(beat.to, 0.5), true, state.t + beat.hold),
  );
  state.orders.set(scripted, {
    target: () => jockeyPoint(team, actorPos(), state.fixture.period),
    pace: 'run',
  });
  const holdStart = state.t;
  yield* runUntil(state, holdOver(state, actor, holdStart, beat.hold), beat.hold);

  const start: Vec = [actorPos()[0], actorPos()[1]];
  const E = clampToPitch(beat.to, 0.5);
  const length = dist(start, E);
  const beyond = clampToPitch(add(E, scale(norm(sub(E, start)), 6)), 0.5);
  let past = false;
  state.orders.set(actor, {
    target: () => {
      if (!past && dist(actorPos(), E) <= 1) past = true;
      return past ? beyond : E;
    },
    pace: 'sprint',
    speedCap: STAGE.dribbleSpeed,
  });
  const tackler = scripted;
  state.orders.set(tackler, { target: actorPos, pace: 'sprint' });
  const progress = (): number => (length > 0 ? dist(start, actorPos()) / length : 1);
  const inRange = (): boolean => dist(state.bodies[tackler].pos, actorPos()) <= STAGE.tackleRange;
  yield* runUntil(
    state,
    () => progress() >= STAGE.tackleAfter && inRange(),
    length / speedAt(state, actor, 'sprint', STAGE.dribbleSpeed) + STAGE.tackleGrace,
  );
  const recast = false;
  let stretch = false;
  let late = false;
  if (!inRange()) {
    // The record credits this tackle to him: he lunges, and the carrier stops until he gets there.
    stretch = true;
    state.orders.set(tackler, { target: actorPos, pace: 'sprint', boost: STAGE.lunge });
    yield* runUntil(state, inRange, STAGE.tackleExtra);
    if (!inRange()) {
      const waited = state.t;
      state.orders.set(actor, { target: actorPos, pace: 'walk', speedCap: 0 });
      yield* runUntil(state, inRange, STAGE.settleMax * 10);
      late = state.t - waited > STAGE.settleMax;
    }
  }
  const at: Vec = [actorPos()[0], actorPos()[1]];
  if (beat.outcome === 'foul') {
    const ball = state.ball;
    ball.mode = 'dead';
    ball.owner = -1;
    delete ball.flight;
    state.live = false;
    pushEvent(state, {
      kind: 'foul',
      actor,
      other: tackler,
      at,
      recast,
      stretch,
      ...(late ? { late: true } : {}),
    });
    state.orders.clear();
    const fouler: Vec = [state.bodies[tackler].pos[0], state.bodies[tackler].pos[1]];
    state.orders.set(actor, { target: at, pace: 'walk' });
    state.orders.set(tackler, { target: fouler, pace: 'walk' });
    const frozen = state.t;
    yield* runUntil(state, () => state.t - frozen >= STAGE.foulFreeze - 1e-9, STAGE.foulFreeze);
  } else {
    pushEvent(state, {
      kind: 'tackle',
      actor,
      other: tackler,
      at,
      recast,
      stretch,
      ...(late ? { late: true } : {}),
    });
    giveBall(state, tackler);
  }
  state.orders.clear();
}

/**
 * `carry:loose` (a miscontrol): the holder takes his hold, then a heavy touch leaves the ball loose
 * `stage.heavyTouch` metres toward the named opponent, who collects it; no tackle or interception.
 */
export function* performMiscontrol(state: StageState, ctx: BeatContext): Generator<void, void> {
  const beat = ctx.beat;
  const actor = beat.actor;
  const opponent = beat.opponent;
  setPossession(state, beat);
  yield* ensureOwner(state, actor);
  state.orders.set(actor, holdMove(state, actor, clampToPitch(beat.to, 0.5)));
  if (opponent !== undefined) {
    state.orders.set(opponent, { target: () => state.ball.pos, pace: 'run' });
  }
  const start = state.t;
  yield* runUntil(state, holdOver(state, actor, start, beat.hold), beat.hold);
  const ball = state.ball;
  const toward = opponent !== undefined ? state.bodies[opponent].pos : clampToPitch(beat.to, 0.5);
  const point = clampToPitch(approach(ball.pos, toward, STAGE.heavyTouch), 0.5);
  ball.mode = 'loose';
  ball.owner = -1;
  delete ball.flight;
  pushEvent(state, {
    kind: 'loose',
    actor,
    ...(opponent !== undefined ? { other: opponent } : {}),
    at: [ball.pos[0], ball.pos[1]],
  });
  state.orders.delete(actor);
  // The touch runs on at least two frames before anyone can take it.
  let rolled = 0;
  while (rolled < 2 || (dist(ball.pos, point) > 0.05 && rolled < 1 / STAGING_CONFIG.tick)) {
    const p = approach(ball.pos, point, STAGING_CONFIG.ball.roll * 2 * STAGING_CONFIG.tick);
    ball.pos = [p[0], p[1]];
    yield* nextTick(state);
    rolled += 1;
  }
  if (opponent !== undefined) yield* ensureOwner(state, opponent);
  state.orders.clear();
}
