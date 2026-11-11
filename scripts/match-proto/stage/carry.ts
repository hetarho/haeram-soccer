// Carries. A completed carry: the carrier holds the ball for the beat's hold, then dribbles to the
// carry's end at a dribbling pace; the ball stays at his feet through `updateBall`. A carry (or a
// take-on) that is tackled or fouled: the scripted opponent jockeys goal-side while the carrier
// holds, then chases him as he runs, and wins the ball (or fouls him) once he is close enough; if he
// cannot get there, the nearest opponent lunges in instead.
import { PROTO_CONFIG } from '../core/config.ts';
import { clampToPitch } from '../core/pitch.ts';
import type { Vec } from '../core/types.ts';
import { add, approach, dist, norm, scale, sub } from '../core/vec.ts';
import { giveBall } from './ball.ts';
import { holdMove } from './pass.ts';
import { cueNext, jockeyPoint, nearestOpponent } from './contest.ts';
import type { BeatContext } from './perform.ts';
import { ensureOwner, pushEvent, runUntil, setPossession, step, type StageState } from './world.ts';

const STAGE = PROTO_CONFIG.stage;

/** `carry:complete`. */
export function performCarry(state: StageState, ctx: BeatContext): void {
  const beat = ctx.beat;
  const actor = beat.actor;
  setPossession(state, beat);
  ensureOwner(state, actor);
  const end = clampToPitch(beat.to, 0.5);
  state.orders.set(actor, holdMove(state, actor, end, true));
  const start = state.t;
  runUntil(state, () => state.t - start >= beat.hold - 1e-9, beat.hold);
  const d = dist(state.bodies[actor].pos, end);
  state.orders.set(actor, { target: end, pace: 'sprint', speedCap: STAGE.dribbleSpeed });
  cueNext(state, ctx, end);
  runUntil(
    state,
    () => dist(state.bodies[actor].pos, end) <= STAGE.arrive,
    (d / STAGE.dribbleSpeed) * 1.5 + 2,
  );
  state.orders.clear();
}

/** `carry:tackled`, `carry:foul`, `takeOn:tackled` and `takeOn:foul`. */
export function performCarryLost(state: StageState, ctx: BeatContext): void {
  const beat = ctx.beat;
  const actor = beat.actor;
  const scripted = beat.opponent;
  if (scripted === undefined) throw new Error('tackle without opponent ' + beat.index);
  setPossession(state, beat);
  ensureOwner(state, actor);
  const team = state.fixture.players[scripted].team;
  const actorPos = (): Vec => state.bodies[actor].pos;
  state.orders.set(actor, holdMove(state, actor, clampToPitch(beat.to, 0.5), true));
  state.orders.set(scripted, { target: () => jockeyPoint(team, actorPos()), pace: 'run' });
  const holdStart = state.t;
  runUntil(state, () => state.t - holdStart >= beat.hold - 1e-9, beat.hold);

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
  let tackler = scripted;
  state.orders.set(tackler, { target: actorPos, pace: 'sprint' });
  const progress = (): number => (length > 0 ? dist(start, actorPos()) / length : 1);
  const inRange = (): boolean => dist(state.bodies[tackler].pos, actorPos()) <= STAGE.tackleRange;
  runUntil(
    state,
    () => progress() >= STAGE.tackleAfter && inRange(),
    length / STAGE.dribbleSpeed + STAGE.tackleGrace,
  );
  let recast = false;
  let stretch = false;
  let late = false;
  if (!inRange() && state.bound) {
    // The record credits this tackle to him: he lunges, and the carrier stops until he gets there.
    stretch = true;
    state.orders.set(tackler, { target: actorPos, pace: 'sprint', boost: STAGE.lunge });
    runUntil(state, inRange, STAGE.tackleExtra);
    if (!inRange()) {
      const waited = state.t;
      state.orders.set(actor, { target: actorPos, pace: 'walk', speedCap: 0 });
      runUntil(state, inRange, STAGE.settleMax * 10);
      late = state.t - waited > STAGE.settleMax;
    }
  } else if (!inRange()) {
    tackler = nearestOpponent(state, actor).index;
    recast = tackler !== scripted;
    stretch = true;
    state.orders.set(tackler, { target: actorPos, pace: 'sprint', boost: STAGE.lunge });
    runUntil(state, inRange, STAGE.tackleExtra);
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
    runUntil(state, () => state.t - frozen >= STAGE.foulFreeze - 1e-9, STAGE.foulFreeze);
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
export function performMiscontrol(state: StageState, ctx: BeatContext): void {
  const beat = ctx.beat;
  const actor = beat.actor;
  const opponent = beat.opponent;
  setPossession(state, beat);
  ensureOwner(state, actor);
  state.orders.set(actor, holdMove(state, actor, clampToPitch(beat.to, 0.5)));
  if (opponent !== undefined) {
    state.orders.set(opponent, { target: () => state.ball.pos, pace: 'run' });
  }
  const start = state.t;
  runUntil(state, () => state.t - start >= beat.hold - 1e-9, beat.hold);
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
  while (rolled < 2 || (dist(ball.pos, point) > 0.05 && rolled < 1 / PROTO_CONFIG.tick)) {
    const p = approach(ball.pos, point, PROTO_CONFIG.ball.roll * 2 * PROTO_CONFIG.tick);
    ball.pos = [p[0], p[1]];
    step(state);
    rolled += 1;
  }
  if (opponent !== undefined) ensureOwner(state, opponent);
  state.orders.clear();
}
