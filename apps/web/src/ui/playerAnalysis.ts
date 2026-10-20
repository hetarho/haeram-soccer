import type {
  Line,
  Metrics,
  Player,
  Position,
  World,
} from '../../../../packages/contracts/src/types';
import { LINES } from '../../../../packages/contracts/src/player';
import { heatMap, MATERIAL_LAYOUT, ownSideOf } from '../../../../packages/engine/src/material';
import { lineOf } from '../../../../packages/engine/src/player';
import { overall } from '../../../../packages/engine/src/world';
import { cardCounts, leagueReds, perOwnMatches } from './discipline';
export type PlayerScope = 'season' | 'career';
export type PlayerOrder = 'roster' | 'ability' | 'minutes' | 'fatigue' | 'goals90';

export function per90(metrics: Metrics, index: number) {
  return metrics[10] > 0 ? (metrics[index] * 90) / metrics[10] : undefined;
}
export interface Appearances {
  season: number;
  career: number;
  seasonSub: number;
  careerSub: number;
}
/**
 * Appearances by player (→HIST-13): one per own-match record whose line for him has minutes, a
 * starter or a substitute (his ID is the `other` of a `sub` incident); a line with 0 minutes gains
 * none. Season is the season in progress, career every own match.
 */
export const appearanceCounts = perOwnMatches((w: Pick<World, 'ownMatches' | 'year'>) => {
  const counts = new Map<string, Appearances>();
  for (const m of w.ownMatches) {
    const subs = new Set(m.incidents?.flatMap((x) => (x.kind === 'sub' && x.other) || []));
    const season = m.year === w.year ? 1 : 0;
    for (const line of m.players) {
      if (!(line.metrics[10] > 0)) continue;
      let entry = counts.get(line.id);
      if (!entry)
        counts.set(line.id, (entry = { season: 0, career: 0, seasonSub: 0, careerSub: 0 }));
      const sub = subs.has(line.id) ? 1 : 0;
      entry.career++;
      entry.season += season;
      entry.careerSub += sub;
      entry.seasonSub += sub * season;
    }
  }
  return counts;
});
/** An own player's counts over every own match, season then career (→HIST-13, HIST-16). */
export interface PlayerTally {
  apps: [number, number];
  sub: [number, number];
  yellow: [number, number];
  red: [number, number];
  /** This season's touches per heat-map cell, while its matches keep their material (→MATCH-5). */
  heat?: number[];
}
/**
 * Counts every view carries: the client keeps only the latest own matches, so the host derives them
 * from all of them, again only when an own match is added or the season turns.
 */
export interface Tallies {
  /** Own players, past and present, with an appearance, a card or a touch; absent is none. */
  players: Record<string, PlayerTally>;
  /** This season's league reds by player, either side of every own match (→LEAGUE-15). */
  leagueReds: Record<string, number>;
}
export const tallies = perOwnMatches((w: World): Tallies => {
  const apps = appearanceCounts(w),
    cards = cardCounts(w);
  const heat: Record<string, number[]> = {};
  for (const m of w.ownMatches) {
    if (m.year !== w.year || !m.material) continue;
    const own = ownSideOf(m, w.playerClub);
    for (const line of m.players) {
      const map = heatMap(m, line.id, own);
      if (!map?.touches) continue;
      const sum = (heat[line.id] ??= Array<number>(MATERIAL_LAYOUT.cells).fill(0));
      map.cells.forEach((n, i) => (sum[i] += n));
    }
  }
  const players: Record<string, PlayerTally> = {};
  for (const p of w.players) {
    const a = apps.get(p.id),
      c = cards.get(p.id);
    if (!a && !c && !heat[p.id]) continue;
    players[p.id] = {
      apps: [a?.season ?? 0, a?.career ?? 0],
      sub: [a?.seasonSub ?? 0, a?.careerSub ?? 0],
      yellow: [c?.season.yellow ?? 0, c?.career.yellow ?? 0],
      red: [c?.season.red ?? 0, c?.career.red ?? 0],
      ...(heat[p.id] ? { heat: heat[p.id] } : {}),
    };
  }
  return { players, leagueReds: leagueReds(w) };
});
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
