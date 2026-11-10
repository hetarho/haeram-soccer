// The stage's world: 22 bodies, the ball, the beat being performed and the frames recorded so far.
// Every tick reads one snapshot of positions, gives every player a target (an order from a beat
// handler, else his place in the shape, pressing or marking), moves everyone, then the ball, and
// records a frame. Staging draws no random numbers: it is a pure function of the script (ARCH-5),
// and movement only presents beats already settled (ARCH-7).
import { PROTO_CONFIG } from '../core/config.ts';
import { CENTRE, HALFWAY, clampToPitch, oppGoal, ownGoal, toAttack } from '../core/pitch.ts';
import { ROLE_SHAPE, nominalSpot } from '../core/shape.ts';
import type {
  BallMode,
  Beat,
  Fixture,
  Frame,
  Phase,
  Script,
  StageEvent,
  TeamId,
  Vec,
} from '../core/types.ts';
import { lineOf } from '../core/types.ts';
import { add, approach, dist, len, lerp, norm, scale, sub } from '../core/vec.ts';
import { giveBall, updateBall } from './ball.ts';
import { advanceBody, paceSpeed, type Body, type Pace } from './motion.ts';

export interface Order {
  target: Vec | (() => Vec);
  pace: Pace;
  /** Upper bound in m/s on top of the pace. */
  speedCap?: number;
  /** Added to the pace's speed (the lunge allowance of T796). */
  boost?: number;
}
export interface Flight {
  from: Vec;
  to: Vec;
  t0: number;
  t1: number;
  apex: number;
}
export interface BallState {
  pos: [number, number];
  z: number;
  mode: BallMode;
  owner: number;
  flight?: Flight;
}
export interface StageState {
  fixture: Fixture;
  beats: readonly Beat[];
  t: number;
  tickCount: number;
  bodies: Body[];
  ball: BallState;
  team: TeamId;
  phase: Phase;
  beat: number;
  live: boolean;
  /** When possession last changed sides. */
  turnedAt: number;
  /** The presser closes to `shape.press.tight` during this beat. */
  tight: boolean;
  /** Dead-ball scenes: shapes read this point instead of the ball. */
  shapeBall?: Vec;
  /** Dead-ball scenes: a dead ball is brought toward this point at `ball.retrieval` m/s. */
  retrieve?: Vec;
  /** Dead-ball scenes: targets of `team`'s players inside this circle are moved out to its edge. */
  keepOut?: { centre: Vec; radius: number; team: TeamId };
  orders: Map<number, Order>;
  /** Orders set one beat ahead by `cueNext`; they outlive `orders.clear()` until the next beat starts. */
  cues: Map<number, Order>;
  score: [number, number];
  frames: Frame[];
  events: StageEvent[];
}

const SHAPE = PROTO_CONFIG.shape;
const MOTION = PROTO_CONFIG.motion;
const KICK_OFF = PROTO_CONFIG.stage.kickOff;

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** A body standing at `pos`, still, facing `toward`. */
const standing = (pos: Vec, toward: Vec): Body => {
  const f = norm(sub(toward, pos));
  return { pos: [pos[0], pos[1]], vel: [0, 0], face: [f[0], f[1]] };
};

/** Records the frame of the current time. */
const recordFrame = (state: StageState): void => {
  const p: number[] = [];
  for (const body of state.bodies) p.push(round2(body.pos[0]), round2(body.pos[1]));
  state.frames.push({
    t: state.t,
    ball: [round2(state.ball.pos[0]), round2(state.ball.pos[1]), round2(state.ball.z)],
    owner: state.ball.owner,
    mode: state.ball.mode,
    team: state.team,
    phase: state.phase,
    live: state.live,
    beat: state.beat,
    p,
  });
};

/**
 * Player `index`'s kick-off place (world frame) when `kicking` kicks off through `kicker`: his
 * build-up place in his own half, the other side outside the centre circle, the kicker on the spot.
 */
export function kickOffSpot(fixture: Fixture, index: number, kicking: TeamId, kicker: number): Vec {
  const team = fixture.players[index].team;
  const nominal = nominalSpot({ fixture, ball: CENTRE, team: kicking, phase: 'buildUp' }, index);
  let a: [number, number] = [...toAttack(team, nominal)] as [number, number];
  a[0] = Math.min(a[0], HALFWAY - KICK_OFF.halfMargin);
  if (team !== kicking && dist(a, CENTRE) < KICK_OFF.circle) a[0] = HALFWAY - KICK_OFF.circle;
  if (index === kicker) a = [HALFWAY - 0.3, CENTRE[1]];
  return toAttack(team, a);
}

/** The stage before the first beat: everyone at his kick-off place, the kicker on the ball, frame 0 recorded. */
export function createStage(script: Script): StageState {
  const fixture = script.fixture;
  const first = script.beats[0];
  if (!first) throw new Error('empty script');
  const bodies = fixture.players.map((player): Body =>
    standing(kickOffSpot(fixture, player.index, first.team, first.actor), oppGoal(player.team)),
  );
  const state: StageState = {
    fixture,
    beats: script.beats,
    t: 0,
    tickCount: 0,
    bodies,
    ball: { pos: [CENTRE[0], CENTRE[1]], z: 0, mode: 'held', owner: first.actor },
    team: first.team,
    phase: first.phase,
    beat: first.index,
    live: true,
    turnedAt: -Infinity,
    tight: false,
    orders: new Map(),
    cues: new Map(),
    score: [0, 0],
    frames: [],
    events: [],
  };
  giveBall(state, first.actor);
  recordFrame(state);
  return state;
}

/** Every player's position now, by index. */
export function positionsOf(state: StageState): Vec[] {
  return state.bodies.map((b): Vec => [b.pos[0], b.pos[1]]);
}

/** Presser and cover of a defending team for one snapshot (one tick). */
interface PressRoles {
  presser: number;
  cover: number;
}
const pressCache = new WeakMap<readonly Vec[], Map<TeamId, PressRoles>>();

const pressRoles = (
  state: StageState,
  d: TeamId,
  ref: Vec,
  snapshot: readonly Vec[],
): PressRoles => {
  let byTeam = pressCache.get(snapshot);
  if (!byTeam) {
    byTeam = new Map();
    pressCache.set(snapshot, byTeam);
  }
  const cached = byTeam.get(d);
  if (cached) return cached;
  const free = state.fixture.teams[d].players
    .filter((p) => p.slot !== 0 && !state.orders.has(p.index) && !state.cues.has(p.index))
    .map((p) => ({ index: p.index, d: dist(snapshot[p.index], ref) }))
    .sort((a, b) => a.d - b.d || a.index - b.index);
  const roles = { presser: free[0]?.index ?? -1, cover: free[1]?.index ?? -1 };
  byTeam.set(d, roles);
  return roles;
};

/**
 * The point the shapes read: the dead-ball scene's point, a flight's landing point (on the line
 * when the ball is going out, so nobody presses beyond it) or the ball.
 */
const shapeRef = (state: StageState): Vec => {
  if (state.shapeBall) return state.shapeBall;
  const ball = state.ball;
  return ball.mode === 'flight' && ball.flight ? clampToPitch(ball.flight.to, 0) : ball.pos;
};

/** Where player `index` goes without an order this tick. `snapshot` = `positionsOf(state)` taken once per tick. */
export function defaultTarget(
  state: StageState,
  index: number,
  snapshot: readonly Vec[],
): { target: Vec; pace: Pace } {
  const ref = shapeRef(state);
  const fixture = state.fixture;
  const base = nominalSpot(
    { fixture, ball: ref, team: state.team, phase: state.phase, positions: snapshot },
    index,
  );
  const pos = snapshot[index];
  const generalPace = (target: Vec): Pace =>
    state.t - state.turnedAt < MOTION.transitionSeconds || dist(pos, target) > MOTION.jogWithin
      ? 'run'
      : 'jog';
  const player = fixture.players[index];
  if (player.team === state.team && state.live && ROLE_SHAPE[player.role]?.onShoulder) {
    // The last-shoulder role keeps pace with a moving line: he never jogs.
    const pace = generalPace(base);
    return { target: base, pace: pace === 'jog' ? 'run' : pace };
  }
  if (player.team === state.team || player.slot === 0 || !state.live) {
    return { target: base, pace: generalPace(base) };
  }
  const d = player.team;
  const goal = ownGoal(d);
  // A beat the script calls pressed is pressed wherever the ball is, whatever the side's style.
  const pressing = state.tight || toAttack(d, ref)[0] <= SHAPE.press.from[fixture.teams[d].style];
  if (pressing) {
    const roles = pressRoles(state, d, ref, snapshot);
    const g = norm(sub(goal, ref));
    if (index === roles.presser) {
      const target = add(ref, scale(g, state.tight ? SHAPE.press.tight : SHAPE.press.standoff));
      return {
        target,
        pace: dist(pos, target) > MOTION.pressSprintBeyond ? 'sprint' : 'run',
      };
    }
    if (index === roles.cover)
      return { target: add(ref, scale(g, SHAPE.press.coverGap)), pace: 'run' };
  }
  let nearest: Vec | undefined;
  let nearestD: number = SHAPE.mark.radius;
  for (const opp of fixture.teams[state.team].players) {
    if (opp.slot === 0) continue;
    const od = dist(snapshot[opp.index], base);
    if (od <= nearestD) {
      nearestD = od;
      nearest = snapshot[opp.index];
    }
  }
  if (!nearest) return { target: base, pace: generalPace(base) };
  const m = add(nearest, scale(norm(sub(goal, nearest)), SHAPE.mark.goalSide));
  const target: Vec =
    lineOf(player.position) === 'DF'
      ? [base[0], base[1] + (m[1] - base[1]) * SHAPE.mark.blend]
      : lerp(base, m, SHAPE.mark.blend);
  return { target, pace: generalPace(target) };
}

/** `target` moved radially out to the keep-out circle's edge when it lies inside it. */
const keptOut = (keep: NonNullable<StageState['keepOut']>, target: Vec): Vec => {
  const off = sub(target, keep.centre);
  const d = len(off);
  if (d >= keep.radius) return target;
  const dir = d > 1e-9 ? norm(off) : norm(sub(ownGoal(keep.team), keep.centre));
  return clampToPitch(add(keep.centre, scale(dir, keep.radius)), -2);
};

const BOARDS = PROTO_CONFIG.stage.boards;

/**
 * A free outfield player's `target` moved out to `stage.separation` from every outfield teammate
 * standing within it, so two markers never pick the same man and nobody in the shape walks onto a
 * teammate. Players with an order or cue (the beat's actors) and the ball's owner are not moved;
 * the free man makes room for them.
 */
export function separated(
  state: StageState,
  index: number,
  target: Vec,
  snapshot: readonly Vec[],
): Vec {
  const sep = PROTO_CONFIG.stage.separation;
  const spec = state.fixture.players[index];
  if (sep <= 0 || spec.slot === 0 || state.ball.owner === index || !state.live) return target;
  let out = target;
  for (const mate of state.fixture.teams[spec.team].players) {
    if (mate.index === index || mate.slot === 0) continue;
    const at = snapshot[mate.index];
    const off = sub(out, at);
    if (len(off) >= sep) continue;
    const away = len(off) > 1e-9 ? norm(off) : norm(sub(snapshot[index], at));
    out = add(at, scale(len(away) > 0 ? away : [0, 1], sep));
  }
  return out;
}

/**
 * The boards stop a player `stage.boards` outside the lines: braking from a sprint after his
 * target flips at a dead ball must not carry him on, so the outward part of his velocity ends there.
 */
const atBoards = (body: Body): void => {
  const [x, y] = clampToPitch(body.pos, -BOARDS);
  if (x !== body.pos[0]) body.vel = [0, body.vel[1]];
  if (y !== body.pos[1]) body.vel = [body.vel[0], 0];
  body.pos = [x, y];
};

/** One tick: targets for all 22 from one snapshot, then everybody moves, the ball updates, a frame is recorded. */
export function step(state: StageState): void {
  const snapshot = positionsOf(state);
  const moves: { target: Vec; speed: number }[] = state.fixture.players.map((spec) => {
    const order = state.orders.get(spec.index) ?? state.cues.get(spec.index);
    if (order) {
      const target = typeof order.target === 'function' ? order.target() : order.target;
      const speed = Math.min(
        paceSpeed(order.pace, spec) + (order.boost ?? 0),
        order.speedCap ?? Infinity,
      );
      return { target: clampToPitch(target, -BOARDS), speed };
    }
    const own = defaultTarget(state, spec.index, snapshot);
    const target = separated(state, spec.index, own.target, snapshot);
    return { target: clampToPitch(target, -BOARDS), speed: paceSpeed(own.pace, spec) };
  });
  const keep = state.keepOut;
  if (keep) {
    moves.forEach((move, i) => {
      if (state.fixture.players[i].team === keep.team) move.target = keptOut(keep, move.target);
    });
  }
  const tick = PROTO_CONFIG.tick;
  moves.forEach((move, i) => {
    const body = state.bodies[i];
    advanceBody(body, move.target, move.speed, tick);
    atBoards(body);
  });
  state.tickCount += 1;
  state.t = Math.round(state.tickCount * tick * 1000) / 1000;
  updateBall(state);
  recordFrame(state);
}

/** Steps until `done()` is true (checked before each step) or `maxSeconds` have passed. */
export function runUntil(state: StageState, done: () => boolean, maxSeconds: number): void {
  const end = state.t + maxSeconds;
  while (!done() && state.t < end - 1e-9) step(state);
}

export function pushEvent(
  state: StageState,
  event: Omit<StageEvent, 't' | 'beat' | 'team'> & { team?: TeamId },
): void {
  state.events.push({ ...event, t: state.t, beat: state.beat, team: event.team ?? state.team });
}

// The two beat-opening helpers live here, below the handlers, so `pass.ts` and `carry.ts` never
// import `perform.ts` (which imports them); `perform.ts` re-exports both.

/**
 * Starts performing `beat`: its team, phase and index; a change of sides starts the transition
 * clock. The cues set for this beat end here: the handler that follows sets its own orders in the
 * same tick, so a cued player keeps moving.
 */
export function setPossession(state: StageState, beat: Beat): void {
  state.cues.clear();
  if (beat.team !== state.team) state.turnedAt = state.t;
  state.team = beat.team;
  state.phase = beat.phase;
  state.beat = beat.index;
  state.tight = beat.reason === 'pressed';
}

/** Makes sure `actor` has the ball: he goes to it (a loose ball rolls toward him) and takes it. */
export function ensureOwner(state: StageState, actor: number): void {
  const ball = state.ball;
  if (ball.mode === 'held' && ball.owner === actor) return;
  if (ball.mode !== 'dead') {
    ball.mode = 'loose';
    ball.owner = -1;
    delete ball.flight;
  }
  state.orders.set(actor, { target: () => state.ball.pos, pace: 'sprint' });
  const stage = PROTO_CONFIG.stage;
  const end = state.t + stage.settleMax;
  const near = (): boolean => dist(state.bodies[actor].pos, ball.pos) <= stage.controlRange;
  while (!near() && state.t < end - 1e-9) {
    if (ball.mode === 'loose') {
      const p = approach(
        ball.pos,
        state.bodies[actor].pos,
        PROTO_CONFIG.ball.roll * PROTO_CONFIG.tick,
      );
      ball.pos = [p[0], p[1]];
    }
    step(state);
  }
  state.orders.delete(actor);
  giveBall(state, actor);
}
