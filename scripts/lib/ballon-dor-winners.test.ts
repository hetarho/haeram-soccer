import { describe, expect, it } from 'vitest';
import { type Winner, winnerSummary } from './ballon-dor-winners';

/** A hand-written winner; the defaults are a forward of 27 at an ordinary club nobody owns. */
const winner = (seed: string, year: number, id: string, rest: Partial<Winner> = {}): Winner => ({
  seed,
  year,
  id,
  age: 27,
  line: 'FW',
  strongest: false,
  own: false,
  ...rest,
});

describe('Ballon d’Or winners', () => {
  it('counts winners, repeat wins and the longest run within one world', () => {
    const read = winnerSummary([
      winner('a', 1955, 'p1', { strongest: true }),
      winner('a', 1956, 'p1', { strongest: true }),
      winner('a', 1957, 'p2', { line: 'MF', age: 24 }),
      winner('a', 1958, 'p1', { age: 31 }),
      // The same id in another world is another person, and his run starts afresh there.
      winner('b', 1955, 'p1', { line: 'GK', age: 33, own: true }),
      winner('b', 1956, 'p3', { line: 'DF', age: undefined }),
    ]);
    expect(read).toEqual({
      distinctWinners: 4,
      mostWins: 3,
      longestRun: 2,
      ageMin: 24,
      ageMedian: 27,
      ageMax: 33,
      ageUnknown: 1,
      GK: 1,
      DF: 1,
      MF: 1,
      FW: 3,
      strongestClub: 2,
      ownClub: 1,
    });
  });

  it('reads a run at a world’s start and end and ties between players', () => {
    const read = winnerSummary([
      winner('a', 1960, 'p1'),
      winner('a', 1961, 'p1'),
      winner('a', 1962, 'p2'),
      winner('a', 1963, 'p3'),
      winner('a', 1964, 'p3'),
    ]);
    expect(read.longestRun).toBe(2);
    expect(read.mostWins).toBe(2);
    expect(read.distinctWinners).toBe(3);
    expect(read.ageMedian).toBe(27);
  });

  it('reads one player winning every season as one run', () => {
    const read = winnerSummary(
      [1955, 1956, 1957, 1958].map((year) => winner('a', year, 'p1', { age: year - 1930 })),
    );
    expect(read).toMatchObject({ distinctWinners: 1, mostWins: 4, longestRun: 4 });
    expect([read.ageMin, read.ageMedian, read.ageMax]).toEqual([25, 26.5, 28]);
  });

  it('reads no winner as nothing won', () => {
    const read = winnerSummary([]);
    expect(read).toMatchObject({ distinctWinners: 0, mostWins: 0, longestRun: 0, ownClub: 0 });
    expect(read.ageMedian).toBeNaN();
  });
});
