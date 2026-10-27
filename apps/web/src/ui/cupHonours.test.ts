import { describe, expect, it } from 'vitest';
import type { CupFinal, SeasonArchive } from '../../../../packages/contracts/src/types';
import { cupHonours } from './cupHonours';

type Season = Pick<SeasonArchive, 'year' | 'champions' | 'europe'>;

const clubs = [
  { id: 'ENG:0:0:1', country: 'ENG' },
  { id: 'ENG:0:0:2', country: 'ENG' },
  { id: 'ENG:club', country: 'ENG' },
  { id: 'GER:0:0:1', country: 'GER' },
  { id: 'euro:3', country: 'SCO' },
];
const final = (runnerUp: string, score: [number, number], pens = false): CupFinal => ({
  runnerUp,
  score,
  ...(pens ? { decided: 'pens' as const } : {}),
});

/**
 * Six seasons (none in 1994): England's league champion, cup winner and final, Germany's champion,
 * and the European Cup that became the Champions League in 1992.
 */
function history(): Season[] {
  const rows: [number, string, string, CupFinal | undefined, string, CupFinal | undefined][] = [
    // year, ENG champion, ENG cup winner, cup final, European Cup winner, its final
    [1989, 'ENG:0:0:2', 'ENG:0:0:1', undefined, 'GER:0:0:1', final('euro:3', [1, 0])],
    [
      1990,
      'ENG:0:0:1',
      'ENG:0:0:1',
      final('ENG:0:0:2', [2, 1]),
      'ENG:0:0:1',
      final('GER:0:0:1', [3, 2]),
    ],
    [
      1991,
      'ENG:0:0:1',
      'ENG:0:0:1',
      final('ENG:club', [1, 1], true),
      'GER:0:0:1',
      final('ENG:0:0:2', [2, 0]),
    ],
    [
      1992,
      'ENG:0:0:2',
      'ENG:0:0:1',
      final('ENG:0:0:2', [4, 0]),
      'GER:0:0:1',
      final('euro:3', [1, 0]),
    ],
    [
      1993,
      'ENG:club',
      'ENG:club',
      final('ENG:0:0:1', [2, 0]),
      'GER:0:0:1',
      final('euro:3', [1, 1], true),
    ],
    [
      1995,
      'ENG:club',
      'ENG:0:0:2',
      final('ENG:club', [3, 1]),
      'GER:0:0:1',
      final('ENG:club', [2, 1]),
    ],
  ];
  return rows.map(([year, champion, cup, cupFinal, europe, europeFinal]) => ({
    year,
    champions: [
      { country: 'ENG', club: champion, cup, ...(cupFinal ? { cupFinal } : {}) },
      { country: 'GER', club: 'GER:0:0:1', cup: 'GER:0:0:1' },
    ],
    europe: [
      {
        kind: 'ucl',
        name: year < 1992 ? 'European Cup' : 'Champions League',
        winner: europe,
        field: 32,
        ...(europeFinal ? { final: europeFinal } : {}),
      },
    ],
  }));
}

describe('cup honours', () => {
  it('counts titles, beaten finals and the latest title per club from the recorded finals', () => {
    const honours = cupHonours(history(), clubs, 'ENG', 'cup');
    expect(honours.finals.map((row) => [row.year, row.winner, row.streak])).toEqual([
      [1995, 'ENG:0:0:2', 1],
      [1993, 'ENG:club', 1],
      [1992, 'ENG:0:0:1', 4],
      [1991, 'ENG:0:0:1', 3],
      [1990, 'ENG:0:0:1', 2],
      [1989, 'ENG:0:0:1', 1],
    ]);
    expect(honours.clubs).toEqual([
      { club: 'ENG:0:0:1', titles: 4, runnerUps: 1, finals: 5, lastTitle: 1992 },
      // Level on titles and finals: the more recent title first.
      { club: 'ENG:0:0:2', titles: 1, runnerUps: 2, finals: 3, lastTitle: 1995 },
      { club: 'ENG:club', titles: 1, runnerUps: 2, finals: 3, lastTitle: 1993 },
    ]);
    // 1989 kept no final, so nobody is counted as its beaten finalist.
    expect(honours.unrecorded).toBe(1);
    expect(honours.streaks).toEqual([{ club: 'ENG:0:0:1', length: 4, from: 1989, to: 1992 }]);
    // League and cup in the same season, latest first; 1995's champion lost the final.
    expect(honours.doubles).toEqual([
      { year: 1993, club: 'ENG:club' },
      { year: 1991, club: 'ENG:0:0:1' },
      { year: 1990, club: 'ENG:0:0:1' },
    ]);
    expect(honours.nations).toEqual([]);
    expect(honours.trebles).toEqual([]);
  });

  it('follows the European Cup into the Champions League with nations and trebles', () => {
    const honours = cupHonours(history(), clubs, 'ENG', 'ucl');
    // Each season keeps the name it was played under.
    // A title after a season without a record starts a new run.
    expect(honours.finals.map((row) => [row.year, row.name, row.streak])).toEqual([
      [1995, 'Champions League', 1],
      [1993, 'Champions League', 3],
      [1992, 'Champions League', 2],
      [1991, 'European Cup', 1],
      [1990, 'European Cup', 1],
      [1989, 'European Cup', 1],
    ]);
    expect(honours.clubs).toEqual([
      { club: 'GER:0:0:1', titles: 5, runnerUps: 1, finals: 6, lastTitle: 1995 },
      { club: 'ENG:0:0:1', titles: 1, runnerUps: 0, finals: 1, lastTitle: 1990 },
      { club: 'euro:3', titles: 0, runnerUps: 3, finals: 3 },
      { club: 'ENG:0:0:2', titles: 0, runnerUps: 1, finals: 1 },
      { club: 'ENG:club', titles: 0, runnerUps: 1, finals: 1 },
    ]);
    expect(honours.nations).toEqual([
      { code: 'GER', name: '독일', titles: 5, runnerUps: 1, clubs: 1 },
      { code: 'ENG', name: '잉글랜드', titles: 1, runnerUps: 2, clubs: 1 },
      { code: 'SCO', name: '스코틀랜드', titles: 0, runnerUps: 3, clubs: 0 },
    ]);
    expect(honours.streaks).toEqual([{ club: 'GER:0:0:1', length: 3, from: 1991, to: 1993 }]);
    // Germany's champion won its cup every season, so each of its European titles is a treble;
    // England's 1990 champion won league, cup and the European Cup too.
    expect(honours.trebles).toEqual([
      { year: 1995, club: 'GER:0:0:1' },
      { year: 1993, club: 'GER:0:0:1' },
      { year: 1992, club: 'GER:0:0:1' },
      { year: 1991, club: 'GER:0:0:1' },
      { year: 1990, club: 'ENG:0:0:1' },
      { year: 1989, club: 'GER:0:0:1' },
    ]);
    expect(honours.doubles).toEqual([]);
    expect(honours.unrecorded).toBe(0);
  });

  it('reads another domestic competition without substituting our country', () => {
    const honours = cupHonours(history(), clubs, 'GER', 'cup');
    expect(honours.clubs).toEqual([
      { club: 'GER:0:0:1', titles: 6, runnerUps: 0, finals: 6, lastTitle: 1995 },
    ]);
    expect(honours.doubles).toHaveLength(6);
    expect(honours.finals.every((row) => row.winner.startsWith('GER:'))).toBe(true);
    expect(honours.unrecorded).toBe(6);
  });

  it('is empty before any season closed and ignores competitions not yet founded', () => {
    expect(cupHonours([], clubs, 'ENG', 'cup')).toEqual({
      finals: [],
      clubs: [],
      nations: [],
      streaks: [],
      doubles: [],
      trebles: [],
      unrecorded: 0,
    });
    const uecl = cupHonours(history(), clubs, 'ENG', 'uecl');
    expect(uecl.finals).toEqual([]);
    expect(uecl.streaks).toEqual([]);
  });
});
