// Restarts: where a dead ball is put back into play and the one beat that plays it. Spot helpers
// name the restart; out helpers give a beat's `to` over a line with the restart that follows;
// `playRestart` turns `state.pending` into its beat.
import { PROTO_CONFIG } from '../core/config.ts';
import { PITCH, clampToPitch, toAttack } from '../core/pitch.ts';
import { FORMATIONS } from '../core/shape.ts';
import type { Position, TeamId, Vec } from '../core/types.ts';
import { add, clamp, dist, norm, scale, sub } from '../core/vec.ts';
import { castOpponentNear, castReceiver, feetPoint, keeperOf, type CastRule } from './cast.ts';
import { emit } from './emit.ts';
import {
  KICK_OFF_SLOT,
  attackBall,
  freshFlags,
  other,
  phaseAt,
  spot,
  type Restart,
  type ScriptState,
} from './state.ts';

const GRAMMAR = PROTO_CONFIG.grammar;
const AIM = GRAMMAR.aim;
const AXIS = PITCH.width / 2;
const touchX = (x: number): number => clamp(x, ...AIM.touchX);

export function throwInFor(_state: ScriptState, team: TeamId, at: Vec): Restart {
  return { kind: 'throwIn', team, spot: [touchX(at[0]), at[1] < AXIS ? 0 : PITCH.width] };
}

/** On the six-yard line of `team`'s own goal, on a side drawn with one `chance(0.5)`. */
export function goalKickFor(state: ScriptState, team: TeamId): Restart {
  const side = state.rng.chance(0.5) ? 1 : -1;
  const s = AIM.goalKickSpot;
  return { kind: 'goalKick', team, spot: toAttack(team, [s.x, AXIS + s.side * side]) };
}

export function cornerFor(_state: ScriptState, team: TeamId, attackY: number): Restart {
  return {
    kind: 'corner',
    team,
    spot: toAttack(team, [PITCH.length, attackY < AXIS ? 0 : PITCH.width]),
  };
}

/** The ball leaves over the touchline nearer the ball, at that attack x; a throw-in to the other side. */
export function outToTouch(state: ScriptState, attackX: number): { to: Vec; then: Restart } {
  const near = attackBall(state)[1] < AXIS ? -AIM.outBy : PITCH.width + AIM.outBy;
  const to = toAttack(state.team, [touchX(attackX), near]);
  return { to, then: throwInFor(state, other(state.team), to) };
}

/** Over the opponents' goal line at that attack y; a goal kick to the other side. */
export function outOverByline(state: ScriptState, attackY: number): { to: Vec; then: Restart } {
  const to = toAttack(state.team, [AIM.bylineX, attackY]);
  return { to, then: goalKickFor(state, other(state.team)) };
}

/** Over the same line last touched by the defenders; a corner to the team in possession. */
export function outForCorner(state: ScriptState, attackY: number): { to: Vec; then: Restart } {
  const to = toAttack(state.team, [AIM.bylineX, attackY]);
  return { to, then: cornerFor(state, state.team, attackY) };
}

/** The player of `indexes` whose nominal spot is nearest `point`; lowest index on a tie. */
const nearest = (state: ScriptState, indexes: readonly number[], point: Vec): number => {
  let best = indexes[0];
  let bestD = Infinity;
  for (const i of indexes) {
    const d = dist(spot(state, i), point);
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
};

const teamPlayers = (state: ScriptState) => state.fixture.teams[state.team].players;

const outfieldOf = (state: ScriptState): number[] =>
  teamPlayers(state)
    .filter((p) => p.slot !== 0)
    .map((p) => p.index);

/** The nearest other outfield teammate of `actor` to his spot. */
const nearestMate = (state: ScriptState, actor: number, outfieldOnly: boolean): number => {
  const pool = teamPlayers(state)
    .filter((p) => p.index !== actor && (!outfieldOnly || p.slot !== 0))
    .map((p) => p.index);
  return nearest(state, pool, spot(state, actor));
};

const THROWERS: readonly Position[] = ['LB', 'RB', 'LW', 'RW', 'LM', 'RM'];
const KICK_OFF_RULES: readonly CastRule[] = [
  { position: 'DM', w: 2 },
  { position: 'CM', w: 2 },
];
const GOAL_KICK_RULES: readonly CastRule[] = [
  { position: 'CB', w: 3 },
  { position: 'LB', w: 1.5 },
  { position: 'RB', w: 1.5 },
];

const completeOr = (state: ScriptState, p: number): boolean => state.rng.chance(p);

type Played = { actor: number; receiver: number; to: Vec; complete: boolean };

const kickOff = (state: ScriptState): Played => {
  const actor = teamPlayers(state)[KICK_OFF_SLOT].index;
  state.holder = actor;
  const receiver = castReceiver(state, KICK_OFF_RULES) ?? nearestMate(state, actor, true);
  const k = AIM.kickOff;
  const to = toAttack(state.team, [k.x, AXIS + state.rng.range(-k.spread, k.spread)]);
  return { actor, receiver, to, complete: true };
};

const throwIn = (state: ScriptState, r: Restart): Played => {
  const throwers = teamPlayers(state)
    .filter((p) => THROWERS.includes(p.position))
    .map((p) => p.index);
  const actor = nearest(state, throwers.length > 0 ? throwers : outfieldOf(state), r.spot);
  state.holder = actor;
  const receiver = nearestMate(state, actor, true);
  const target = spot(state, receiver);
  const d = clamp(dist(r.spot, target), ...GRAMMAR.restart.throwRange);
  const to = add(r.spot, scale(norm(sub(target, r.spot)), d));
  const complete = completeOr(state, GRAMMAR.restart.throwComplete);
  return { actor, receiver, to, complete };
};

const goalKick = (state: ScriptState): Played => {
  const actor = keeperOf(state, state.team);
  state.holder = actor;
  const receiver = castReceiver(state, GOAL_KICK_RULES) ?? nearestMate(state, actor, true);
  const spec = state.fixture.players[receiver];
  const anchor = FORMATIONS[state.fixture.teams[state.team].formation].ip[spec.slot];
  // The receiver's side of the long axis; a central anchor goes left.
  const side = anchor && anchor[1] > 0 ? 1 : -1;
  const x = state.rng.range(...AIM.goalKick.x);
  const y = AXIS + side * state.rng.range(...AIM.goalKick.wide);
  const to = toAttack(state.team, [x, y]);
  const complete = completeOr(state, GRAMMAR.restart.goalKickComplete);
  return { actor, receiver, to, complete };
};

const freeKick = (state: ScriptState, r: Restart): Played => {
  const deep = toAttack(state.team, r.spot)[0] < GRAMMAR.phaseX.progression;
  const takers = deep
    ? teamPlayers(state)
        .filter((p) => p.slot === 0 || p.position === 'CB')
        .map((p) => p.index)
    : outfieldOf(state);
  const actor = nearest(state, takers, r.spot);
  state.holder = actor;
  const receiver = nearestMate(state, actor, false);
  const to = feetPoint(state, receiver);
  const complete = completeOr(state, GRAMMAR.restart.freeKickComplete);
  return { actor, receiver, to, complete };
};

const corner = (state: ScriptState): Played => {
  let actor = -1;
  let best = -Infinity;
  for (const p of teamPlayers(state)) {
    if (p.slot !== 0 && p.attrs.passing > best) {
      actor = p.index;
      best = p.attrs.passing;
    }
  }
  state.holder = actor;
  const receiver = nearestMate(state, actor, false);
  const to = feetPoint(state, receiver);
  const complete = completeOr(state, GRAMMAR.restart.cornerShortComplete);
  return { actor, receiver, to, complete };
};

/** Plays `state.pending` as one beat. */
export function playRestart(state: ScriptState): void {
  const r = state.pending;
  if (r === undefined) throw new Error('playRestart: nothing pending');
  state.pending = undefined;
  state.team = r.team;
  state.possession += 1;
  state.ball = r.spot;
  state.phase = r.kind === 'corner' ? 'setPiece' : phaseAt(r.team, r.spot);
  state.flags = freshFlags();
  state.clock += GRAMMAR.dead[r.kind];
  const hold = state.rng.range(...GRAMMAR.hold.restart);
  const played =
    r.kind === 'kickOff'
      ? kickOff(state)
      : r.kind === 'throwIn'
        ? throwIn(state, r)
        : r.kind === 'goalKick'
          ? goalKick(state)
          : r.kind === 'freeKick'
            ? freeKick(state, r)
            : corner(state);
  const { actor, receiver, complete } = played;
  const to = clampToPitch(played.to, PROTO_CONFIG.margin);
  const opponent = complete
    ? undefined
    : castOpponentNear(state, to, r.kind === 'goalKick' ? { lines: ['FW'] } : {});
  emit(state, {
    move: r.kind,
    kind: r.kind,
    actor,
    receiver,
    to,
    hold,
    outcome: complete ? 'complete' : 'intercepted',
    opponent,
  });
}
