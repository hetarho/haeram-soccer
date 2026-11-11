/** Adapt dense stage bodies to the shared slot-shape leaf. */
import { nominalSpot as slotSpot } from './shape';
import type { Fixture, Phase, TeamId, Vec } from './types';
export { ROLE_SHAPE } from './shape';

export function nominalSpot(
  ctx: { fixture: Fixture; ball: Vec; team: TeamId; phase: Phase; positions?: readonly Vec[] },
  index: number,
): Vec {
  const p = ctx.fixture.players[index];
  return slotSpot(
    {
      sides: ctx.fixture.teams.map((side) => ({
        tactic: side.style,
        roles: Array.from(
          { length: 11 },
          (_, slot) => side.players.find((p) => p.slot === slot)!.role,
        ),
        freedom: Array.from(
          { length: 11 },
          (_, slot) => side.players.find((p) => p.slot === slot)!.freedom,
        ),
      })) as unknown as Parameters<typeof slotSpot>[0]['sides'],
      ball: ctx.ball,
      team: ctx.team,
      phase: ctx.phase,
      ...(ctx.positions
        ? {
            offside: [
              offsideLineX(ctx.fixture, ctx.positions, 0),
              offsideLineX(ctx.fixture, ctx.positions, 1),
            ] as const,
          }
        : {}),
    },
    p.team,
    p.slot,
  );
}

/** Actual second-last defender in the attacking frame; no sampled body is replaced by a slot. */
export function offsideLineX(fixture: Fixture, positions: readonly Vec[], team: TeamId): number {
  const xs = fixture.teams[team === 0 ? 1 : 0].players
    .map((p) => (team === 0 ? positions[p.index][0] : 105 - positions[p.index][0]))
    .sort((a, b) => b - a);
  return Math.max(xs[1] ?? 105, 52.5);
}
