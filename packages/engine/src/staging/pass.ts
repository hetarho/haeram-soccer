import { presentPlayers } from './types';
import { PORTABLE_MATH } from '../portable-math';
import { invalidDetail } from '../script/failure';
// Pass-like beats. A completed pass: the passer holds and takes a touch toward his pass while the
// receiver moves to the reception point, the ball is kicked once the receiver can be there when it
// arrives (else to the nearest point he can reach), and the receiver takes it. An intercepted pass
// is kicked once its interceptor can meet it and ends at his feet; a pass out of play runs past
// the line and leaves the ball dead. A pressed pass also waits for its presser to be visibly close.
// `holdForPass`, `reachablePoint` and `kickTo` are the steps T797 reuses for its own beats.
import { STAGING_CONFIG } from './config';
import { CENTRE, HALFWAY, PITCH, clampToPitch, inBox, inPitch, toAttack } from './pitch';
import { offsideLineX } from './places';
import type { Beat, TeamId, Vec } from './types';
import { add, approach, dist, dot, len, norm, perp, scale, sub } from './vec';
import { apexFor, flightTime, startFlight, startFlightTimed } from './ball';
import { cueNext, cutRange, nearestOpponent, planCut, resolveCut, shadowPoint } from './contest';
import { speedAt, timeToReach } from './motion';
import type { BeatContext } from './perform';
import { performThrough } from './through';
import { pressedOff } from './release';
import {
  ensureOwner,
  isLate,
  positionsOf,
  pushEvent,
  runUntil,
  setPossession,
  type Order,
  type StageState,
} from './world';

const SHAPE = STAGING_CONFIG.shape;
const STAGE = STAGING_CONFIG.stage;
const MOTION = STAGING_CONFIG.motion;
const BALL = STAGING_CONFIG.ball;

/**
 * Metres a held-up man's opponent must be off before the man may choose a new line (`holdMove`);
 * a module constant rather than a lab tunable (the lab catalog lists only the config objects).
 */
const HELD_RELEASE = 4.5;

const sprintOf = (state: StageState, index: number): number => speedAt(state, index, 'sprint');

const speedOf = (beat: Beat): number => (beat.loft ? BALL.loft : BALL.ground);

/** The receiver can sprint to `to` before a kick from the ball's place at `speed` gets there; no receiver always can. */
export function canReceive(
  state: StageState,
  receiver: number | undefined,
  to: Vec,
  speed: number,
): boolean {
  if (receiver === undefined) return true;
  if (dist(state.bodies[receiver].pos, to) <= STAGE.controlRange) return true;
  return (
    timeToReach(state.bodies[receiver], to, sprintOf(state, receiver)) <=
    flightTime(state.ball.pos, to, speed) + STAGE.receiveSlack
  );
}

/** For a pressed beat, true once the nearest opponent is within `stage.pressVisible` of the actor. */
export function pressWait(state: StageState, beat: Beat): () => boolean {
  return () =>
    beat.reason !== 'pressed' || nearestOpponent(state, beat.actor).distance <= STAGE.pressVisible;
}

/** Unit `h` turned toward unit `w` by at most `maxAngle` radians. */
function turnToward(h: Vec, w: Vec, maxAngle: number): Vec {
  const angle = PORTABLE_MATH.atan2(h[0] * w[1] - h[1] * w[0], dot(h, w));
  const step = Math.max(-maxAngle, Math.min(maxAngle, angle));
  const c = PORTABLE_MATH.cos(step);
  const s = PORTABLE_MATH.sin(step);
  return [h[0] * c - h[1] * s, h[0] * s + h[1] * c];
}

/** `dir` without the parts that would take a man at `pos` within `edge` metres of a touchline or goal line. */
function offTheLines(pos: Vec, dir: Vec, edge: number): Vec {
  let [x, y] = dir;
  if ((pos[0] < edge && x < 0) || (pos[0] > PITCH.length - edge && x > 0)) x = 0;
  if ((pos[1] < edge && y < 0) || (pos[1] > PITCH.width - edge && y > 0)) y = 0;
  return [x, y];
}

/**
 * The order of the man on the ball while he holds it (`stage.holdMove`).
 * He carries on in the line he arrived on, turning toward the attack over `turn` seconds, bends away
 * from a near opponent and keeps off the lines; with a pass to come he never closes on its reception
 * point `to` inside `kickGap` + `room` (the complaint of passes between men standing on each other),
 * while a carry's holder (`toward`) takes it to `to` by `until` (`carryStep`). His speed is `speed`
 * for the first `carry` metres and `slow` after, `pressed` in a pressed beat.
 *
 * Held up (`heldLine`): an opponent he has not gone past within `press` metres fixes one line for
 * as long as that man stays within `release` metres, so a carrier faced off never circles round
 * the man stuck to him; he stands on the ball where that line is blocked.
 */
export function holdMove(
  state: StageState,
  actor: number,
  to: Vec,
  toward = false,
  until = state.t,
): Order {
  const HM = STAGE.holdMove;
  const body = state.bodies[actor];
  const team = state.fixture.players[actor].team;
  const forward: Vec = [toAttack(team, [105, 34], state.fixture.period)[0] === 105 ? 1 : -1, 0];
  const arrived =
    len(body.vel) > 0.5 ? norm(body.vel) : len(body.face) > 0 ? norm(body.face) : forward;
  let heading: Vec = arrived;
  let last: Vec = [body.pos[0], body.pos[1]];
  let lastT = state.t;
  let carried = 0;
  let cap: number = HM.speed;
  let held: { by: number; line: Vec } | undefined;
  const standing = (pos: Vec): Vec => [pos[0], pos[1]];
  return {
    pace: 'jog',
    get speedCap() {
      return cap;
    },
    target: (): Vec => {
      const pos = body.pos;
      carried += dist(last, pos);
      last = [pos[0], pos[1]];
      const dt = Math.max(0, state.t - lastT);
      lastT = state.t;
      if (toward) {
        const step = carryStep(state, actor, to, until);
        cap = step.speed;
        return step.target;
      }
      if (held && dist(pos, state.bodies[held.by].pos) > HELD_RELEASE) held = undefined;
      if (!held) {
        const man = nearestOpponent(state, actor, true);
        if (man.index >= 0 && man.distance <= HM.press) {
          held = {
            by: man.index,
            line: heldLine(pos, state.bodies[man.index].pos, to, heading, forward),
          };
        }
      }
      if (held) {
        cap = HM.pressed;
        const line = offTheLines(pos, held.line, HM.edge);
        if (len(line) < 1e-3 || lineBlocked(state, actor, pos, line, to)) return standing(pos);
        heading = norm(line);
        return add(pos, scale(heading, HM.lead));
      }
      const opp = nearestOpponent(state, actor);
      let want: Vec = forward;
      if (opp.index >= 0 && opp.distance < HM.avoid) {
        const away = norm(sub(pos, state.bodies[opp.index].pos));
        want = add(want, scale(away, ((HM.avoid - opp.distance) / HM.avoid) * HM.shy));
      }
      // He never carries onto a teammate: one within `mates` metres pushes his line away.
      for (const mate of presentPlayers(state.fixture, team)) {
        if (mate.index === actor) continue;
        const gap = dist(pos, state.bodies[mate.index].pos);
        if (gap >= HM.mates || gap < 1e-6) continue;
        const away = norm(sub(pos, state.bodies[mate.index].pos));
        want = add(want, scale(away, ((HM.mates - gap) / HM.mates) * 2));
      }
      if (len(want) > 1e-3) heading = turnToward(heading, norm(want), (Math.PI * dt) / HM.turn);
      let dir: Vec = heading;
      const u = norm(sub(to, pos));
      const closing = dot(dir, u);
      if (dist(pos, to) < STAGE.kickGap + HM.room && closing > 0) dir = sub(dir, scale(u, closing));
      dir = offTheLines(pos, dir, HM.edge);
      if (len(dir) < 1e-3) dir = offTheLines(pos, perp(norm(sub(to, pos))), HM.edge);
      if (len(dir) < 1e-3) dir = offTheLines(pos, forward, HM.edge);
      if (len(dir) < 1e-3) dir = scale(forward, -1);
      cap = state.tight ? HM.pressed : carried < HM.carry ? HM.speed : HM.slow;
      return add(pos, scale(norm(dir), HM.lead));
    },
  };
}

/**
 * The one line a held-up man with a pass to come keeps (unit, or zero to stand on the ball): across
 * the man on the side of his pass (`heading` when it is on him), away from him only where that is
 * up the pitch, and never toward his own goal: a man faced off stands his ground.
 */
export function heldLine(pos: Vec, man: Vec, to: Vec, heading: Vec, forward: Vec): Vec {
  const away = norm(sub(pos, man));
  const across = perp(away);
  const aim = dist(pos, to) > 1e-3 ? norm(sub(to, pos)) : heading;
  const side = dot(across, aim) > 0 || (dot(across, aim) === 0 && dot(across, heading) >= 0);
  const line = add(side ? across : scale(across, -1), scale(away, Math.max(0, dot(away, forward))));
  const back = dot(line, forward);
  return norm(back < 0 ? sub(line, scale(forward, back)) : line);
}

/**
 * A carry's holder before the carry: he takes the ball straight toward its end `to`, paced to be
 * there when his hold ends at `until` (never faster than `holdMove.speed`, `pressed` when pressed),
 * so he never runs past the end and turns back to it; with an opponent he has not gone past within
 * `holdMove.press` metres in the carry's way he stands on the ball facing him until the carry takes
 * him past (`performCarry`).
 */
function carryStep(
  state: StageState,
  actor: number,
  to: Vec,
  until: number,
): { target: Vec; speed: number } {
  const HM = STAGE.holdMove;
  const pos = state.bodies[actor].pos;
  const man = nearestOpponent(state, actor, true);
  const pressed = state.tight || man.distance <= HM.press;
  if (man.distance <= HM.press) {
    const at = sub(state.bodies[man.index].pos, pos);
    if (dot(norm(sub(to, pos)), norm(at)) > 0.5 && dist(pos, to) > len(at))
      return { target: [pos[0], pos[1]], speed: 0 };
  }
  const left = Math.max(STAGING_CONFIG.tick, until - state.t);
  return { target: to, speed: Math.min(pressed ? HM.pressed : HM.speed, dist(pos, to) / left) };
}

/** A held-up man's `line` runs onto a teammate within `holdMove.mates` metres ahead, or closes on his pass's reception point inside `kickGap` + `room`. */
function lineBlocked(state: StageState, actor: number, pos: Vec, line: Vec, to: Vec): boolean {
  const HM = STAGE.holdMove;
  if (dist(pos, to) < STAGE.kickGap + HM.room && dot(line, sub(to, pos)) > 0) return true;
  const team = state.fixture.players[actor].team;
  for (const mate of presentPlayers(state.fixture, team)) {
    if (mate.index === actor) continue;
    const gap = sub(state.bodies[mate.index].pos, pos);
    if (len(gap) < HM.mates && dot(norm(gap), norm(line)) > 0.5) return true;
  }
  return false;
}

/** `to` moved straight away from the ball until it is `stage.kickGap` from it; unchanged when it is already that far. */
export function roomyAim(state: StageState, receiver: number, to: Vec): Vec {
  const ball: Vec = [state.ball.pos[0], state.ball.pos[1]];
  if (dist(ball, to) >= STAGE.kickGap) return to;
  const toward = (q: Vec): Vec | undefined => (dist(ball, q) >= 0.5 ? q : undefined);
  const aim = toward(to) ?? toward(state.bodies[receiver].pos) ?? CENTRE;
  return clampToPitch(add(ball, scale(norm(sub(aim, ball)), STAGE.kickGap)), 0.5);
}

/**
 * An ordinary pass (kind `pass`, not a through ball) is received `stage.kickGap` from the ball at
 * least; without a receiver the passer stands in for him, so an aim on the ball turns to the centre.
 */
const roomy = (state: StageState, beat: Beat, to: Vec): Vec =>
  beat.kind === 'pass' && !beat.through ? roomyAim(state, beat.receiver ?? beat.actor, to) : to;

/**
 * The passer holds the ball at least `hold` seconds, keeping it moving (`holdMove`),
 * while the receiver (if any) runs there; then he waits up to `stage.maxExtraHold` more until
 * `ready()`. Reached by an opponent (`pressedOff`) he plays it at once, `ready(true)` permitting.
 */
export function* holdUntil(
  state: StageState,
  actor: number,
  receiver: number | undefined,
  to: Vec,
  hold: number,
  ready: (reached: boolean) => boolean,
  receiverOrder?: Order,
): Generator<void, void> {
  state.orders.set(actor, holdMove(state, actor, to));
  if (receiver !== undefined) {
    state.orders.set(receiver, receiverOrder ?? { target: to, pace: 'run' });
  }
  const start = state.t;
  const off = pressedOff(state, actor);
  yield* runUntil(
    state,
    () => {
      const reached = off();
      return (reached || state.t - start >= hold - 1e-9) && ready(reached);
    },
    hold + STAGE.maxExtraHold,
  );
}

/**
 * After the hold and its extra allowance, an ordinary pass is still not played to a receiver in an
 * offside position: the passer keeps it, up to `stage.through.maxWait` more, while the receiver
 * (sprinting while beyond the line) gets back onside.
 */
const untilOnside = function* (
  state: StageState,
  held: { onside: () => boolean },
): Generator<void, void> {
  return yield* runUntil(state, held.onside, STAGE.through.maxWait);
};

/**
 * `holdUntil` the receiver is in reach of `to` (and `wait()`, when given); a man reached by an
 * opponent does not wait for the receiver (the caller plays it to where he can take it). True when
 * the receiver can be at `to` in time.
 */
export function* holdForPass(
  state: StageState,
  actor: number,
  receiver: number | undefined,
  to: Vec,
  speed: number,
  hold: number,
  wait?: () => boolean,
  receiverOrder?: Order,
): Generator<void, boolean> {
  yield* holdUntil(
    state,
    actor,
    receiver,
    to,
    hold,
    (reached) => (reached || canReceive(state, receiver, to, speed)) && (wait ? wait() : true),
    receiverOrder,
  );
  return canReceive(state, receiver, to, speed);
}

/** The offside line of `team`'s attack now, as an attack-frame x. */
const lineNow = (state: StageState, team: TeamId): number =>
  offsideLineX(state.fixture, positionsOf(state), team);

/** `p` (world) with its attack x capped `shape.onsideGap` inside `team`'s offside line. */
const onsideCap = (state: StageState, team: TeamId, p: Vec): Vec => {
  const a = toAttack(team, p, state.fixture.period);
  const cap = lineNow(state, team) - SHAPE.onsideGap;
  return a[0] > cap ? toAttack(team, [cap, a[1]], state.fixture.period) : p;
};

/** An ordinary pass (kind `pass`, not a through ball) is never played to a man offside. */
const guarded = (beat: Beat): boolean => beat.kind === 'pass' && !beat.through;

/**
 * How the receiver holds while the ball is not yet played, and what else the kick waits for: a
 * lofted delivery into the box has him wait at his run-up point; an ordinary pass keeps him onside
 * (sprinting back while he stands beyond the line) and waits until he is onside or not ahead of the ball.
 */
export function receiverHold(
  state: StageState,
  beat: Beat,
  receiver: number | undefined,
  R: Vec,
): { order?: Order; onside: () => boolean } {
  if (receiver === undefined) return { onside: () => true };
  const team = beat.team;
  const aim = toAttack(team, R, state.fixture.period);
  const base: Vec =
    beat.loft && inBox(toAttack(team, beat.to, state.fixture.period))
      ? clampToPitch(
          toAttack(team, [aim[0] - STAGING_CONFIG.stage.cross.runUp, aim[1]], state.fixture.period),
          0.5,
        )
      : R;
  if (!guarded(beat)) return { order: { target: base, pace: 'run' }, onside: () => true };
  const rx = (): number => toAttack(team, state.bodies[receiver].pos, state.fixture.period)[0];
  return {
    order: {
      target: () => onsideCap(state, team, base),
      get pace() {
        return rx() > lineNow(state, team) ? 'sprint' : 'run';
      },
    },
    onside: () =>
      rx() <= lineNow(state, team) - 0.05 ||
      rx() <= toAttack(team, state.ball.pos, state.fixture.period)[0],
  };
}

/** At the kick an ordinary pass's aim in the opponents' half is kept onside too. */
const kickAim = (state: StageState, beat: Beat, R: Vec): Vec =>
  guarded(beat) && toAttack(beat.team, R, state.fixture.period)[0] > HALFWAY
    ? onsideCap(state, beat.team, R)
    : R;

/** The point on the way from the receiver to `to` he can sprint to while the ball travels there. */
export function reachablePoint(state: StageState, receiver: number, to: Vec, speed: number): Vec {
  const sprint = sprintOf(state, receiver);
  const from = state.bodies[receiver].pos;
  let p: Vec = to;
  for (let i = 0; i < 3; i++) {
    const t = flightTime(state.ball.pos, p, speed);
    const reach = Math.max(0, t + STAGE.receiveSlack - MOTION.reactTime) * sprint * 0.9;
    p = approach(from, to, reach);
  }
  return p;
}

const kickEvent = (state: StageState, actor: number, receiver: number | undefined): void => {
  pushEvent(state, {
    kind: 'kick',
    actor,
    ...(receiver !== undefined ? { other: receiver } : {}),
    at: [state.ball.pos[0], state.ball.pos[1]],
  });
};

/** Kicks the ball to `to`; the receiver sprints there and the stage runs until the ball arrives. */
export function* kickTo(
  state: StageState,
  actor: number,
  receiver: number,
  to: Vec,
  speed: number,
  loft: boolean,
): Generator<void, void> {
  kickEvent(state, actor, receiver);
  const flight = startFlight(state, to, speed, loft);
  state.orders.delete(actor);
  state.orders.set(receiver, { target: to, pace: 'sprint' });
  yield* runUntil(
    state,
    () => state.t >= flight.t1 - 1e-9,
    flight.t1 - state.t + STAGING_CONFIG.tick,
  );
}

/** `pass:complete` and `clearance:complete`. */
export function* performPass(state: StageState, ctx: BeatContext): Generator<void, void> {
  if (ctx.beat.through) return yield* performThrough(state, ctx);
  const beat = ctx.beat;
  const receiver = beat.receiver;
  if (receiver === undefined) throw invalidDetail(`staging:beat:${beat.index}`);
  setPossession(state, beat);
  yield* ensureOwner(state, beat.actor);
  let to = roomy(state, beat, clampToPitch(beat.to, 0.5));
  const speed = speedOf(beat);
  const press = pressWait(state, beat);
  const held = receiverHold(state, beat, receiver, to);
  const wait = (): boolean => press() && held.onside();
  yield* holdForPass(state, beat.actor, receiver, to, speed, beat.hold, wait, held.order);
  yield* untilOnside(state, held);
  to = kickAim(state, beat, to);
  if (!canReceive(state, receiver, to, speed)) {
    to = reachablePoint(state, receiver, to, speed);
  }
  kickEvent(state, beat.actor, receiver);
  const flight = startFlight(state, to, speed, beat.loft);
  state.orders.delete(beat.actor);
  state.orders.set(receiver, { target: to, pace: 'sprint' });
  cueNext(state, ctx, to);
  yield* runUntil(
    state,
    () => state.t >= flight.t1 - 1e-9,
    flight.t1 - state.t + STAGING_CONFIG.tick,
  );
  yield* ensureOwner(state, receiver);
  pushEvent(state, {
    kind: 'receive',
    actor: beat.actor,
    other: receiver,
    at: [state.ball.pos[0], state.ball.pos[1]],
  });
  state.orders.clear();
}

/**
 * `pass:intercepted` and `clearance:intercepted`: the ball ends at the interceptor's feet on its path.
 * A through ball without a named runner (a fitted script's: the record names none for a ball that
 * never arrived) is cut out as an ordinary pass is.
 */
export function* performPassIntercepted(
  state: StageState,
  ctx: BeatContext,
): Generator<void, void> {
  if (ctx.beat.through && ctx.beat.outcome !== 'loose' && ctx.beat.receiver !== undefined)
    return yield* performThrough(state, ctx);
  yield* winOnPath(state, ctx, ctx.beat.outcome === 'loose' ? 'loose' : 'intercept');
}

/**
 * `pass:loose` and `clearance:loose`: with an opponent, he wins it on its path as an interceptor
 * does (a `loose` event); without one the ball lands at the beat's aim and lies for the next beat.
 */
export function* performPassLoose(state: StageState, ctx: BeatContext): Generator<void, void> {
  if (ctx.beat.opponent !== undefined) return yield* winOnPath(state, ctx, 'loose');
  const beat = ctx.beat;
  setPossession(state, beat);
  yield* ensureOwner(state, beat.actor);
  const R = clampToPitch(beat.to, 0.5);
  const speed = speedOf(beat);
  const held = receiverHold(state, beat, beat.receiver, R);
  yield* holdForPass(
    state,
    beat.actor,
    beat.receiver,
    R,
    speed,
    beat.hold,
    pressWait(state, beat),
    held.order,
  );
  kickEvent(state, beat.actor, beat.receiver);
  const flight = startFlight(state, R, speed, beat.loft);
  state.orders.delete(beat.actor);
  // Its receiver goes after the loose ball at once.
  if (beat.receiver !== undefined) state.orders.set(beat.receiver, { target: R, pace: 'sprint' });
  yield* runUntil(
    state,
    () => state.t >= flight.t1 - 1e-9,
    flight.t1 - state.t + STAGING_CONFIG.tick,
  );
  const ball = state.ball;
  ball.mode = 'loose';
  ball.owner = -1;
  delete ball.flight;
  pushEvent(state, { kind: 'loose', actor: beat.actor, at: [ball.pos[0], ball.pos[1]] });
  state.orders.clear();
}

/**
 * A pass the other side wins (`winOnPath`) is aimed up to `shift` metres toward the man it was
 * meant for, who comes to meet it and stops `behind` metres past the point where it is cut out.
 */
const MEANT = { shift: 8, behind: 2 };

/** The outfield teammate of `actor` (not himself) nearest `at` now; -1 when there is none. */
function meantFor(state: StageState, actor: number, at: Vec): number {
  let best = -1;
  let gap = Infinity;
  for (const mate of presentPlayers(state.fixture, state.fixture.players[actor].team)) {
    if (mate.index === actor || mate.slot === 0) continue;
    const d = dist(state.bodies[mate.index].pos, at);
    if (d < gap) [best, gap] = [mate.index, d];
  }
  return best;
}

function* winOnPath(
  state: StageState,
  ctx: BeatContext,
  kind: 'intercept' | 'loose',
): Generator<void, void> {
  const beat = ctx.beat;
  const scripted = beat.opponent;
  if (scripted === undefined) throw invalidDetail(`staging:beat:${beat.index}`);
  setPossession(state, beat);
  yield* ensureOwner(state, beat.actor);
  let receiver = beat.receiver;
  let R = roomy(state, beat, clampToPitch(beat.to, 0.5));
  // The record names nobody for a ball the other side wins: it was still played to a teammate.
  // The man of his side nearest its aim goes for it, and it is aimed up to `MEANT.shift` metres
  // toward him, so it is cut out on its way to a man, never played into empty space.
  const meant = receiver === undefined ? meantFor(state, beat.actor, R) : -1;
  if (meant >= 0) {
    R = clampToPitch(approach(R, state.bodies[meant].pos, MEANT.shift), 0.5);
    receiver = meant;
  }
  const speed = speedOf(beat);
  const team = state.fixture.players[scripted].team;
  const range = cutRange(state, scripted);
  const aimed = R;
  state.orders.set(scripted, {
    target: () => shadowPoint(team, state.ball.pos, aimed, state.fixture.period),
    pace: 'run',
  });
  const press = pressWait(state, beat);
  const held =
    meant >= 0
      ? { order: { target: aimed, pace: 'run' } as Order, onside: () => true }
      : receiverHold(state, beat, receiver, R);
  yield* holdUntil(
    state,
    beat.actor,
    receiver,
    R,
    beat.hold,
    (reached) => {
      const from: Vec = [state.ball.pos[0], state.ball.pos[1]];
      const cut = planCut(state, scripted, from, aimed, flightTime(from, aimed, speed), range);
      return (reached || cut.margin <= STAGE.cutSlack) && press() && held.onside();
    },
    held.order,
  );
  yield* untilOnside(state, held);
  R = kickAim(state, beat, R);
  const from: Vec = [state.ball.pos[0], state.ball.pos[1]];
  const r = resolveCut(state, scripted, from, R, flightTime(from, R, speed));
  kickEvent(state, beat.actor, beat.receiver);
  const apex = apexFor(dist(from, R), beat.loft) * r.plan.param;
  const flight = startFlightTimed(state, r.plan.point, r.plan.time, apex);
  const opponent = r.plan.opponent;
  state.orders.clear();
  state.orders.set(opponent, {
    target: r.plan.point,
    pace: 'sprint',
    boost: r.stretch ? STAGE.lunge : 0,
  });
  // The man it was meant for comes to meet it and arrives just behind where it is cut out.
  if (receiver !== undefined)
    state.orders.set(receiver, {
      target: meant >= 0 ? approach(r.plan.point, R, MEANT.behind) : R,
      pace: 'sprint',
    });
  yield* runUntil(
    state,
    () => state.t >= flight.t1 - 1e-9,
    flight.t1 - state.t + STAGING_CONFIG.tick,
  );
  // A late interceptor collects the ball where it lies rather than it jumping to his feet.
  const late = state.bound && isLate(state, opponent);
  yield* ensureOwner(state, opponent);
  pushEvent(state, {
    kind,
    actor: beat.actor,
    other: opponent,
    at: [state.ball.pos[0], state.ball.pos[1]],
    recast: r.recast,
    stretch: r.stretch,
    ...(late ? { late: true } : {}),
  });
  state.orders.clear();
}

/** `pass:out` and `clearance:out`: the ball runs out of play and lies dead where it left. */
export function* performPassOut(state: StageState, ctx: BeatContext): Generator<void, void> {
  if (ctx.beat.through) return yield* performThrough(state, ctx);
  const beat = ctx.beat;
  setPossession(state, beat);
  yield* ensureOwner(state, beat.actor);
  const receiver = beat.receiver;
  const R = clampToPitch(beat.to, 0.5);
  const speed = speedOf(beat);
  const press = pressWait(state, beat);
  const held = receiverHold(state, beat, receiver, R);
  const wait = (): boolean => press() && held.onside();
  yield* holdForPass(state, beat.actor, receiver, R, speed, beat.hold, wait, held.order);
  yield* untilOnside(state, held);
  const ballPos: Vec = [state.ball.pos[0], state.ball.pos[1]];
  const E: Vec = !inPitch(beat.to, -0.1)
    ? beat.to
    : add(beat.to, scale(norm(sub(beat.to, ballPos)), STAGE.restart.outRun));
  kickEvent(state, beat.actor, receiver);
  const flight = startFlight(state, E, speed, beat.loft);
  state.orders.delete(beat.actor);
  yield* runUntil(
    state,
    () => state.t >= flight.t1 - 1e-9,
    flight.t1 - state.t + STAGING_CONFIG.tick,
  );
  const ball = state.ball;
  ball.mode = 'dead';
  ball.owner = -1;
  delete ball.flight;
  state.live = false;
  pushEvent(state, { kind: 'out', actor: beat.actor, at: clampToPitch(E, 0) });
  state.orders.clear();
}
