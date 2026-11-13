/**
 * Keep-ball (MATCH-12): the record writes no play for the time between a half's last recorded beat
 * and its whistle (added time above all), yet real football goes on. The side on the ball keeps
 * it with short safe passes to free team-mates until the whistle. Presentation only: these passes
 * belong to the half's last beat, change no score or count, and never lose the ball.
 */
import { STAGING_CONFIG } from './config';
import { nearestOpponent } from './contest';
import { canReceive, holdUntil, kickTo, roomyAim } from './pass';
import { toAttack } from './pitch';
import { onPitch } from './types';
import { dist } from './vec';
import { ensureOwner, pushEvent, runUntil, type StageState } from './world';

/**
 * Module constants, not lab tunables. `hold`: seconds on the ball, from `hold[0]` up to `hold[1]`;
 * `range`: metres a keep-ball pass goes; `back`: metres back toward his own goal it goes at most;
 * `stop`: seconds before the whistle the last pass is played by.
 */
export const KEEP = { hold: [1.2, 3], range: [8, 30], back: 15, stop: 3 } as const;

/** The freest team-mate in range: farthest from his nearest opponent, then nearest the ball. */
function keeper(state: StageState, actor: number): number {
  const team = state.fixture.players[actor].team;
  const at = state.bodies[actor].pos;
  const ahead = toAttack(team, at, state.fixture.period)[0];
  let best = -1,
    score = -Infinity;
  for (const p of state.fixture.players) {
    if (p.team !== team || p.index === actor || p.slot === 0 || !onPitch(state.fixture, p.index))
      continue;
    const pos = state.bodies[p.index].pos;
    const d = dist(at, pos);
    if (d < KEEP.range[0] || d > KEEP.range[1]) continue;
    if (toAttack(team, pos, state.fixture.period)[0] < ahead - KEEP.back) continue;
    const free = Math.min(10, nearestOpponent(state, p.index).distance);
    const s = free - d * 0.05;
    if (s > score) {
      score = s;
      best = p.index;
    }
  }
  return best;
}

/** Keeps the ball until about `until` (staged seconds); returns at once without a held ball. */
export function* keepBall(state: StageState, until: number): Generator<void, void> {
  const speed = STAGING_CONFIG.ball.ground;
  while (state.t < until - KEEP.stop && state.ball.mode === 'held' && state.ball.owner >= 0) {
    const actor = state.ball.owner;
    const receiver = keeper(state, actor);
    const hold = KEEP.hold[0] + (KEEP.hold[1] - KEEP.hold[0]) * state.motion();
    if (receiver < 0) {
      const start = state.t;
      yield* runUntil(state, () => state.t - start >= hold - 1e-9, hold);
      continue;
    }
    state.team = state.fixture.players[actor].team;
    const to = roomyAim(state, receiver, [...state.bodies[receiver].pos]);
    yield* holdUntil(state, actor, receiver, to, hold, (reached) =>
      reached ? true : canReceive(state, receiver, to, speed),
    );
    if (state.t >= until - KEEP.stop) break;
    yield* kickTo(state, actor, receiver, to, speed, false);
    yield* ensureOwner(state, receiver);
    pushEvent(state, {
      kind: 'receive',
      actor,
      other: receiver,
      at: [state.ball.pos[0], state.ball.pos[1]],
    });
    state.orders.clear();
  }
  const rest = until - state.t;
  if (rest > 0 && state.ball.mode === 'held')
    yield* runUntil(state, () => state.t >= until - 1e-9, rest);
}
