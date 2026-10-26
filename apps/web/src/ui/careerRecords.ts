import type { Player, SeasonArchive, World } from '../../../../packages/contracts/src/types';
import { divisionName } from '../presentation/competitionLabels';

export { divisionName };

/** The highest finish: the top division first, then the rank; the earliest season breaks ties. */
function bestFinish(history: readonly SeasonArchive[]) {
  return history
    .filter((h) => h.played > 0)
    .sort((a, b) => a.tier - b.tier || a.rank - b.rank || a.year - b.year)[0];
}

/**
 * The club's all-time boards, read from every player's club career; sold and retired players keep
 * theirs. The appearance board ranks by minutes played; match counts come from the view's tallies.
 */
export const LEADER_BOARDS = [
  { key: 'apps', title: '역대 최다 출전', short: '출전', index: 10 },
  { key: 'goals', title: '역대 최다 득점', short: '득점', index: 0 },
  { key: 'assists', title: '역대 최다 도움', short: '도움', index: 1 },
  { key: 'saves', title: '역대 골키퍼 최다 선방', short: '선방', index: 9, position: 'GK' },
] as const;
export type LeaderBoard = (typeof LEADER_BOARDS)[number];

const onBoard = (board: LeaderBoard, p: Player) =>
  p.career[board.index] > 0 && (!('position' in board) || p.position === board.position);

/** A board's top `limit`; equal records list the lower player ID first, as in the record book. */
export function clubLeaders(players: readonly Player[], board: LeaderBoard, limit = 10) {
  return players
    .filter((p) => onBoard(board, p))
    .sort((a, b) => b.career[board.index] - a.career[board.index] || a.id.localeCompare(b.id))
    .slice(0, limit);
}

/** Places down a board's listing: equal records share one, the next place skips past them. */
export function boardPlaces(leaders: readonly Player[], board: LeaderBoard) {
  const places: number[] = [];
  leaders.forEach((p, i) =>
    places.push(
      i && p.career[board.index] === leaders[i - 1].career[board.index] ? places[i - 1] : i + 1,
    ),
  );
  return places;
}

export const leaderBoard = (key: LeaderBoard['key']) =>
  LEADER_BOARDS.find((board) => board.key === key)!;

/**
 * The boards a player stands in the top 10 of: his place is one more than the players above him,
 * and `shared` when another player has the same record.
 */
export function clubRanks(players: readonly Player[], id: string) {
  const player = players.find((p) => p.id === id);
  if (!player) return [];
  return LEADER_BOARDS.flatMap((board) => {
    if (!onBoard(board, player)) return [];
    const value = player.career[board.index],
      rivals = players.filter((p) => onBoard(board, p) && p.id !== id);
    const rank = rivals.filter((p) => p.career[board.index] > value).length + 1;
    const shared = rivals.some((p) => p.career[board.index] === value);
    return rank <= 10 ? [{ board, rank, shared }] : [];
  });
}

export function careerRecords(w: World) {
  const seasons = w.history.filter((h) => h.played > 0);
  const best = (compare: (a: SeasonArchive, b: SeasonArchive) => number) =>
    seasons.slice().sort((a, b) => compare(a, b) || a.year - b.year)[0];
  const leader = (key: LeaderBoard['key']) => clubLeaders(w.players, leaderBoard(key), 1)[0];
  return {
    seasons: w.history.length,
    finish: bestFinish(w.history),
    points: best((a, b) => b.points * a.played - a.points * b.played),
    attack: best((a, b) => b.gf * a.played - a.gf * b.played),
    supporters: w.history.slice().sort((a, b) => b.fans - a.fans || a.year - b.year)[0],
    scorer: leader('goals'),
    creator: leader('assists'),
    keeper: leader('saves'),
  };
}

/** Continental competitions by standing; a renamed competition keeps its place. */
const CONTINENTAL_ORDER = ['ucl', 'cwc', 'uel', 'uecl', 'super'];

/**
 * The trophy cabinet from the season archives alone: league titles by division; moves up and down
 * the pyramid, each archive against the next and the last against the division played now; the
 * domestic cup's wins and finals, counted only in seasons whose cup run was recorded; continental
 * titles under the competition's name that season; and the best finish.
 */
export function trophyCabinet(w: World) {
  const own = w.clubs.find((c) => c.id === w.playerClub)!;
  const titles = new Map<number, number[]>();
  const continental = new Map<string, { kind: string; years: number[] }>();
  const cup = { wins: [] as number[], finals: [] as number[], unrecorded: 0 };
  // Each move is filed under the season at whose close it happened.
  const promotions: number[] = [],
    relegations: number[] = [];
  w.history.forEach((h, i) => {
    if (h.rank === 1) titles.set(h.tier, [...(titles.get(h.tier) ?? []), h.year]);
    const next = w.history[i + 1]?.tier ?? own.tier;
    if (next < h.tier) promotions.push(h.year);
    else if (next > h.tier) relegations.push(h.year);
    if (!h.runs) cup.unrecorded++;
    const run = h.runs?.find((r) => r.key === 'cup');
    if (run?.champion) cup.wins.push(h.year);
    if (run && (run.champion || run.reached === '결승')) cup.finals.push(h.year);
    for (const e of h.europe) {
      if (e.winner !== w.playerClub) continue;
      const entry = continental.get(e.name) ?? { kind: e.kind, years: [] };
      entry.years.push(h.year);
      continental.set(e.name, entry);
    }
  });
  const order = (kind: string) =>
    CONTINENTAL_ORDER.includes(kind) ? CONTINENTAL_ORDER.indexOf(kind) : CONTINENTAL_ORDER.length;
  return {
    seasons: w.history.length,
    league: [...titles]
      .sort(([a], [b]) => a - b)
      .map(([tier, years]) => ({ tier, label: divisionName(own.country, tier), years })),
    promotions,
    relegations,
    cup,
    continental: [...continental]
      .map(([name, entry]) => ({ name, ...entry }))
      .sort((a, b) => order(a.kind) - order(b.kind) || a.years[0] - b.years[0]),
    best: bestFinish(w.history),
  };
}
