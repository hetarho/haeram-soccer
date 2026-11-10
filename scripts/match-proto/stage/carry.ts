// A completed carry: the carrier holds the ball for the beat's hold, then dribbles to the carry's
// end at a dribbling pace; the ball stays at his feet through `updateBall`.
import { PROTO_CONFIG } from '../core/config.ts';
import { clampToPitch } from '../core/pitch.ts';
import { dist } from '../core/vec.ts';
import type { BeatContext } from './perform.ts';
import { ensureOwner, runUntil, setPossession, type StageState } from './world.ts';

const STAGE = PROTO_CONFIG.stage;

/** `carry:complete`. */
export function performCarry(state: StageState, ctx: BeatContext): void {
  const beat = ctx.beat;
  const actor = beat.actor;
  setPossession(state, beat);
  ensureOwner(state, actor);
  state.orders.set(actor, { target: () => state.bodies[actor].pos, pace: 'walk' });
  const start = state.t;
  runUntil(state, () => state.t - start >= beat.hold - 1e-9, beat.hold);
  const end = clampToPitch(beat.to, 0.5);
  const d = dist(state.bodies[actor].pos, end);
  state.orders.set(actor, { target: end, pace: 'sprint', speedCap: STAGE.dribbleSpeed });
  runUntil(
    state,
    () => dist(state.bodies[actor].pos, end) <= STAGE.arrive,
    (d / STAGE.dribbleSpeed) * 1.5 + 2,
  );
  state.orders.clear();
}
