import { random } from '../primitives';
import { invalidDetail } from '../script/failure';
// The stage's world: 22 bodies, the ball, the beat being performed and the frames recorded so far.
// Every tick reads one snapshot of positions, gives every player a target (an order from a beat
// handler, else his place in the shape, pressing or marking, a free player's through his own delay,
// lag and pace in `mind.ts`), moves everyone, then the ball, and records a frame. Only the
// named motion stream shapes flights: staging is a pure function of the script (ARCH-5),
// and movement only presents beats already settled (ARCH-7).
import { STAGING_CONFIG } from './config';
import { CENTRE, HALFWAY, PITCH, clampToPitch, oppGoal, ownGoal, toAttack } from './pitch';
import { ROLE_SHAPE, nominalSpot } from './places';
import type {
  BallMode,
  Beat,
  BeatKind,
  Fixture,
  Frame,
  Phase,
  Script,
  StageEvent,
  TeamId,
  Vec,
} from './types';
import { lineOf, onPitch, presentPlayers } from './types';
import { add, approach, clamp, dist, len, norm, scale, sub } from './vec';
import { giveBall, updateBall } from './ball';
import { assignMarks, markSpot } from './mark';
import {
  followPlace,
  freeSpeed,
  placeLag,
  remember,
  seenBy,
  shapeRef,
  turnOf,
  type Mind,
  type Seen,
} from './mind';
import { advanceBody, speedAt, type Body, type Pace } from './motion';
import { pressingReach } from './tendency';

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
  /** Quadratic curve control, sampled from the motion stream at the kick. */
  control: Vec;
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
  performed: Beat[];
  motion: () => number;
  t: number;
  tickCount: number;
  bodies: Body[];
  /** Each player's own place (stage/mind.ts); a direct player's is his body's position. */
  minds: Mind[];
  /** The shape's true inputs of the last `motion.own.memory` seconds, newest last. */
  seen: Seen[];
  ball: BallState;
  team: TeamId;
  phase: Phase;
  beat: number;
  live: boolean;
  /** When possession last changed sides. */
  turnedAt: number;
  lostBy?: TeamId;
  /** The last change of sides in live play and whether the new side's phase is a counter (stage/mind.ts). */
  turn?: { at: number; counter: boolean };
  /** Who marks whom (defender index → attacker index), set every tick by `assignMarks` (stage/mark.ts). */
  marks: Map<number, number>;
  /** The presser closes to `shape.press.tight` during this beat. */
  tight: boolean;
  /** The presser engaged with the man on the ball, and since when (set each tick by `trackPress`). */
  pressing?: { index: number; owner: number; since: number };
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
  /** A script written from a settled result (T821): nobody the record names may be replaced. */
  bound: boolean;
  /** The record's match clock (a bound script's frames): it runs in live play up to `clockCap`. */
  clock?: number;
  clockCap: number;
  /** Record-clock seconds when each participant entered; starters start at zero. */
  enteredAt?: number[];
  /** The exact targets used by the last movement tick. Observation only. */
  targets?: Vec[];
  action?: BeatKind;
  receiver?: number;
}

const SHAPE = STAGING_CONFIG.shape;
const MOTION = STAGING_CONFIG.motion;
const TURN = STAGING_CONFIG.motion.turn;
const KICK_OFF = STAGING_CONFIG.stage.kickOff;

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** A body standing at `pos`, still, facing `toward`. */
const standing = (pos: Vec, toward: Vec): Body => {
  const f = norm(sub(toward, pos));
  return { pos: [pos[0], pos[1]], vel: [0, 0], face: [f[0], f[1]] };
};

/** Snapshot the staging's actual current role and target, not a later inference from proximity. */
function observedMovement(
  state: StageState,
  index: number,
  snapshot: readonly Vec[],
): NonNullable<Frame['movement']>[number] {
  const p = state.fixture.players[index];
  const body = state.bodies[index];
  const ordered = state.orders.has(index) || state.cues.has(index);
  let action: NonNullable<Frame['movement']>[number]['state'] = 'shape';
  if (!onPitch(state.fixture, index))
    return { velocity: [0, 0], intent: [...body.pos], state: action };
  if (p.slot === 0) action = 'keeper';
  else if (state.ball.owner === index && state.ball.mode === 'held') action = 'carry';
  else if (
    state.live &&
    p.team !== state.team &&
    (ordered || isPressRole(state, p.team, index, snapshot))
  )
    action = 'press';
  else if (state.marks.has(index)) action = 'mark';
  else if (state.live && p.team === state.team && index === state.receiver) action = 'support';
  else if (state.live && p.team === state.team && (ordered || ROLE_SHAPE[p.role]?.onShoulder))
    action = 'run';
  else if (
    state.live &&
    p.team !== state.team &&
    state.t - state.turnedAt < MOTION.transitionSeconds
  )
    action = 'recover';
  else if (state.live && p.team === state.team) {
    const nominal = nominalSpot(
      {
        fixture: state.fixture,
        ball: shapeRef(state),
        team: state.team,
        phase: state.phase,
        positions: snapshot,
      },
      index,
    );
    if (dist(state.minds[index].place, nominal) > MOTION.arriveRadius) action = 'support';
  }
  return {
    velocity: [...body.vel],
    intent: [...(state.targets?.[index] ?? state.minds[index].place)],
    state: action,
  };
}

/** Records the frame of the current time. */
const recordFrame = (state: StageState): void => {
  const p: number[] = [];
  const snapshot = positionsOf(state);
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
    ...(state.clock === undefined ? {} : { clock: round2(state.clock) }),
    p,
    present: state.fixture.players
      .filter((p) => onPitch(state.fixture, p.index))
      .map((p) => p.index),
    slots: state.fixture.players.map((p) => p.slot),
    period: state.fixture.period ?? 1,
    action: state.action,
    movement: state.fixture.players.map((p) => observedMovement(state, p.index, snapshot)),
  });
};

/** Membership changes at this tick, before its frame can leave the bounded program. */
export function refreshFrame(state: StageState): void {
  if (state.frames.at(-1)?.t === state.t) state.frames.pop();
  recordFrame(state);
}

/**
 * Player `index`'s kick-off place (world frame) when `kicking` kicks off through `kicker`: his
 * build-up place in his own half, the other side outside the centre circle, the kicker on the spot.
 */
export function kickOffSpot(fixture: Fixture, index: number, kicking: TeamId, kicker: number): Vec {
  const team = fixture.players[index].team;
  const nominal = nominalSpot({ fixture, ball: CENTRE, team: kicking, phase: 'buildUp' }, index);
  let a: [number, number] = [...toAttack(team, nominal, fixture.period)] as [number, number];
  a[0] = Math.min(a[0], HALFWAY - KICK_OFF.halfMargin);
  if (team !== kicking && dist(a, CENTRE) < KICK_OFF.circle) a[0] = HALFWAY - KICK_OFF.circle;
  if (index === kicker) a = [HALFWAY - 0.3, CENTRE[1]];
  return toAttack(team, a, fixture.period);
}

/** The stage before the first beat: everyone at his kick-off place, the kicker on the ball, frame 0 recorded. */
export function createStage(script: Script): StageState {
  // Each performance owns its changing XI/slots; caller inputs remain immutable.
  const fixture: Fixture = {
    ...script.fixture,
    teams: script.fixture.teams.map((t) => ({
      ...t,
      players: t.players.map((p) => ({ ...p })),
    })) as unknown as Fixture['teams'],
    players: [],
    period: script.beats[0]?.original?.period ?? 1,
  };
  fixture.players = fixture.teams.flatMap((t) => t.players);
  const incoming = new Set(
    script.beats.flatMap((b) =>
      (b.original?.incidents ?? [])
        .filter((x) => x.kind === 'sub' && x.other !== undefined)
        .map((x) => fixture.teams[x.side].players.find((p) => p.line === x.other)!.index),
    ),
  );
  fixture.present = fixture.players.map((p) => !incoming.has(p.index));
  const first = script.beats[0];
  if (!first) throw invalidDetail('staging:empty');
  const bodies = fixture.players.map((player): Body =>
    standing(
      onPitch(fixture, player.index)
        ? kickOffSpot(fixture, player.index, first.team, first.actor)
        : STAGING_CONFIG.stage.scene.gate,
      oppGoal(player.team, fixture.period),
    ),
  );
  const state: StageState = {
    fixture,
    beats: script.beats,
    performed: [],
    motion: random(`${script.seed}:motion`),
    t: 0,
    tickCount: 0,
    bodies,
    minds: bodies.map((b): Mind => ({ place: [b.pos[0], b.pos[1]] })),
    seen: [],
    ball: { pos: [CENTRE[0], CENTRE[1]], z: 0, mode: 'held', owner: first.actor },
    team: first.team,
    phase: first.phase,
    beat: first.index,
    action: first.kind,
    live: true,
    turnedAt: -Infinity,
    marks: new Map(),
    tight: false,
    orders: new Map(),
    cues: new Map(),
    score: [0, 0],
    frames: [],
    events: [],
    bound: script.bound === true,
    clockCap: Infinity,
    enteredAt: fixture.players.map((p) => (incoming.has(p.index) ? Infinity : 0)),
  };
  if (state.bound && first.clock !== undefined) state.clock = first.clock;
  giveBall(state, first.actor);
  remember(state);
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
  const free = presentPlayers(state.fixture, d)
    .filter((p) => p.slot !== 0 && !state.orders.has(p.index) && !state.cues.has(p.index))
    .map((p) => ({ index: p.index, d: dist(snapshot[p.index], ref) }))
    .filter(({ index, d: metres }) => {
      const spec = state.fixture.players[index];
      return (
        state.tight ||
        metres <=
          STAGING_CONFIG.stage.press[state.fixture.teams[d].style].reach *
            pressingReach(spec.pressing)
      );
    })
    .sort((a, b) => a.d - b.d || a.index - b.index);
  const roles = { presser: free[0]?.index ?? -1, cover: free[1]?.index ?? -1 };
  byTeam.set(d, roles);
  return roles;
};

/** Where player `index` wants to be without an order, at which pace, and whether he goes there directly. */
export interface Want {
  target: Vec;
  pace: Pace;
  /** He goes straight there at `pace`, without a delay or a lag (stage/mind.ts). */
  direct: boolean;
}

/**
 * Where player `index` goes without an order this tick. `snapshot` = `positionsOf(state)` taken once
 * per tick. A free player's nominal place reads `seen` (the inputs of his delay ago; the true inputs
 * when omitted); which branch applies, pressing and the direct players read the true state.
 */
export function defaultTarget(
  state: StageState,
  index: number,
  snapshot: readonly Vec[],
  seen?: Seen,
): Want {
  const ref = shapeRef(state);
  const fixture = state.fixture;
  const truth: Seen = { ref, team: state.team, phase: state.phase };
  const placeOf = (s: Seen): Vec =>
    nominalSpot({ fixture, ball: s.ref, team: s.team, phase: s.phase, positions: snapshot }, index);
  const pos = snapshot[index];
  const generalPace = (target: Vec): Pace =>
    state.t - state.turnedAt < MOTION.transitionSeconds || dist(pos, target) > MOTION.jogWithin
      ? 'run'
      : 'jog';
  const player = fixture.players[index];
  if (player.team === state.team && state.live && ROLE_SHAPE[player.role]?.onShoulder) {
    // The last-shoulder role keeps pace with a moving line: he never jogs.
    const base = placeOf(truth);
    const pace = generalPace(base);
    return { target: base, pace: pace === 'jog' ? 'run' : pace, direct: true };
  }
  if (player.slot === 0 || !state.live) {
    const base = placeOf(truth);
    return { target: base, pace: generalPace(base), direct: true };
  }
  const view = seen ?? truth;
  const base = placeOf(view);
  const free = (target: Vec): Want => ({ target, pace: generalPace(target), direct: false });
  // A free player who believes his side has the ball steps off a marker standing on his place.
  const open = (): Want =>
    index === state.ball.owner ? free(base) : free(unmarked(state, index, base, snapshot));
  if (player.team === state.team) return view.team === player.team ? open() : free(base);
  const d = player.team;
  const goal = ownGoal(d, fixture.period);
  if (isPressRole(state, d, index, snapshot)) {
    const g = norm(sub(goal, ref));
    const roles = pressRoles(state, d, ref, snapshot);
    if (index === roles.presser) {
      const { reach, poke } = pressReach(state, index);
      const target = add(ref, scale(g, reach));
      return {
        target,
        pace: poke || dist(pos, target) > MOTION.pressSprintBeyond ? 'sprint' : 'run',
        direct: true,
      };
    }
    return { target: add(ref, scale(g, SHAPE.press.coverGap)), pace: 'run', direct: true };
  }
  // He goes with a man only once he believes his side is defending.
  if (view.team === d) return open();
  const man = state.marks.get(index);
  if (man === undefined) return free(base);
  return free(markSpot(d, lineOf(player.position), base, snapshot[man], fixture.period));
}

/**
 * Whether player `index` of the defending side `d` is this tick's presser or cover: the side
 * presses during a pressed beat, or while the shape's point lies within its style's `press.from`.
 */
export function isPressRole(
  state: StageState,
  d: TeamId,
  index: number,
  snapshot: readonly Vec[],
): boolean {
  if (d === state.team || !state.live) return false;
  const ref = shapeRef(state);
  // A beat the script calls pressed is pressed wherever the ball is, whatever the side's style.
  const pressing =
    state.tight ||
    counterPressing(state, d) ||
    toAttack(d, ref, state.fixture.period)[0] <= SHAPE.press.from[state.fixture.teams[d].style];
  const roles = pressRoles(state, d, ref, snapshot);
  if (pressing) return index === roles.presser || index === roles.cover;
  // Outside its pressing zone a side still engages a man on the ball its nearest free defender is near.
  return index === roles.presser && engages(state, index, snapshot);
}

/** The losing side alone counter-presses, for a bounded window after a live turnover. */
function counterPressing(state: StageState, d: TeamId): boolean {
  return (
    state.lostBy === d &&
    state.t - state.turnedAt < STAGING_CONFIG.stage.counterPress.seconds &&
    STAGING_CONFIG.stage.press[state.fixture.teams[d].style].counterPress
  );
}

/** Whether defender `presser` stands within `shape.press.engage` of the man holding the ball. */
function engages(state: StageState, presser: number, snapshot: readonly Vec[]): boolean {
  const owner = state.ball.owner;
  return (
    presser >= 0 &&
    owner >= 0 &&
    state.ball.mode === 'held' &&
    dist(snapshot[presser], snapshot[owner]) <= SHAPE.press.engage
  );
}

/**
 * Who presses the man on the ball, and since when: the defending side's presser once he is within
 * `shape.press.engage` of him; reset when either changes or they come apart. Once a tick.
 */
function trackPress(state: StageState, snapshot: readonly Vec[]): void {
  const d: TeamId = state.team === 0 ? 1 : 0;
  const owner = state.ball.owner;
  const presser =
    state.live && owner >= 0 ? pressRoles(state, d, shapeRef(state), snapshot).presser : -1;
  if (
    presser < 0 ||
    !engages(state, presser, snapshot) ||
    !isPressRole(state, d, presser, snapshot)
  ) {
    state.pressing = undefined;
    return;
  }
  const p = state.pressing;
  if (!p || p.index !== presser || p.owner !== owner) {
    state.pressing = { index: presser, owner, since: state.t };
  }
}

/**
 * How far goal-side of the ball the presser stands: `standoff` (`tight` in a pressed beat); once
 * engaged (`trackPress`) he closes to `close` over `closeIn` seconds, then every `pokeEvery`
 * seconds lunges to `poke` for `pokeFor` seconds — a tackle the script does not let win.
 */
function pressReach(state: StageState, index: number): { reach: number; poke: boolean } {
  const P = SHAPE.press;
  const d = state.fixture.players[index].team;
  const base = state.tight || counterPressing(state, d) ? P.tight : P.standoff;
  const p = state.pressing;
  if (!p || p.index !== index) return { reach: base, poke: false };
  const held = state.t - p.since;
  if (held >= P.closeIn && (held - P.closeIn) % P.pokeEvery < P.pokeFor) {
    return { reach: P.poke, poke: true };
  }
  const close = Math.min(base, P.close);
  return { reach: base + (close - base) * Math.min(1, held / P.closeIn), poke: false };
}

/**
 * A free attacker's place `base` moved across, away from the nearest outfield opponent when that
 * one stands within `shape.unmark.radius` of it: by `unmark.step * (1 - d / radius)` metres in y
 * (toward the long axis when level with him), y kept inside the pitch margin, x unchanged.
 */
export function unmarked(
  state: StageState,
  index: number,
  base: Vec,
  snapshot: readonly Vec[],
): Vec {
  const fixture = state.fixture;
  const team = fixture.players[index].team;
  let nearest: Vec | undefined;
  let nearestD = Infinity;
  for (const opp of presentPlayers(fixture, team === 0 ? 1 : 0)) {
    if (opp.slot === 0) continue;
    const od = dist(snapshot[opp.index], base);
    if (od < nearestD) {
      nearestD = od;
      nearest = snapshot[opp.index];
    }
  }
  if (!nearest || nearestD >= SHAPE.unmark.radius) return base;
  const dy = base[1] - nearest[1];
  const dir = Math.abs(dy) > 1e-6 ? Math.sign(dy) : base[1] <= CENTRE[1] ? 1 : -1;
  const y = base[1] + dir * SHAPE.unmark.step * (1 - nearestD / SHAPE.unmark.radius);
  return [base[0], clamp(y, STAGING_CONFIG.margin, PITCH.width - STAGING_CONFIG.margin)];
}

/** `target` moved radially out to the keep-out circle's edge when it lies inside it. */
const keptOut = (
  keep: NonNullable<StageState['keepOut']>,
  target: Vec,
  period: Fixture['period'],
): Vec => {
  const off = sub(target, keep.centre);
  const d = len(off);
  if (d >= keep.radius) return target;
  const dir = d > 1e-9 ? norm(off) : norm(sub(ownGoal(keep.team, period), keep.centre));
  return clampToPitch(add(keep.centre, scale(dir, keep.radius)), -2);
};

/**
 * A free outfield player's `target` moved out to `stage.separation` from every outfield teammate
 * standing within it, so two markers never pick the same man and nobody in the shape walks onto a
 * teammate. Players with an order or cue (the beat's actors) and the ball's owner are not moved;
 * the free man makes room for them. On the side in possession he keeps `stage.ownerRoom` from the
 * man on the ball and from teammates under an order or cue, so the play has room around it.
 */
export function separated(
  state: StageState,
  index: number,
  target: Vec,
  snapshot: readonly Vec[],
): Vec {
  const sep = STAGING_CONFIG.stage.separation;
  const room = STAGING_CONFIG.stage.ownerRoom;
  const spec = state.fixture.players[index];
  if (sep <= 0 || spec.slot === 0 || state.ball.owner === index || !state.live) return target;
  const attacking = spec.team === state.team;
  let out = target;
  for (const mate of presentPlayers(state.fixture, spec.team)) {
    if (mate.index === index || mate.slot === 0) continue;
    const at = snapshot[mate.index];
    const off = sub(out, at);
    const busy =
      state.ball.owner === mate.index || state.orders.has(mate.index) || state.cues.has(mate.index);
    const keep = attacking && busy ? room : sep;
    if (len(off) >= keep) continue;
    const away = len(off) > 1e-9 ? norm(off) : norm(sub(snapshot[index], at));
    out = add(at, scale(len(away) > 0 ? away : [0, 1], keep));
  }
  return out;
}

/**
 * The boards stop a player `stage.boards` outside the lines: braking from a sprint after his
 * target flips at a dead ball must not carry him on, so the outward part of his velocity ends there.
 */
const atBoards = (body: Body): void => {
  const [x, y] = clampToPitch(body.pos, -STAGING_CONFIG.stage.boards);
  if (x !== body.pos[0]) body.vel = [0, body.vel[1]];
  if (y !== body.pos[1]) body.vel = [body.vel[0], 0];
  body.pos = [x, y];
};

/**
 * One tick: the shape's inputs are remembered, targets for all 22 come from one snapshot, then
 * everybody moves, the ball updates, a frame is recorded. A player under an order or cue and a
 * direct player go at their pace and keep their own place on their body; a free player acts on the
 * inputs of his delay ago, his place follows the wanted one with his lag and he goes to it at
 * `freeSpeed` (stage/mind.ts). Making room (`separated`) applies after the lag, so it is immediate.
 */
export function step(state: StageState): void {
  remember(state);
  const snapshot = positionsOf(state);
  const fixture = state.fixture;
  const ballMetres = snapshot.map((p) => dist(p, state.ball.pos));
  const seens = fixture.players.map((spec) => seenBy(state, spec.index, ballMetres[spec.index]));
  const zoneOf = (i: number): Vec => {
    const s = seens[i];
    return nominalSpot(
      { fixture, ball: s.ref, team: s.team, phase: s.phase, positions: snapshot },
      i,
    );
  };
  const canMark = (i: number): boolean => {
    const spec = fixture.players[i];
    return (
      spec.team !== state.team &&
      spec.slot !== 0 &&
      state.live &&
      !state.orders.has(i) &&
      !state.cues.has(i) &&
      !isPressRole(state, spec.team, i, snapshot) &&
      seens[i].team !== spec.team
    );
  };
  assignMarks(state, snapshot, zoneOf, canMark);
  trackPress(state, snapshot);
  const turn = turnOf(state);
  // Defenders by slot line share a lag even in a back three/five; their hold radii remain personal.
  const lineDiscipline = fixture.teams.map((team) => {
    const line = presentPlayers(fixture, team.id).filter((p) => lineOf(p.position) === 'DF');
    return line.length ? line.reduce((sum, p) => sum + p.discipline, 0) / line.length : 50;
  });
  const onBody: boolean[] = [];
  const moves: { target: Vec; speed: number }[] = state.fixture.players.map((spec) => {
    const i = spec.index;
    if (!onPitch(fixture, i)) return { target: snapshot[i], speed: 0 };
    const order = state.orders.get(i) ?? state.cues.get(i);
    if (order) {
      onBody[i] = true;
      const target = typeof order.target === 'function' ? order.target() : order.target;
      const speed = speedAt(state, i, order.pace, order.speedCap, order.boost);
      return { target: clampToPitch(target, -STAGING_CONFIG.stage.boards), speed };
    }
    const metres = ballMetres[i];
    const want = defaultTarget(state, i, snapshot, seens[i]);
    if (want.direct) {
      onBody[i] = true;
      const target = separated(state, i, want.target, snapshot);
      return {
        target: clampToPitch(target, -STAGING_CONFIG.stage.boards),
        speed: speedAt(state, i, want.pace),
      };
    }
    const mind = state.minds[i];
    followPlace(
      mind,
      want.target,
      placeLag(spec, metres, turn, state.marks.has(i), lineDiscipline[spec.team]),
    );
    const target = clampToPitch(
      separated(state, i, mind.place, snapshot),
      -STAGING_CONFIG.stage.boards,
    );
    const d = dist(snapshot[i], target);
    // He runs for a counter once he has seen it: before that his place is the old one.
    const run = turn?.counter && seens[i].team === state.team ? turn : undefined;
    const cap = speedAt(state, i, run && d > TURN.sprintBeyond ? 'sprint' : 'run');
    return { target, speed: freeSpeed(d, metres, cap, run, spec.discipline) };
  });
  const keep = state.keepOut;
  if (keep) {
    moves.forEach((move, i) => {
      if (state.fixture.players[i].team === keep.team)
        move.target = keptOut(keep, move.target, fixture.period);
    });
  }
  const tick = STAGING_CONFIG.tick;
  state.targets = moves.map((m) => m.target);
  moves.forEach((move, i) => {
    const body = state.bodies[i];
    if (!onPitch(fixture, i)) return;
    advanceBody(body, move.target, move.speed, tick);
    atBoards(body);
    // He eases back into the shape from where he stands when his order or direct role ends.
    if (onBody[i]) state.minds[i].place = [body.pos[0], body.pos[1]];
  });
  state.tickCount += 1;
  state.t = Math.round(state.tickCount * tick * 1000) / 1000;
  // The record's clock runs one match second per staged second in live play, never past the next beat's.
  if (state.clock !== undefined && state.live) {
    state.clock = Math.min(state.clock + tick, state.clockCap);
  }
  updateBall(state);
  recordFrame(state);
}

/** Steps until `done()` is true (checked before each step) or `maxSeconds` have passed. */
export function* runUntil(
  state: StageState,
  done: () => boolean,
  maxSeconds: number,
): Generator<void, void> {
  const end = state.t + maxSeconds;
  while (!done() && state.t < end - 1e-9) yield* nextTick(state);
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
  if (beat.team !== state.team) {
    state.turnedAt = state.t;
    state.lostBy = state.live ? state.team : undefined;
    if (state.live) state.turn = { at: state.t, counter: beat.phase === 'counter' };
  }
  state.team = beat.team;
  state.phase = beat.phase;
  state.beat = beat.index;
  state.tight = beat.reason === 'pressed';
}

const BOUND_WAIT = 5;

/** Whether player `index` is still out of `stage.controlRange` of the ball (a late winner). */
export function isLate(state: StageState, index: number): boolean {
  return dist(state.bodies[index].pos, state.ball.pos) > STAGING_CONFIG.stage.controlRange;
}

/** Makes sure `actor` has the ball: he goes to it (a loose ball rolls toward him) and takes it. */
export function* ensureOwner(state: StageState, actor: number): Generator<void, void> {
  const ball = state.ball;
  if (ball.mode === 'held' && ball.owner === actor) return;
  if (ball.mode !== 'dead') {
    ball.mode = 'loose';
    ball.owner = -1;
    delete ball.flight;
  }
  state.orders.set(actor, { target: () => state.ball.pos, pace: 'sprint' });
  const stage = STAGING_CONFIG.stage;
  // A bound script's man is never replaced, so the ball waits for him (a pitch's length at most).
  const end = state.t + stage.settleMax * BOUND_WAIT;
  const near = (): boolean => dist(state.bodies[actor].pos, ball.pos) <= stage.controlRange;
  while (!near() && state.t < end - 1e-9) {
    if (ball.mode === 'loose') {
      const p = approach(
        ball.pos,
        state.bodies[actor].pos,
        STAGING_CONFIG.ball.roll * STAGING_CONFIG.tick,
      );
      ball.pos = [p[0], p[1]];
    }
    yield* nextTick(state);
  }
  state.orders.delete(actor);
  giveBall(state, actor);
}

/** Pause before each tick so the caller can honour a strict staging bound. */
export function* nextTick(state: StageState): Generator<void, void> {
  yield;
  step(state);
}
