// Dead-ball scenes: before a restart beat the ball is brought to its spot at a bounded speed, the
// taker walks to it, the receiver takes his place and the other side keeps its distance; only then
// is the ball live again and the restart beat performed. The spot comes from what the stage
// recorded (where the ball went out, where the foul was), never from a new draw (ARCH-5).
import { STAGING_CONFIG } from './config';
import { CENTRE, clampToPitch, ownGoal, toAttack } from './pitch';
import type { Beat, StageEvent, TeamId, Vec } from './types';
import { RESTART_KINDS, presentPlayers } from './types';
import { keeperOf } from './participants';
import { invalidDetail } from '../script/failure';
import { runSpotScene } from './spot-kick';
import { add, clamp, dist, norm, scale, sub } from './vec';
import { giveBall } from './ball';
import { shadowPoint } from './contest';
import type { BeatContext, Handler } from './perform';
import {
  kickOffSpot,
  pushEvent,
  runUntil,
  setPossession,
  type Order,
  type StageState,
} from './world';

const RESTART = STAGING_CONFIG.stage.restart;

type RestartKind = keyof typeof RESTART.delay;

const lastEvent = (
  state: StageState,
  kinds: readonly StageEvent['kind'][],
): StageEvent | undefined => {
  for (let i = state.events.length - 1; i >= 0; i--) {
    if (kinds.includes(state.events[i].kind)) return state.events[i];
  }
  return undefined;
};

/** The restart's spot in the world frame, from what the stage recorded. */
export function restartSpot(state: StageState, beat: Beat): Vec {
  const team = beat.team;
  const fallback = clampToPitch(beat.from, 0);
  switch (beat.kind) {
    case 'kickOff':
      return CENTRE;
    case 'throwIn': {
      const out = lastEvent(state, ['out']);
      return out ? [clamp(out.at[0], 1, 104), out.at[1] < 34 ? 0 : 68] : fallback;
    }
    case 'goalKick': {
      const side = toAttack(team, beat.to, state.fixture.period)[1] < 34 ? -1 : 1;
      return toAttack(team, [5.5, 34 + 6 * side], state.fixture.period);
    }
    case 'corner': {
      const out = lastEvent(state, ['out']);
      if (!out) return fallback;
      return toAttack(
        team,
        [104.5, toAttack(team, out.at, state.fixture.period)[1] < 34 ? 0.5 : 67.5],
        state.fixture.period,
      );
    }
    case 'freeKick': {
      const foul = lastEvent(state, ['foul', 'offside']);
      return foul ? clampToPitch(foul.at, 1) : fallback;
    }
    default:
      return fallback;
  }
}

/** Where the taker stands: off the touchline or corner away from the centre, else goal-side of the spot. */
const takerPlace = (state: StageState, kind: RestartKind, team: TeamId, spot: Vec): Vec => {
  const away =
    kind === 'throwIn' || kind === 'corner'
      ? sub(spot, CENTRE)
      : sub(ownGoal(team, state.fixture.period), spot);
  return add(spot, scale(norm(away), RESTART.takerOffset));
};

type PlaceOrder = (index: number, place: Vec, pace: Order['pace'], within: number) => void;

/**
 * Both sides' places at a corner. The taking side: the receiver at his run-up point, the others
 * (record line order; the receiver is already scripted) on `corner.attack`, with two or three back. The
 * defending side: the keeper on his line, the scripted opponent goal-side of the receiver, two
 * zonal, one or two left up and the rest protecting the box goal-side of the attackers.
 */
function cornerScene(state: StageState, beat: Beat, spot: Vec, order: PlaceOrder): void {
  const CORNER = STAGING_CONFIG.stage.corner;
  const T = beat.team;
  const s = toAttack(T, spot, state.fixture.period)[1] > 34 ? 1 : -1;
  const C = (x: number, off: number): Vec => toAttack(T, [x, 34 + s * off], state.fixture.period);
  const fixture = state.fixture;
  const taker = beat.actor;
  const receiver = beat.receiver;
  let runUp: Vec | undefined;
  if (receiver !== undefined) {
    const aim = toAttack(T, clampToPitch(beat.to, 0.5), state.fixture.period);
    runUp = clampToPitch(
      toAttack(T, [aim[0] - STAGING_CONFIG.stage.cross.runUp, aim[1]], state.fixture.period),
      0.5,
    );
    order(receiver, runUp, 'run', RESTART.receiverReady);
  }
  const attackers = presentPlayers(fixture, T)
    .filter((p) => p.slot !== 0 && p.index !== taker && p.index !== receiver)
    .sort((a, b) => a.index - b.index);
  const counts = STAGING_CONFIG.stage.scene.corner;
  const draw = (range: readonly [number, number]) =>
    range[0] + Math.floor(state.motion() * (range[1] - range[0] + 1));
  const back = Math.min(attackers.length, draw(counts.back));
  const up = draw(counts.up);
  const places: Vec[] = [];
  attackers.forEach((p, i) => {
    const at =
      i >= attackers.length - back
        ? counts.backPlaces[i - (attackers.length - back)]
        : CORNER.attack[i];
    if (!at) return;
    places.push([at[0], at[1]]);
    order(p.index, C(at[0], at[1]), 'run', RESTART.receiverReady);
  });
  const D: TeamId = T === 0 ? 1 : 0;
  const keeper = keeperOf(state, D);
  order(keeper, C(CORNER.keeper[0], CORNER.keeper[1]), 'run', RESTART.takerReady);
  const scripted = beat.opponent;
  if (scripted !== undefined && fixture.players[scripted].slot !== 0 && runUp) {
    const r = toAttack(T, runUp, state.fixture.period);
    order(
      scripted,
      toAttack(T, [r[0] + CORNER.goalSide, r[1]], state.fixture.period),
      'run',
      RESTART.receiverReady,
    );
  }
  const rest = presentPlayers(fixture, D)
    .filter((p) => p.slot !== 0 && p.index !== scripted)
    .map((p) => p.index);
  rest.forEach((index, i) => {
    let target: Vec | undefined;
    if (i < 2) target = C(CORNER.zonal[i][0], CORNER.zonal[i][1]);
    else if (i >= rest.length - up) {
      const outlet = CORNER.up[i - (rest.length - up)];
      target = C(outlet[0], outlet[1]);
    } else {
      const man = places[i - 2];
      if (man) target = C(Math.max(counts.defendX, man[0]) + CORNER.goalSide, man[1]);
    }
    if (target) order(index, target, 'run', RESTART.receiverReady);
  });
}

/** Dead time before a restart beat: the ball goes to the spot, players take their places, then the taker has it. */
export function* runDeadBall(state: StageState, ctx: BeatContext): Generator<void, void> {
  if (ctx.beat.kind === 'penalty' || ctx.beat.kind === 'shootoutKick')
    return yield* runSpotScene(state, ctx);
  if (state.tickCount === 0) return;
  const beat = ctx.beat;
  const kind = beat.kind as RestartKind;
  const taker = beat.actor;
  setPossession(state, beat);
  state.live = false;
  const spot = restartSpot(state, beat);
  state.shapeBall = spot;
  state.retrieve = spot;
  const ball = state.ball;
  ball.mode = 'dead';
  ball.owner = -1;
  delete ball.flight;
  const radius = RESTART.distance[kind];
  const other: TeamId = beat.team === 0 ? 1 : 0;
  if (radius > 0) state.keepOut = { centre: spot, radius, team: other };
  else delete state.keepOut;

  state.orders.clear();
  const places = new Map<number, { place: Vec; within: number }>();
  const order: PlaceOrder = (index, place, pace, within) => {
    state.orders.set(index, { target: place, pace });
    places.set(index, { place, within });
  };
  order(taker, takerPlace(state, kind, beat.team, spot), 'run', RESTART.takerReady);
  if (kind === 'kickOff') {
    for (const p of presentPlayers(state.fixture, 0).concat(presentPlayers(state.fixture, 1))) {
      if (p.index === taker) continue;
      order(p.index, kickOffSpot(state.fixture, p.index, beat.team, taker), 'jog', 1);
    }
  } else if (kind === 'corner') {
    cornerScene(state, beat, spot, order);
  } else if (beat.receiver !== undefined) {
    order(beat.receiver, clampToPitch(beat.to, 0.5), 'jog', RESTART.receiverReady);
  }
  // The restart pass's scripted interceptor waits on its lane, as `cueNext` sends one in open play,
  // outside the distance his side keeps.
  const cutter = beat.outcome === 'intercepted' ? beat.opponent : undefined;
  if (
    cutter !== undefined &&
    kind !== 'kickOff' &&
    kind !== 'corner' &&
    state.fixture.players[cutter].slot !== 0
  ) {
    let place = shadowPoint(other, spot, clampToPitch(beat.to, 0.5), state.fixture.period);
    const off = sub(place, spot);
    if (radius > 0 && dist(place, spot) < radius) {
      place = clampToPitch(add(spot, scale(norm(off), radius + 0.5)), 0.5);
    }
    order(cutter, place, 'jog', RESTART.receiverReady);
  }
  const start = state.t;
  // A paced staging takes the restart quickly or calmly to keep time (stage/pace.ts).
  const delay = state.restartDelay ?? RESTART.delay[kind];
  const ready = (): boolean => {
    if (state.t - start < delay - 1e-9) return false;
    if (dist(ball.pos, spot) > 0.1) return false;
    for (const [index, { place, within }] of places) {
      if (dist(state.bodies[index].pos, place) > within) return false;
    }
    return true;
  };
  yield* runUntil(state, ready, delay + RESTART.maxExtra);
  // A late participant finishes his bounded route rather than being placed at a timeout.
  if (!ready()) yield* runUntil(state, ready, STAGING_CONFIG.stage.scene.maxTravel);
  if (!ready()) throw invalidDetail('staging:input');
  pushEvent(state, { kind: 'settled', actor: taker, at: spot });

  ball.pos = [spot[0], spot[1]];
  delete state.retrieve;
  delete state.shapeBall;
  delete state.keepOut;
  // A corner's places hold through the delivery; the pass handler releases them.
  if (kind !== 'corner') state.orders.clear();
  state.live = true;
  giveBall(state, taker);
  pushEvent(state, { kind: 'restart', actor: taker, at: spot });
}

/** `handler`, after a dead-ball scene when the beat's kind is a restart. */
export function withRestart(handler: Handler): Handler {
  return function* (state, ctx) {
    if (RESTART_KINDS.includes(ctx.beat.kind) || ctx.beat.kind === 'shootoutKick')
      yield* runDeadBall(state, ctx);
    yield* handler(state, ctx);
  };
}
