// Marking (T817): each free defender who believes his side is defending picks up one man near his
// zone place and moves with him, one to one, nearest first, keeping the man of the tick before a
// little beyond the radius. Deterministic: no random number, no seed (ARCH-5); staging only
// presents beats already settled (ARCH-7). `world.ts` says who may mark and where his zone is.
import { STAGING_CONFIG } from './config';
import { ownGoal } from './pitch';
import type { Line, TeamId, Vec } from './types';
import { add, dist, lerp, norm, scale, sub } from './vec';
import type { StageState } from './world';

const MARK = STAGING_CONFIG.shape.mark;

interface Pair {
  defender: number;
  man: number;
  cost: number;
}

/**
 * Who marks whom this tick (defender index → attacker index), one to one; also stored in
 * `state.marks`. Defenders are the outfield players of the side without the ball that `canMark`
 * admits; men the outfield players of the side in possession but the ball's owner. A pair costs the
 * distance from the defender's zone place (`zoneOf`) to the man and is allowed up to
 * `shape.mark.radius`, up to `radius + keep` when the man was his the tick before. Last tick's pairs
 * still allowed are kept first (ascending defender index), then the rest by ascending cost (ties:
 * lower defender, then lower man). While the ball is dead nobody marks.
 */
export function assignMarks(
  state: StageState,
  snapshot: readonly Vec[],
  zoneOf: (index: number) => Vec,
  canMark: (index: number) => boolean,
): Map<number, number> {
  const marks = new Map<number, number>();
  if (!state.live) {
    state.marks = marks;
    return marks;
  }
  const fixture = state.fixture;
  const defending: TeamId = state.team === 0 ? 1 : 0;
  const defenders = fixture.teams[defending].players
    .filter((p) => p.slot !== 0 && canMark(p.index))
    .map((p) => p.index);
  const men = fixture.teams[state.team].players
    .filter((p) => p.slot !== 0 && p.index !== state.ball.owner)
    .map((p) => p.index);
  const zones = new Map(defenders.map((i) => [i, zoneOf(i)] as const));
  const before = state.marks;
  const pairs: Pair[] = [];
  for (const defender of defenders) {
    const zone = zones.get(defender) as Vec;
    for (const man of men) {
      const cost = dist(zone, snapshot[man]);
      const reach = before.get(defender) === man ? MARK.radius + MARK.keep : MARK.radius;
      if (cost <= reach) pairs.push({ defender, man, cost });
    }
  }
  const taken = new Set<number>();
  // The pairs of the tick before that are still allowed, by ascending defender index.
  for (const defender of defenders) {
    const man = before.get(defender);
    if (man === undefined || taken.has(man)) continue;
    if (!pairs.some((p) => p.defender === defender && p.man === man)) continue;
    marks.set(defender, man);
    taken.add(man);
  }
  pairs.sort((a, b) => a.cost - b.cost || a.defender - b.defender || a.man - b.man);
  for (const p of pairs) {
    if (marks.has(p.defender) || taken.has(p.man) || p.cost > MARK.radius) continue;
    marks.set(p.defender, p.man);
    taken.add(p.man);
  }
  state.marks = marks;
  return marks;
}

/**
 * Where a marker of `team` on `line` stands for a man at `man`, from his zone place: toward the
 * point `shape.mark.goalSide` metres goal-side of the man by the line's blend; the back line moves
 * only across (world y), keeping its depth, so the offside line and the trap stay as they are.
 */
export function markSpot(team: TeamId, line: Line, zone: Vec, man: Vec): Vec {
  if (line === 'GK') return zone;
  const m = add(man, scale(norm(sub(ownGoal(team), man)), MARK.goalSide));
  if (line === 'DF') return [zone[0], zone[1] + (m[1] - zone[1]) * MARK.blend.DF];
  return lerp(zone, m, MARK.blend[line]);
}
