// Shots, and free kicks struck at goal. The shooter sets himself a stride toward goal (a scripted
// blocker closes him down meanwhile), strikes, and the ball goes where the script says: into the
// net past a keeper who cannot reach it, to the keeper who gets to it (held, or parried behind for
// the corner that follows), into the blocker who meets it on its way, or past the post.
import { PROTO_CONFIG } from '../core/config.ts';
import { clampToPitch, toAttack } from '../core/pitch.ts';
import type { TeamId, Vec } from '../core/types.ts';
import {
  add,
  approach,
  clamp,
  closestOnSegment,
  dist,
  lerp,
  norm,
  scale,
  sub,
} from '../core/vec.ts';
import { flightTime, giveBall, startFlightTimed } from './ball.ts';
import { resolveCut } from './contest.ts';
import { paceSpeed, timeToReach } from './motion.ts';
import type { BeatContext } from './perform.ts';
import { ensureOwner, pushEvent, runUntil, setPossession, type StageState } from './world.ts';

const STAGE = PROTO_CONFIG.stage;
const SHOT = STAGE.shot;
const BALL = PROTO_CONFIG.ball;
const TICK = PROTO_CONFIG.tick;

const untilLanded = (state: StageState, flight: { t1: number }): void =>
  runUntil(state, () => state.t >= flight.t1 - 1e-9, flight.t1 - state.t + TICK);

/** Runs until `share` of the flight that started now and lasts `total` seconds has passed. */
const untilShare = (state: StageState, share: number, total: number): void => {
  const t0 = state.t;
  runUntil(state, () => state.t - t0 >= share * total - 1e-9, total + TICK);
};

const deadBall = (state: StageState): void => {
  const ball = state.ball;
  ball.mode = 'dead';
  ball.owner = -1;
  ball.z = 0;
  delete ball.flight;
  state.live = false;
};

/** From `from`, behind the goal line beside the post nearer `from` (a parry or deflection for a corner). */
const behindForCorner = (state: StageState, T: TeamId, from: Vec, actor: number): void => {
  const y = toAttack(T, from)[1];
  const side = y >= 34 ? 1 : -1;
  const target = toAttack(T, [105.8, clamp(y + side * SHOT.parryWide, 2, 66)]);
  // A parry beside the post takes `parryTime`; a block far out runs there at deflection speed.
  const time = Math.max(SHOT.parryTime, dist(from, target) / SHOT.deflectSpeed);
  untilLanded(state, startFlightTimed(state, target, time, 0.5));
  deadBall(state);
  pushEvent(state, { kind: 'out', actor, at: clampToPitch(target, 0) });
};

/** `shot:goal`, `shot:saved`, `shot:blocked` and `shot:wide`. */
export function performShot(state: StageState, ctx: BeatContext): void {
  const beat = ctx.beat;
  const T = beat.team;
  const actor = beat.actor;
  setPossession(state, beat);
  ensureOwner(state, actor);
  const other: TeamId = T === 0 ? 1 : 0;
  const K = state.fixture.teams[other].players[0].index;
  let G: Vec = beat.to;
  const speed = beat.header ? BALL.header : BALL.shot;
  const apex = beat.header ? BALL.headerApex : 0;
  const actorPos = (): Vec => state.bodies[actor].pos;
  const towardGoal = (d: number) => (): Vec => add(actorPos(), scale(norm(sub(G, actorPos())), d));
  state.orders.set(actor, { target: towardGoal(SHOT.setStep), pace: 'walk' });
  if (beat.outcome === 'blocked' && beat.opponent !== undefined) {
    state.orders.set(beat.opponent, { target: towardGoal(SHOT.blockDist), pace: 'sprint' });
  }
  const start = state.t;
  runUntil(state, () => state.t - start >= beat.hold - 1e-9, beat.hold);

  const from: Vec = [state.ball.pos[0], state.ball.pos[1]];
  pushEvent(state, { kind: 'shot', actor, at: from });
  state.orders.clear();

  if (beat.outcome === 'goal') {
    const E = add(G, scale(norm(sub(G, from)), SHOT.netDepth));
    const total = flightTime(from, E, speed);
    const flight = startFlightTimed(state, E, total, apex);
    state.orders.set(K, { target: G, pace: 'sprint', speedCap: SHOT.beatenKeeper });
    untilShare(state, dist(from, G) / dist(from, E), total);
    state.score[T] += 1;
    pushEvent(state, { kind: 'goal', actor, at: G, score: [state.score[0], state.score[1]] });
    state.live = false;
    untilLanded(state, flight);
    deadBall(state);
  } else if (beat.outcome === 'saved') {
    const keeper = state.bodies[K];
    const reach = paceSpeed('sprint', state.fixture.players[K]) + STAGE.lunge;
    const plan = (): { point: Vec; time: number } => {
      const c = closestOnSegment(from, G, keeper.pos);
      const param = clamp(c.t, SHOT.saveMin, 1);
      return { point: lerp(from, G, param), time: param * flightTime(from, G, speed) };
    };
    let save = plan();
    for (let i = 0; i < 6; i++) {
      if (timeToReach(keeper, save.point, reach) <= save.time + STAGE.cutSlack) break;
      G = [G[0], G[1] + (keeper.pos[1] - G[1]) * SHOT.saveNudge];
      save = plan();
    }
    const flight = startFlightTimed(state, save.point, save.time, apex);
    state.orders.set(K, { target: save.point, pace: 'sprint', boost: STAGE.lunge });
    untilLanded(state, flight);
    pushEvent(state, { kind: 'save', actor, other: K, at: save.point });
    if (ctx.next?.kind === 'corner') behindForCorner(state, T, save.point, actor);
    else giveBall(state, K);
  } else if (beat.outcome === 'blocked') {
    const scripted = beat.opponent;
    if (scripted === undefined) throw new Error('block without opponent ' + beat.index);
    const L = Math.max(dist(from, G), 1e-6);
    const lo = Math.min(SHOT.blockMin / L, 0.9);
    const range: [number, number] = [lo, Math.max(lo, Math.min(0.9, SHOT.blockMax / L))];
    const r = resolveCut(state, scripted, from, G, flightTime(from, G, speed), range);
    const blocker = r.plan.opponent;
    state.orders.set(blocker, {
      target: r.plan.point,
      pace: 'sprint',
      boost: r.stretch ? STAGE.lunge : 0,
    });
    untilLanded(state, startFlightTimed(state, r.plan.point, r.plan.time, apex));
    const at = r.plan.point;
    pushEvent(state, {
      kind: 'block',
      actor,
      other: blocker,
      at,
      recast: r.recast,
      stretch: r.stretch,
    });
    const next = ctx.next;
    if (next?.kind === 'corner') {
      behindForCorner(state, T, at, actor);
    } else if (next?.kind === 'throwIn') {
      const a = toAttack(T, at);
      const y = a[1] < 34 ? -SHOT.wideRun : 68 + SHOT.wideRun;
      const target = toAttack(T, [a[0], y]);
      untilLanded(state, startFlightTimed(state, target, dist(at, target) / SHOT.deflectSpeed, 0));
      deadBall(state);
      pushEvent(state, { kind: 'out', actor, at: clampToPitch(target, 0) });
    } else {
      if (next) {
        const toward = state.bodies[next.actor].pos;
        const target = approach(at, toward, Math.min(SHOT.looseRoll, dist(at, toward)));
        untilLanded(state, startFlightTimed(state, target, SHOT.looseTime, 0));
      }
      const ball = state.ball;
      ball.mode = 'loose';
      ball.owner = -1;
      ball.z = 0;
      delete ball.flight;
    }
  } else {
    const E = add(G, scale(norm(sub(G, from)), SHOT.wideRun));
    const total = flightTime(from, E, speed);
    const flight = startFlightTimed(state, E, total, apex);
    untilShare(state, dist(from, G) / dist(from, E), total);
    pushEvent(state, { kind: 'wide', actor, at: G });
    untilLanded(state, flight);
    deadBall(state);
  }
  state.orders.clear();
}
