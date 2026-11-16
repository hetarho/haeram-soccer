import { STAGING_CONFIG } from './config';
import { PITCH } from './pitch';
import { onPitch, presentPlayers, RESTART_KINDS, type Vec } from './types';
import { clamp, dist, dot, sub } from './vec';
import type { StageState } from './world';

// The fixed support experiment's geometry, not extra tactic or lab coefficients.
const SUPPORT = { near: 8, far: 25, start: 0.15, end: 0.85, screen: 1.5 };
const UNMARK = STAGING_CONFIG.shape.unmark;

/** Worst clearance from an opponent to the interior of the ball-to-target passing lane. */
export function supportClearance(ball: Vec, target: Vec, opponents: readonly Vec[]): number {
  const lane = sub(target, ball);
  const length2 = dot(lane, lane);
  if (length2 === 0) return Infinity;
  let clearance = Infinity;
  for (const opponent of opponents) {
    const projection = dot(sub(opponent, ball), lane) / length2;
    if (projection <= SUPPORT.start || projection >= SUPPORT.end) continue;
    const nearest: Vec = [ball[0] + lane[0] * projection, ball[1] + lane[1] * projection];
    clearance = Math.min(clearance, dist(opponent, nearest));
  }
  return clearance;
}

/** Open only a screened nearby lane, retaining depth and an already open target exactly. */
export function openSupportAngle(ball: Vec, target: Vec, opponents: readonly Vec[]): Vec {
  const range = dist(ball, target);
  if (range < SUPPORT.near || range > SUPPORT.far) return target;
  // Nearby-marker avoidance owns these endpoints; never stack a second lateral move onto it.
  if (opponents.some((p) => dist(p, target) < UNMARK.radius)) return target;
  let best = supportClearance(ball, target, opponents);
  if (best >= SUPPORT.screen) return target;
  let result = target;
  for (const direction of [-1, 1]) {
    const candidate: Vec = [
      target[0],
      clamp(
        target[1] + direction * UNMARK.step,
        STAGING_CONFIG.margin,
        PITCH.width - STAGING_CONFIG.margin,
      ),
    ];
    if (opponents.some((p) => dist(p, candidate) < UNMARK.radius)) continue;
    const clearance = supportClearance(ball, candidate, opponents);
    if (clearance > best) {
      best = clearance;
      result = candidate;
    }
  }
  return result;
}

/** Only free, live, same-side held-ball support in build-up/progression opens a new angle. */
export function supportTarget(
  state: StageState,
  index: number,
  target: Vec,
  snapshot: readonly Vec[],
): Vec {
  const player = state.fixture.players[index];
  const owner = state.fixture.players[state.ball.owner];
  if (
    !state.live ||
    state.ball.mode !== 'held' ||
    (state.phase !== 'buildUp' && state.phase !== 'progression') ||
    (state.action !== undefined && RESTART_KINDS.includes(state.action)) ||
    !player ||
    player.slot === 0 ||
    player.team !== state.team ||
    index === state.ball.owner ||
    !owner ||
    owner.team !== player.team ||
    !onPitch(state.fixture, index) ||
    !onPitch(state.fixture, owner.index) ||
    state.orders.has(index) ||
    state.cues.has(index)
  )
    return target;
  const opponents = presentPlayers(state.fixture, player.team === 0 ? 1 : 0).map(
    (p) => snapshot[p.index],
  );
  return openSupportAngle(state.ball.pos, target, opponents);
}
