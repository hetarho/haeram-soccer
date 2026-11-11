/** A penalty and a kick after the final whistle use the same lawful preparation. */
import { STAGING_CONFIG } from './config';
import { BOX_Y, HALFWAY, PENALTY_X, toAttack } from './pitch';
import { keeperOf, stopPlay } from './participants';
import type { BeatContext } from './perform';
import type { TeamId, Vec } from './types';
import { presentPlayers } from './types';
import { dist } from './vec';
import { pushEvent, runUntil, setPossession, type StageState } from './world';
import { invalidDetail } from '../script/failure';

const SCENE = STAGING_CONFIG.stage.scene;
const PLACES = SCENE.spotPlaces;

export function* runSpotScene(state: StageState, ctx: BeatContext): Generator<void, void> {
  const beat = ctx.beat;
  const shootout = beat.kind === 'shootoutKick';
  const T = beat.team;
  const D = (1 - T) as TeamId;
  setPossession(state, beat);
  stopPlay(state);
  // Every shoot-out kick is at the end home attacked in period four, regardless of the taker.
  const world = (point: Vec): Vec =>
    toAttack(shootout ? 0 : T, point, shootout ? 4 : state.fixture.period);
  const spot = world([PENALTY_X, 34]);
  state.retrieve = spot;
  state.shapeBall = spot;
  const keeper = keeperOf(state, D);
  const waitingKeeper = keeperOf(state, T);
  const places = new Map<number, Vec>();
  for (const side of [0, 1] as const) {
    const players = presentPlayers(state.fixture, side);
    players.forEach((p, i) => {
      let place: Vec;
      if (p.index === beat.actor) place = [PENALTY_X - STAGING_CONFIG.ball.carryOffset, 34];
      else if (p.index === keeper) place = [105, 34];
      else if (shootout && p.index === waitingKeeper) place = [105, BOX_Y[0]];
      else if (shootout)
        place = [
          HALFWAY + (side === 0 ? -1 : 1) * PLACES.halfwayOffset,
          PLACES.halfwayFirstY + i * PLACES.halfwayStepY,
        ];
      else if (p.index === waitingKeeper) place = [PLACES.waitingKeeperX, 34];
      else
        place = [
          PENALTY_X - SCENE.penaltyDistance - SCENE.penaltyGap - (i % 2) * PLACES.penaltyRowDepth,
          PLACES.penaltyFirstY + i * PLACES.penaltyStepY,
        ];
      const target = world(place);
      places.set(p.index, target);
      state.orders.set(p.index, { target, pace: 'run' });
    });
  }
  const duration = shootout ? SCENE.shootout : SCENE.penalty;
  const start = state.t;
  const ready = () =>
    state.t - start >= duration - 1e-9 &&
    dist(state.ball.pos, spot) <= 0.01 &&
    [...places].every(([index, target]) => dist(state.bodies[index].pos, target) <= SCENE.ready);
  yield* runUntil(state, ready, duration + SCENE.maxTravel);
  if (!ready()) throw invalidDetail('staging:input');
  // Retrieval has reached its spot; this assignment only removes sub-centimetre rounding.
  state.ball.pos = [...spot];
  delete state.retrieve;
  delete state.shapeBall;
  state.live = true;
  pushEvent(state, {
    kind: 'restart',
    actor: beat.actor,
    at: spot,
    ...(shootout ? { shootout: true } : { penalty: true }),
  });
}
