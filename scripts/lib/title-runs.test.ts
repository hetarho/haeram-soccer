import { describe, expect, it } from 'vitest';
import {
  longestRuns,
  median,
  mostInWindow,
  runsOfAtLeast,
  seasonOrder,
  titleRuns,
  within,
  type Won,
} from './title-runs';

/** Hand-written winners from `start`, one season each: `list(1980, 'AABA')`. */
const list = (start: number, winners: string): Won[] =>
  [...winners].map((who, i) => ({ year: start + i, who }));

describe('title runs', () => {
  it('reads runs at the start and the end of a list', () => {
    const won = list(1980, 'AAABCBBBB');
    expect(titleRuns(won)).toEqual([
      { who: 'A', from: 1980, to: 1982, titles: 3 },
      { who: 'B', from: 1983, to: 1983, titles: 1 },
      { who: 'C', from: 1984, to: 1984, titles: 1 },
      { who: 'B', from: 1985, to: 1988, titles: 4 },
    ]);
    expect(longestRuns(won)).toEqual({
      titles: 4,
      runs: [{ who: 'B', from: 1985, to: 1988, titles: 4 }],
    });
    // A window cuts the runs at its edges: 1981–1986 keeps two of A's and two of B's.
    expect(longestRuns(within(won, 1981, 1986)).titles).toBe(2);
    expect(runsOfAtLeast(won, 3)).toBe(2);
    expect(runsOfAtLeast(won, 4)).toBe(1);
    expect(runsOfAtLeast(won, 5)).toBe(0);
  });

  it('names every run of the longest length when two tie, earliest first', () => {
    const won = list(1990, 'BBACCAA');
    expect(longestRuns(won)).toEqual({
      titles: 2,
      runs: [
        { who: 'B', from: 1990, to: 1991, titles: 2 },
        { who: 'C', from: 1993, to: 1994, titles: 2 },
        { who: 'A', from: 1995, to: 1996, titles: 2 },
      ],
    });
    // Equal most-in-window counts name every club reaching it, in the order they first do.
    expect(mostInWindow(won, 3)).toEqual({ titles: 2, who: ['B', 'C', 'A'], from: 1990 });
  });

  it('lets the war gap break no run: 1939/40–1945/46 were not played', () => {
    // Seasons 1936–1938, then 1946–1948: the list holds the seasons played only.
    const won = [...list(1936, 'BAA'), ...list(1946, 'AAB')];
    expect(longestRuns(won)).toEqual({
      titles: 4,
      runs: [{ who: 'A', from: 1937, to: 1947, titles: 4 }],
    });
    // A window of ten entries spans the gap too: all six seasons played, A four of them.
    expect(mostInWindow(won, 10)).toEqual({ titles: 4, who: ['A'], from: 1936 });
  });

  it('reads a single-club list as one run of every season', () => {
    const won = list(1955, 'A'.repeat(55));
    expect(titleRuns(won)).toEqual([{ who: 'A', from: 1955, to: 2009, titles: 55 }]);
    expect(runsOfAtLeast(won, 5)).toBe(1);
    expect(mostInWindow(won, 10)).toEqual({ titles: 10, who: ['A'], from: 1955 });
  });

  it('counts the most titles of one club in any ten consecutive seasons', () => {
    // A and B take five each of the first ten, B six of the ten from 1981.
    const won = list(1980, 'ABABABABAB' + 'BA');
    expect(mostInWindow(won, 10)).toEqual({ titles: 6, who: ['B'], from: 1981 });
    expect(runsOfAtLeast(won, 2)).toBe(1);
    // A list shorter than the window is read whole.
    expect(mostInWindow(list(2000, 'ABA'), 10)).toEqual({ titles: 2, who: ['A'], from: 2000 });
  });

  it('reads an empty list as nothing won', () => {
    expect(titleRuns([])).toEqual([]);
    expect(longestRuns([])).toEqual({ titles: 0, runs: [] });
    expect(mostInWindow([], 10)).toEqual({ titles: 0, who: [], from: undefined });
  });

  it('orders the seasons and refuses a season listed twice', () => {
    expect(seasonOrder(list(1980, 'AB').reverse()).map((won) => won.year)).toEqual([1980, 1981]);
    expect(() =>
      seasonOrder([
        { year: 1980, who: 'A' },
        { year: 1980, who: 'B' },
      ]),
    ).toThrow(/two winners/);
  });

  it('takes the median of an odd and an even count', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNaN();
  });
});
