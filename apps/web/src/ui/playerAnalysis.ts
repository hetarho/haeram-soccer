import type { Line, Metrics, Player, Position } from '../../../../packages/contracts/src/types';
import { LINES } from '../../../../packages/contracts/src/player';
import { lineOf } from '../../../../packages/engine/src/player';
import { overall } from '../../../../packages/engine/src/player-state';
import type { PlayerTally } from '../runtime/playerTallies';
/** The view's counts live with the Worker's read models; these names stay for the UI. */
export {
  appearanceCounts,
  tallies,
  type Appearances,
  type PlayerTally,
  type Tallies,
} from '../runtime/playerTallies';
export type PlayerScope = 'season' | 'career';
export type PlayerOrder = 'roster' | 'ability' | 'minutes' | 'fatigue' | 'goals90';

export function per90(metrics: Metrics, index: number) {
  return metrics[10] > 0 ? (metrics[index] * 90) / metrics[10] : undefined;
}
/** A tally's season or career value. */
export const ofScope = (pair: [number, number] | undefined, scope: PlayerScope) =>
  pair?.[scope === 'season' ? 0 : 1] ?? 0;
/** "12경기", or "12경기 · 교체 3" when he came on in some of them. */
export function appearanceText(tally: PlayerTally | undefined, scope: PlayerScope) {
  const sub = ofScope(tally?.sub, scope);
  return `${ofScope(tally?.apps, scope)}경기${sub ? ` · 교체 ${sub}` : ''}`;
}
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
/** A roster filter: everyone, a line, or one of the 14 positions (→WEB-55). */
export type PositionFilter = Line | Position | 'all';
/**
 * Whether a player counts under a filter (→WEB-55): under every position he plays at 준수 or better,
 * and under the line of each of them.
 */
export function playsUnder(p: Pick<Player, 'positions'>, filter: PositionFilter) {
  if (filter === 'all') return true;
  const at = Object.entries(p.positions) as [Position, number][];
  return (LINES as readonly string[]).includes(filter)
    ? at.some(([position, level]) => level >= 2 && lineOf(position) === filter)
    : (p.positions[filter as Position] ?? 0) >= 2;
}
export function explorePlayers(
  players: Player[],
  options: {
    scope: PlayerScope;
    role: PositionFilter;
    query: string;
    minutes: number;
    order: PlayerOrder;
  },
) {
  const listed = players.filter(
    (p) =>
      (p.status === 'active' || options.scope === 'career') &&
      playsUnder(p, options.role) &&
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
