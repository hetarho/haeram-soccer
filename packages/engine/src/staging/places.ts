/** Adapt dense stage bodies to the shared slot-shape leaf. */
import { FORMATIONS } from '../formations';
import { nominalSpot as slotSpot } from './shape';
import { toAttack } from './pitch';
import type { Fixture, Phase, TeamId, Vec } from './types';
import { presentPlayers } from './types';
export { ROLE_SHAPE } from './shape';

/** Shared shape inputs for one tick snapshot; rebuild after membership or slots change. */
export function prepareSpots(fixture: Fixture, positions?: readonly Vec[]) {
  const period = fixture.period;
  const canonical = (p: Vec): Vec => toAttack(0, p, period);
  const sides = fixture.teams.map((side) => {
    const current = presentPlayers(fixture, side.id);
    const roles = FORMATIONS[side.style].slots.map((s) => s.role);
    const freedom = Array<number>(11).fill(50);
    const present = Array<boolean>(11).fill(false);
    for (const p of current) {
      const slot = p.slot;
      if (!Number.isInteger(slot) || slot < 0 || slot >= 11 || present[slot]) continue;
      roles[slot] = p.role ?? roles[slot];
      freedom[slot] = p.freedom ?? 50;
      present[slot] = true;
    }
    return { tactic: side.style, roles, freedom, present };
  }) as unknown as Parameters<typeof slotSpot>[0]['sides'];
  const offside = positions
    ? ([offsideLineX(fixture, positions, 0), offsideLineX(fixture, positions, 1)] as const)
    : undefined;
  return (ball: Vec, team: TeamId, phase: Phase, index: number): Vec => {
    const p = fixture.players[index];
    return canonical(
      slotSpot(
        {
          sides,
          ball: canonical(ball),
          team,
          phase,
          ...(offside ? { offside } : {}),
        },
        p.team,
        p.slot,
      ),
    );
  };
}

export function nominalSpot(
  ctx: { fixture: Fixture; ball: Vec; team: TeamId; phase: Phase; positions?: readonly Vec[] },
  index: number,
): Vec {
  return prepareSpots(ctx.fixture, ctx.positions)(ctx.ball, ctx.team, ctx.phase, index);
}

/** Actual second-last defender in the attacking frame; no sampled body is replaced by a slot. */
export function offsideLineX(fixture: Fixture, positions: readonly Vec[], team: TeamId): number {
  const xs = presentPlayers(fixture, team === 0 ? 1 : 0)
    .map((p) => toAttack(team, positions[p.index], fixture.period)[0])
    .sort((a, b) => b - a);
  return Math.max(xs[1] ?? 105, 52.5);
}
