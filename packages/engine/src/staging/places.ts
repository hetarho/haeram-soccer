/** Adapt dense stage bodies to the shared slot-shape leaf. */
import { FORMATIONS } from '../formations';
import { nominalSpot as slotSpot } from './shape';
import { toAttack } from './pitch';
import type { Fixture, Phase, TeamId, Vec } from './types';
import { presentPlayers } from './types';
export { ROLE_SHAPE } from './shape';

export function nominalSpot(
  ctx: { fixture: Fixture; ball: Vec; team: TeamId; phase: Phase; positions?: readonly Vec[] },
  index: number,
): Vec {
  const p = ctx.fixture.players[index];
  const period = ctx.fixture.period;
  const canonical = (p: Vec): Vec => toAttack(0, p, period);
  return canonical(
    slotSpot(
      {
        sides: ctx.fixture.teams.map((side) => {
          const current = presentPlayers(ctx.fixture, side.id);
          return {
            tactic: side.style,
            roles: Array.from(
              { length: 11 },
              (_, slot) =>
                current.find((p) => p.slot === slot)?.role ??
                FORMATIONS[side.style].slots[slot].role,
            ),
            freedom: Array.from(
              { length: 11 },
              (_, slot) => current.find((p) => p.slot === slot)?.freedom ?? 50,
            ),
            present: Array.from({ length: 11 }, (_, slot) => current.some((p) => p.slot === slot)),
          };
        }) as unknown as Parameters<typeof slotSpot>[0]['sides'],
        ball: canonical(ctx.ball),
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
    ),
  );
}

/** Actual second-last defender in the attacking frame; no sampled body is replaced by a slot. */
export function offsideLineX(fixture: Fixture, positions: readonly Vec[], team: TeamId): number {
  const xs = presentPlayers(fixture, team === 0 ? 1 : 0)
    .map((p) => toAttack(team, positions[p.index], fixture.period)[0])
    .sort((a, b) => b - a);
  return Math.max(xs[1] ?? 105, 52.5);
}
