import { describe, expect, it } from 'vitest';
import type { SeasonArchive, World } from '../../../../packages/contracts/src/types';
import { createWorld } from '../../../../packages/engine/src/index';
import {
  boardPlaces,
  careerRecords,
  clubLeaders,
  clubRanks,
  divisionName,
  leaderBoard,
  trophyCabinet,
} from './careerRecords';
import { appearances, playerStatus } from './playerAnalysis';

const world = () =>
  createWorld({
    country: 'ENG',
    name: 'Book',
    color: '#24664f',
    seed: 'book',
    level: 'easy' as const,
  });
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
    season(1902, { points: 40, gf: 40 }),
    season(1901, { points: 30, played: 10, gf: 30 }),
  ];
  w.players[0].career[0] = 7;
  w.players[0].status = 'retired';
  const before = JSON.stringify(w),
    records = careerRecords(w);
  expect(records.points!.year).toBe(1901);
  expect(records.attack!.year).toBe(1901);
  expect(records.finish!.year).toBe(1901);
  expect(records.scorer!.status).toBe('retired');
  expect(records.supporters!.year).toBe(1901);
  expect(JSON.stringify(w)).toBe(before);
});

describe('division names', () => {
  it('adds the regional group only where the division has groups, and names the amateur league', () => {
    expect(divisionName('ENG', 1, 0)).toBe('2부');
    expect(divisionName('ITA', 2, 1)).toBe('3부 B조');
    expect(divisionName('ITA', 2)).toBe('3부');
    expect(divisionName('ENG', 4, 0)).toBe('아마추어 리그');
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
      // Amateur champions, then up into the fourth division.
      season(1950, { tier: 4, rank: 1, runs: [] }),
      season(1951, { tier: 3, rank: 1, runs: [{ key: 'cup', name: 'FA Cup', reached: '결승' }] }),
      // One season in the third division, down again with the cup and a continental title.
      season(1952, {
        tier: 2,
        rank: 22,
        runs: [{ key: 'cup', name: 'FA Cup', reached: '결승', champion: true }],
        europe: [
          won(w, 'cwc', 'Cup Winners Cup'),
          { kind: 'ucl', name: 'European Cup', winner: 'someone', field: 32 },
        ],
      }),
      // A season closed before cup runs were recorded: its cup counts nowhere.
      season(1953, {
        tier: 3,
        rank: 1,
        europe: [won(w, 'ucl', 'European Cup'), won(w, 'super', 'UEFA Super Cup')],
      }),
    ];
    // The last archive is compared with the division played now.
    own.tier = 2;
    const cabinet = trophyCabinet(w);
    expect(cabinet.seasons).toBe(4);
    expect(cabinet.league).toEqual([
      { tier: 3, label: '4부', years: [1951, 1953] },
      { tier: 4, label: '아마추어 리그', years: [1950] },
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
    own.tier = 3;
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

  it('counts appearances as whole matches of 90 minutes', () => {
    expect(appearances([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 90 * 17])).toBe(17);
    expect(appearances(Array<number>(11).fill(0))).toBe(0);
  });
});
