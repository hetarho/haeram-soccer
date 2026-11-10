// Dead-ball scenes: before a restart beat the ball is brought to its spot at a bounded speed, the
// taker walks to it, the receiver takes his place and the other side keeps its distance; only then
// is the ball live again and the restart beat performed. The spot comes from what the stage
// recorded (where the ball went out, where the foul was), never from a new draw (ARCH-5).
import { PROTO_CONFIG } from '../core/config.ts';
import { CENTRE, clampToPitch, ownGoal, toAttack } from '../core/pitch.ts';
import type { Beat, StageEvent, TeamId, Vec } from '../core/types.ts';
import { RESTART_KINDS } from '../core/types.ts';
import { add, clamp, dist, norm, scale, sub } from '../core/vec.ts';
import { giveBall } from './ball.ts';
import type { BeatContext, Handler } from './perform.ts';
import {
  kickOffSpot,
  pushEvent,
  runUntil,
  setPossession,
  type Order,
  type StageState,
} from './world.ts';

const RESTART = PROTO_CONFIG.stage.restart;

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
      const side = toAttack(team, beat.to)[1] < 34 ? -1 : 1;
      return toAttack(team, [5.5, 34 + 6 * side]);
    }
    case 'corner': {
      const out = lastEvent(state, ['out']);
      if (!out) return fallback;
      return toAttack(team, [104.5, toAttack(team, out.at)[1] < 34 ? 0.5 : 67.5]);
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
const takerPlace = (kind: RestartKind, team: TeamId, spot: Vec): Vec => {
  const away =
    kind === 'throwIn' || kind === 'corner' ? sub(spot, CENTRE) : sub(ownGoal(team), spot);
  return add(spot, scale(norm(away), RESTART.takerOffset));
};

/** Dead time before a restart beat: the ball goes to the spot, players take their places, then the taker has it. */
export function runDeadBall(state: StageState, ctx: BeatContext): void {
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
  const order = (index: number, place: Vec, pace: Order['pace'], within: number): void => {
    state.orders.set(index, { target: place, pace });
    places.set(index, { place, within });
  };
  order(taker, takerPlace(kind, beat.team, spot), 'run', RESTART.takerReady);
  if (kind === 'kickOff') {
    for (const p of state.fixture.players) {
      if (p.index === taker) continue;
      order(p.index, kickOffSpot(state.fixture, p.index, beat.team, taker), 'jog', 1);
    }
  } else if (beat.receiver !== undefined) {
    order(beat.receiver, clampToPitch(beat.to, 0.5), 'jog', RESTART.receiverReady);
  }
  const start = state.t;
  const delay = RESTART.delay[kind];
  const ready = (): boolean => {
    if (state.t - start < delay - 1e-9) return false;
    if (dist(ball.pos, spot) > 0.1) return false;
    for (const [index, { place, within }] of places) {
      if (dist(state.bodies[index].pos, place) > within) return false;
    }
    return true;
  };
  runUntil(state, ready, delay + RESTART.maxExtra);

  ball.pos = [spot[0], spot[1]];
  delete state.retrieve;
  delete state.shapeBall;
  delete state.keepOut;
  state.orders.clear();
  state.live = true;
  giveBall(state, taker);
  pushEvent(state, { kind: 'restart', actor: taker, at: spot });
}

/** `handler`, after a dead-ball scene when the beat's kind is a restart. */
export function withRestart(handler: Handler): Handler {
  return (state, ctx) => {
    if (RESTART_KINDS.includes(ctx.beat.kind)) runDeadBall(state, ctx);
    handler(state, ctx);
  };
}
