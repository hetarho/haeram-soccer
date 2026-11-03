import { describe, expect, it } from 'vitest';
import type { SeasonArchive, World } from '../../../../packages/contracts/src/types';
import { careerWorld } from '../../../../packages/engine/src/career.testkit';
import {
  boardPlaces,
  careerRecords,
  clubLeaders,
  clubRanks,
  divisionName,
  leaderBoard,
  LEADER_LIMIT,
  nextLeaderCount,
  trophyCabinet,
} from './careerRecords';
import { playerStatus } from './playerAnalysis';

const world = () => careerWorld({ country: 'ENG', seed: 'book' });
const season = (year: number, fields: Partial<SeasonArchive> = {}): SeasonArchive => ({
  year,
  tier: 3,
  group: 0,
  rank: 1,
  points: 40,
  played: 20,
  won: 0,
  drawn: 0,
  lost: 0,
  gf: 40,
  ga: 0,
  cash: '0',
  currency: 'GBP-LSD',
  income: '0',
  expense: '0',
  fans: 1000,
  rating: 40,
  manager: 'Manager',
  metrics: Array<number>(12).fill(0),
  standings: [],
  champions: [],
  europe: [],
  ...fields,
});

it('uses denominator-aware season records and retains inactive leaders without mutation', () => {
  const w = world();
  expect(careerRecords(w).finish).toBeUndefined();
  expect(careerRecords(w).scorer).toBeUndefined();
  w.history = [
    season(1952, { points: 40, gf: 40 }),
    season(1951, { points: 30, played: 10, gf: 30 }),
  ];
  w.players[0].career[0] = 7;
  w.players[0].status = 'retired';
  const before = JSON.stringify(w),
    records = careerRecords(w);
  expect(records.points!.year).toBe(1951);
  expect(records.attack!.year).toBe(1951);
  expect(records.finish!.year).toBe(1951);
  expect(records.scorer!.status).toBe('retired');
  expect(records.supporters!.year).toBe(1951);
  expect(JSON.stringify(w)).toBe(before);
});

it('starts the record book and the cabinet at the takeover (→HIST-21, WEB-28)', () => {
  const w = world();
  expect(w.owner!.takeover.year).toBe(1950);
  // The world's seasons before the takeover keep every own-club field empty, honours aside.
  const before = season(1948, {
    tier: 0,
    rank: 0,
    points: 0,
    played: 0,
    gf: 0,
    fans: 0,
    europe: [{ kind: 'ucl', name: 'European Cup', winner: w.playerClub, field: 16 }],
  });
  w.history = [before, season(1949, { tier: 0, rank: 0, played: 0 }), season(1950, { tier: 2 })];
  w.clubs.find((c) => c.id === w.playerClub)!.tier = 2;
  const records = careerRecords(w),
    cabinet = trophyCabinet(w);
  expect(records.seasons).toBe(1);
  expect(records.supporters!.year).toBe(1950);
  expect(cabinet.seasons).toBe(1);
  expect(cabinet.continental).toEqual([]);
  // No move is read between the world's top-flight placeholder and the club's first season.
  expect(cabinet.promotions).toEqual([]);
  expect(cabinet.relegations).toEqual([]);
});

describe('division names', () => {
  it('adds the regional group only where the division has groups', () => {
    expect(divisionName('ENG', 1, 0)).toBe('2부');
    expect(divisionName('ENG', 3, 0)).toBe('4부');
    expect(divisionName('ITA', 2, 1)).toBe('3부 B조');
    expect(divisionName('ITA', 2)).toBe('3부');
  });
});

describe('trophy cabinet', () => {
  const won = (w: World, kind: string, name: string) => ({
    kind,
    name,
    winner: w.playerClub,
    field: 32,
  });
  it('counts titles by division, every move between divisions, cups and continental titles', () => {
    const w = world();
    const own = w.clubs.find((c) => c.id === w.playerClub)!;
    w.history = [
      // Fourth-division champions, then up into the third.
      season(1950, { tier: 3, rank: 1, runs: [] }),
      season(1951, { tier: 2, rank: 1, runs: [{ key: 'cup', name: 'FA Cup', reached: '결승' }] }),
      // One season in the second division, down again with the cup and a continental title.
      season(1952, {
        tier: 1,
        rank: 22,
        runs: [{ key: 'cup', name: 'FA Cup', reached: '결승', champion: true }],
        europe: [
          won(w, 'cwc', 'Cup Winners Cup'),
          { kind: 'ucl', name: 'European Cup', winner: 'someone', field: 32 },
        ],
      }),
      // A season closed before cup runs were recorded: its cup counts nowhere.
      season(1953, {
        tier: 2,
        rank: 1,
        europe: [won(w, 'ucl', 'European Cup'), won(w, 'super', 'UEFA Super Cup')],
      }),
    ];
    // The last archive is compared with the division played now.
    own.tier = 1;
    const cabinet = trophyCabinet(w);
    expect(cabinet.seasons).toBe(4);
    expect(cabinet.league).toEqual([
      { tier: 2, label: '3부', years: [1951, 1953] },
      { tier: 3, label: '4부', years: [1950] },
    ]);
    expect(cabinet.promotions).toEqual([1950, 1951, 1953]);
    expect(cabinet.relegations).toEqual([1952]);
    expect(cabinet.cup).toEqual({ wins: [1952], finals: [1951, 1952], unrecorded: 1 });
    // Continental titles by standing, whatever season they came in.
    expect(cabinet.continental).toEqual([
      { name: 'European Cup', kind: 'ucl', years: [1953] },
      { name: 'Cup Winners Cup', kind: 'cwc', years: [1952] },
      { name: 'UEFA Super Cup', kind: 'super', years: [1953] },
    ]);
    // The highest division reached beats a better rank lower down.
    expect(cabinet.best?.year).toBe(1952);
    own.tier = 2;
    expect(trophyCabinet(w).promotions).toEqual([1950, 1951]);
  });

  it('keeps an empty cabinet for a club without a closed season', () => {
    const cabinet = trophyCabinet(world());
    expect(cabinet).toMatchObject({ seasons: 0, league: [], promotions: [], relegations: [] });
    expect(cabinet.best).toBeUndefined();
  });
});

describe('all-time boards', () => {
  it('orders by record with equal records sharing a place, listed by player ID', () => {
    const w = world();
    for (const p of w.players) p.career = p.career.map(() => 0);
    const [a, b, c, d, keeper] = [
      ...w.players.filter((p) => p.position !== 'GK').slice(0, 4),
      w.players.find((p) => p.position === 'GK')!,
    ];
    a.career[0] = 5;
    b.career[0] = 7;
    c.career[0] = 5;
    d.career[0] = 1;
    // A player who left keeps his club career on the boards.
    d.status = 'sold';
    keeper.career[9] = 30;
    a.career[9] = 2;
    a.career[10] = 90 * 12;
    keeper.career[10] = 90 * 40;
    const goals = leaderBoard('goals');
    const tied = [a.id, c.id].sort((x, y) => x.localeCompare(y));
    const leaders = clubLeaders(w.players, goals);
    expect(leaders.map((p) => p.id)).toEqual([b.id, ...tied, d.id]);
    expect(boardPlaces(leaders, goals)).toEqual([1, 2, 2, 4]);
    expect(clubLeaders(w.players, goals, 2)).toHaveLength(2);
    // Saves count only goalkeepers.
    expect(clubLeaders(w.players, leaderBoard('saves')).map((p) => p.id)).toEqual([keeper.id]);
    expect(clubLeaders(w.players, leaderBoard('apps')).map((p) => p.id)).toEqual([keeper.id, a.id]);
    expect(clubRanks(w.players, a.id)).toEqual([
      { board: leaderBoard('apps'), rank: 2, shared: false },
      { board: leaderBoard('goals'), rank: 2, shared: true },
    ]);
    expect(clubRanks(w.players, d.id)).toEqual([
      { board: leaderBoard('goals'), rank: 4, shared: false },
    ]);
    expect(playerStatus(d)).toBe('이적');
  });

  it('leaves a player off a board below tenth place', () => {
    const w = world();
    const outfield = w.players.filter((p) => p.position !== 'GK').slice(0, 11);
    outfield.forEach((p, i) => (p.career[1] = 20 - i));
    const last = outfield[10];
    expect(clubLeaders(w.players, leaderBoard('assists'))).toHaveLength(10);
    expect(clubRanks(w.players, last.id).some(({ board }) => board.key === 'assists')).toBe(false);
  });

  it('pages 선수 통산 ten at a time up to a hundred players (→WEB-54)', () => {
    // A century of club history: 101 scorers, each with a distinct total.
    const base = world().players.find((p) => p.position !== 'GK')!;
    const scorers = Array.from({ length: 101 }, (_, i) => {
      const p = structuredClone(base);
      p.id = `scorer-${String(i).padStart(3, '0')}`;
      p.career[0] = 200 - i;
      return p;
    });
    const all = clubLeaders(scorers, leaderBoard('goals'), LEADER_LIMIT);
    expect(all).toHaveLength(100);
    expect(all.at(-1)!.id).toBe(scorers[99].id);
    expect(nextLeaderCount(10, all.length)).toBe(20);
    expect(nextLeaderCount(90, all.length)).toBe(100);
    // At the limit or the board's end there is nothing more to show.
    expect(nextLeaderCount(100, all.length)).toBe(100);
    expect(nextLeaderCount(10, 14)).toBe(14);
    expect(nextLeaderCount(14, 14)).toBe(14);
    expect(nextLeaderCount(95, 120)).toBe(100);
  });
});
