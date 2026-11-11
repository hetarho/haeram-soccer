// Who plays a part in a beat: weighted receivers by role, position or line, the opponent nearest a
// point, outcome draws and aim points. Draw order is part of the script's identity: `castReceiver`
// draws exactly one number when a candidate exists and none otherwise, `drawOutcome` one,
// `feetPoint` two (x then y), `stridePoint`, `canCast` and `castOpponentNear` none.
import { PROTO_CONFIG } from '../core/config.ts';
import { CENTRE, clampToPitch, toAttack } from '../core/pitch.ts';
import type { Rng } from '../core/rng.ts';
import {
  lineOf,
  type Line,
  type PlayerSpec,
  type Position,
  type RoleId,
  type TeamId,
  type Vec,
} from '../core/types.ts';
import { add, clamp, dist, norm, scale, sub } from '../core/vec.ts';
import { attackSpot, other, spot, type ScriptState } from './state.ts';

export interface CastRule {
  role?: RoleId;
  position?: Position;
  line?: Line;
  w: number;
}

const GRAMMAR = PROTO_CONFIG.grammar;

/** Weight of a player under the rules: a matching role rule wins, else a matching position rule, else a matching line rule, else 0. */
export function ruleWeight(p: PlayerSpec, rules: readonly CastRule[]): number {
  const byRole = rules.find((r) => r.role !== undefined && r.role === p.role);
  if (byRole) return byRole.w;
  const byPosition = rules.find(
    (r) => r.role === undefined && r.position !== undefined && r.position === p.position,
  );
  if (byPosition) return byPosition.w;
  const line = lineOf(p.position);
  const byLine = rules.find(
    (r) =>
      r.role === undefined && r.position === undefined && r.line !== undefined && r.line === line,
  );
  return byLine ? byLine.w : 0;
}

/** Teammates of the holder (never the holder) with their weights. */
const candidates = (
  state: ScriptState,
  rules: readonly CastRule[],
  extra: (index: number) => number,
): { indexes: number[]; weights: number[]; total: number } => {
  const indexes: number[] = [];
  const weights: number[] = [];
  let total = 0;
  for (const p of state.fixture.teams[state.team].players) {
    if (p.index === state.holder) continue;
    const e = extra(p.index);
    if (!Number.isFinite(e) || e < 0) throw new Error(`castReceiver: bad extra weight ${e}`);
    const w = ruleWeight(p, rules) * e;
    indexes.push(p.index);
    weights.push(w);
    total += w;
  }
  return { indexes, weights, total };
};

const one = (): number => 1;

/**
 * One teammate of the holder (never the holder) drawn by `ruleWeight × extra(index)`; undefined when every weight is 0.
 * `extra` defaults to 1; it must return a finite number ≥ 0.
 */
export function castReceiver(
  state: ScriptState,
  rules: readonly CastRule[],
  extra: (index: number) => number = one,
): number | undefined {
  const c = candidates(state, rules, extra);
  if (!(c.total > 0)) return undefined;
  return state.rng.pick(c.indexes, c.weights);
}

/** Whether `castReceiver` would find anyone (draws nothing). */
export function canCast(
  state: ScriptState,
  rules: readonly CastRule[],
  extra: (index: number) => number = one,
): boolean {
  return candidates(state, rules, extra).total > 0;
}

/**
 * The opponent of the team in possession whose nominal spot is nearest to `point` (world frame);
 * outfield only unless `keeper` is true (then the keeper competes too); `lines` restricts the lines
 * and is ignored when it leaves nobody.
 */
export function castOpponentNear(
  state: ScriptState,
  point: Vec,
  opts: { lines?: readonly Line[]; keeper?: boolean } = {},
): number {
  const players = state.fixture.teams[other(state.team)].players;
  const outfield = players.filter((p) => p.slot !== 0);
  const lines = opts.lines;
  const lined = lines ? outfield.filter((p) => lines.includes(lineOf(p.position))) : outfield;
  const pool = [...(opts.keeper ? [players[0]] : []), ...(lined.length > 0 ? lined : outfield)];
  let best = pool[0].index;
  let bestD = Infinity;
  for (const p of pool) {
    const d = dist(spot(state, p.index), point);
    if (d < bestD || (d === bestD && p.index < best)) {
      best = p.index;
      bestD = d;
    }
  }
  return best;
}

/** Index of that team's slot 0. */
export function keeperOf(state: ScriptState, team: TeamId): number {
  return state.fixture.teams[team].players[0].index;
}

/** `clamp(base + (attr - 60) * k, 0.02, 0.98)`. */
export function prob(base: number, attr: number, k: number): number {
  const p = GRAMMAR.prob;
  return clamp(base + (attr - p.pivot) * k, p.min, p.max);
}

/** One outcome by its probability; the entries need not sum to 1 (they are normalised). */
export function drawOutcome<T extends string>(
  rng: Rng,
  table: readonly (readonly [T, number])[],
): T {
  return rng.pick(
    table.map((e) => e[0]),
    table.map((e) => Math.max(0, e[1])),
  );
}

/**
 * `p` when it is at least `grammar.minPass` from the ball; otherwise the point `grammar.minPass`
 * from the ball along ball → `p` (ball → his `spot` when `p` is on the ball, toward the pitch's
 * centre when that is too), kept inside the pitch margin. Draws nothing.
 */
function spaced(state: ScriptState, index: number, p: Vec): Vec {
  const ball = state.ball;
  if (dist(ball, p) >= GRAMMAR.minPass) return p;
  const toward = (q: Vec): Vec | undefined => (dist(ball, q) > 1e-6 ? q : undefined);
  const aim = toward(p) ?? toward(spot(state, index)) ?? CENTRE;
  return clampToPitch(add(ball, scale(norm(sub(aim, ball)), GRAMMAR.minPass)), PROTO_CONFIG.margin);
}

/**
 * His `spot` moved `grammar.showFor` metres toward the ball, plus ± jitter on each axis (x then y),
 * never nearer to the ball than `grammar.minPass` (`spaced`).
 */
export function feetPoint(state: ScriptState, index: number): Vec {
  const s = spot(state, index);
  const shown = add(s, scale(norm(sub(state.ball, s)), GRAMMAR.showFor));
  const jx = state.rng.range(-GRAMMAR.jitter, GRAMMAR.jitter);
  const jy = state.rng.range(-GRAMMAR.jitter, GRAMMAR.jitter);
  return clampToPitch(spaced(state, index, [shown[0] + jx, shown[1] + jy]), PROTO_CONFIG.margin);
}

/** His `attackSpot` plus `[ahead, 0]`, back in the world frame, kept `grammar.minPass` from the ball (`spaced`). */
export function stridePoint(state: ScriptState, index: number, ahead: number): Vec {
  const a = attackSpot(state, index);
  return spaced(
    state,
    index,
    clampToPitch(toAttack(state.team, [a[0] + ahead, a[1]]), PROTO_CONFIG.margin),
  );
}
