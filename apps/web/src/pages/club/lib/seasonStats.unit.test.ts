import { describe, expect, it } from 'vitest';
import {
  emptyPlayerDetail,
  emptyTeamDetail,
  PD,
} from '../../../../../../packages/contracts/src/detail';
import type { MatchRecord } from '../../../../../../packages/contracts/src/types';
import { expectedPoints, seasonStats } from './seasonStats';

/** Synthetic retained identities; a sold player can later appear on an opponent's side. */
const world = {
  playerClub: 'us',
  clubs: [
    { id: 'us', name: 'Us' },
    { id: 'them', name: 'Them' },
  ],
  players: [
    { id: 'former', name: 'Former', status: 'sold' },
    { id: 'current', name: 'Current', status: 'active' },
    { id: 'sub', name: 'Substitute', status: 'active' },
  ],
} as unknown as Parameters<typeof seasonStats>[0];

function line(id: string, keyPasses = 0, xa = 0, goals = 0) {
  const metrics = Array<number>(12).fill(0),
    detail = emptyPlayerDetail();
  metrics[0] = goals;
  metrics[10] = 90;
  detail[PD.keyPasses] = keyPasses;
  detail[PD.xa] = xa;
  return { id, metrics, detail };
}

function record(
  round: number,
  side: 0 | 1,
  ours: MatchRecord['players'],
  theirs: MatchRecord['players'],
  legacy = false,
): MatchRecord {
  const home = side === 0 ? ours : theirs,
    away = side === 0 ? theirs : ours;
  return {
    id: `match-${round}`,
    year: 1950,
    round,
    kind: 'league',
    home: side === 0 ? 'us' : 'them',
    away: side === 0 ? 'them' : 'us',
    country: 'ENG',
    groupKey: 'g',
    score: { home: 0, away: 0 },
    metrics: [Array<number>(12).fill(0), Array<number>(12).fill(0)],
    players: [...home, ...away],
    detail: [emptyTeamDetail(), emptyTeamDetail()],
    ...(legacy ? {} : { lineCounts: [home.length, away.length] as [number, number] }),
    highlights: [],
    tactics: ['balanced', 'balanced'],
  };
}

describe('own-club season leaders', () => {
  it.each([0, 1] as const)(
    'keeps sold players only for their own-side contributions, side %i',
    (side) => {
      const beforeSale = record(1, side, [line('former', 2, 50, 1)], [line('rival')]);
      const afterSale = record(
        2,
        side === 0 ? 1 : 0,
        [
          ...Array.from({ length: 11 }, (_, i) => line(`own-${i}`)),
          line('current', 4, 75, 2),
          line('sub', 1, 10),
        ],
        [...Array.from({ length: 11 }, (_, i) => line(`other-${i}`)), line('former', 9, 250, 5)],
      );
      const matches = [beforeSale, afterSale],
        snapshot = structuredClone({ world, matches }),
        stats = seasonStats(world, matches);
      expect(stats.leaders.keyPasses.map(({ id, value }) => [id, value])).toEqual([
        ['current', 4],
        ['former', 2],
        ['sub', 1],
      ]);
      expect(stats.leaders.xa.map(({ id, value }) => [id, value])).toEqual([
        ['current', 0.75],
        ['former', 0.5],
        ['sub', 0.1],
      ]);
      expect(stats.leaders.goals.map(({ id, value }) => [id, value])).toEqual([
        ['current', 2],
        ['former', 1],
      ]);
      expect({ world, matches }).toEqual(snapshot);
    },
  );

  it.each([0, 1] as const)('uses the legacy eleven-per-side split at side %i', (side) => {
    const ours = [
        line('current', 3, 45),
        ...Array.from({ length: 10 }, (_, i) => line(`own-${i}`)),
      ],
      theirs = [
        line('former', 9, 250),
        ...Array.from({ length: 10 }, (_, i) => line(`other-${i}`)),
      ];
    const stats = seasonStats(world, [record(1, side, ours, theirs, true)]);
    expect(stats.leaders.keyPasses).toEqual([{ id: 'current', name: 'Current', value: 3 }]);
    expect(stats.leaders.xa).toEqual([{ id: 'current', name: 'Current', value: 0.45 }]);
  });

  it('retains legacy away records that saved only the own lines', () => {
    const stats = seasonStats(world, [record(1, 1, [line('former', 2, 50)], [], true)]);
    expect(stats.leaders.keyPasses).toEqual([{ id: 'former', name: 'Former', value: 2 }]);
    expect(stats.leaders.xa).toEqual([{ id: 'former', name: 'Former', value: 0.5 }]);
  });
});

describe('independent-Poisson expected points', () => {
  it.each([0, 0.01, 1, 4, 5, 8, 10, 25, 50])(
    'retains the full winning probability against zero xG at mean %s',
    (mean) => {
      expect(expectedPoints(mean, 0)).toBeCloseTo(3 - 2 * Math.exp(-mean), 10);
      expect(expectedPoints(0, mean)).toBeCloseTo(Math.exp(-mean), 10);
    },
  );

  it('preserves the ordinary Poisson definition, including zero versus zero', () => {
    expect(expectedPoints(0, 0)).toBe(1);
    // Independent 70-digit Decimal enumeration of score pairs 0..159 gives this reference.
    expect(expectedPoints(1.34, 0.87)).toBeCloseTo(1.7105673326832545, 10);
  });

  /** P(X = Y), summed independently as exp(-(a+b)) * sum((a*b)^k / (k!)^2). */
  const drawProbability = (a: number, b: number) => {
    let term = Math.exp(-(a + b)),
      total = term;
    for (let goals = 1; goals <= 200; goals++) {
      term *= (a * b) / (goals * goals);
      total += term;
    }
    return total;
  };

  it.each([
    [0, 0],
    [1.34, 0.87],
    [5, 8],
    [10, 10],
    [25, 50],
    [50, 50],
  ])('conserves the expected shared points for means %s and %s', (a, b) => {
    const draw = drawProbability(a, b);
    expect(expectedPoints(a, b) + expectedPoints(b, a)).toBeCloseTo(3 - draw, 10);
    if (a === b) expect(expectedPoints(a, b)).toBeCloseTo((3 - draw) / 2, 10);
  });

  it.each([0, 1, 5, 10, 50])('never loses expected points as own xG grows against %s', (other) => {
    let previous = expectedPoints(0, other);
    for (let own = 1; own <= 50; own++) {
      const current = expectedPoints(own, other);
      expect(current).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = current;
    }
  });

  it('stays finite at the existing retained-record xG boundary', () => {
    for (const [a, b] of [
      [50, 0],
      [0, 50],
      [50, 50],
      [49.99, 50],
    ]) {
      const value = expectedPoints(a!, b!);
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(3 + 1e-12);
    }
    expect(expectedPoints(50, 50)).toBeCloseTo(1.4800278103504517, 10);
  });
});
