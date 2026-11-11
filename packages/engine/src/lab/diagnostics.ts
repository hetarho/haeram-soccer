import type { AggregateMatch } from '../aggregate/engine';
import { slotAt } from '../aggregate/participation';
import { cellBand } from '../grid/pitch';

/**
 * The aggregate ledger's readings for the target rows its cells resolve: open-play pass attempts by
 * the band they end in against the band they start in, each shot's cell, kind and its shooter's
 * line at his slot then, and the seconds the ball was in play.
 */
export function ledgerDiagnostics(match: AggregateMatch) {
  const { facts, participation, input, players } = match;
  const directions: [number[], number[]] = [
    [0, 0, 0],
    [0, 0, 0],
  ];
  let ballInPlay = 0;
  facts.ledger.sides.forEach((side, s) => {
    for (const m of side.moves) {
      if (m.setPiece || m.kind === 'carry' || m.kind === 'takeOn') continue;
      const d = cellBand(m.to) - cellBand(m.from);
      directions[s]![d > 0 ? 0 : d === 0 ? 1 : 2]! += m.attempts;
    }
    for (const held of side.held) ballInPlay += held;
  });
  const shooters = new Map(players.shots.map((c) => [`${c.side}:${c.shot}`, c.shooter]));
  const shots = facts.ledger.sides.flatMap((side, s) =>
    side.shots.map((shot, i) => {
      const shooter = shooters.get(`${s}:${i}`);
      const slot =
        shooter === undefined ? undefined : slotAt(participation, s as 0 | 1, shooter, shot.minute);
      return {
        side: s as 0 | 1,
        cell: shot.cell,
        header: shot.header,
        setPiece: shot.kind === 'corner' || shot.kind === 'freeKick',
        penalty: shot.kind === 'penalty',
        goal: shot.outcome === 'goal',
        line: slot === undefined ? 'unknown' : input.sides[s as 0 | 1].slots[slot]!.line,
      };
    }),
  );
  return { ballInPlay, directions, shots };
}
