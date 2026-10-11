import type { Metrics, Player, Role } from '../../../../packages/contracts/src/types';
import { overall } from '../../../../packages/engine/src/world';
export type PlayerScope = 'season' | 'career';
export type PlayerOrder = 'roster' | 'ability' | 'minutes' | 'fatigue' | 'goals90';

export function per90(metrics: Metrics, index: number) {
  return metrics[10] > 0 ? (metrics[index] * 90) / metrics[10] : undefined;
}
/**
 * Matches played: the engine has no substitutions and credits everyone in an own match's lineup
 * the full 90 minutes, so minutes / 90 is the exact appearance count.
 */
export const appearances = (metrics: Metrics) => Math.floor(metrics[10] / 90);
/** Where a player of ours stands now; a loan that ran out is archived as a retirement. */
export function playerStatus(p: Player) {
  return p.status === 'active'
    ? '현역'
    : p.status === 'sold'
      ? '이적'
      : p.loanUntil !== undefined
        ? '임대 종료'
        : '은퇴';
}
export function performanceRows(metrics: Metrics) {
  return (
    [
      ['골', 0],
      ['도움', 1],
      ['슈팅', 4],
      ['태클', 6],
      ['선방', 9],
    ] as const
  ).map(([label, index]) => ({ label, total: metrics[index], per90: per90(metrics, index) }));
}
export function explorePlayers(
  players: Player[],
  options: {
    scope: PlayerScope;
    role: Role | 'all';
    query: string;
    minutes: number;
    order: PlayerOrder;
  },
) {
  const listed = players.filter(
    (p) =>
      (p.status === 'active' || options.scope === 'career') &&
      (options.role === 'all' || options.role === p.role) &&
      p.name.toLowerCase().includes(options.query.trim().toLowerCase()) &&
      p[options.scope][10] >= options.minutes,
  );
  const value = (p: Player) =>
    options.order === 'ability'
      ? overall(p)
      : options.order === 'minutes'
        ? p[options.scope][10]
        : options.order === 'fatigue'
          ? -p.fatigue
          : options.order === 'goals90'
            ? (per90(p[options.scope], 0) ?? -1)
            : Number(p.status === 'active');
  return listed.sort((a, b) => value(b) - value(a) || a.id.localeCompare(b.id));
}
