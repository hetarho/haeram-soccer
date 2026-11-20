import { describe, expect, it } from 'vitest';
import { chooseStandingsSort, officialOrder, sortStandings } from './standingsSort';

describe('standings display order', () => {
  const rows = [
    { rank: 1, points: 8, ovr: 70, zone: 'automatic' },
    { rank: 2, points: 7, ovr: 82, own: true },
    { rank: 3, points: 4, ovr: 70 },
    { rank: 4, points: 0 },
  ];

  it('keeps missing ratings last and breaks ties by official rank in either direction', () => {
    const highest = chooseStandingsSort(officialOrder, 'ovr');
    const lowest = chooseStandingsSort(highest, 'ovr');
    expect(sortStandings(rows, highest)).toEqual([rows[1], rows[0], rows[2], rows[3]]);
    expect(sortStandings(rows, lowest)).toEqual([rows[0], rows[2], rows[1], rows[3]]);
    expect(sortStandings(rows, highest)[0]).toBe(rows[1]);
    expect(sortStandings(rows, chooseStandingsSort(lowest, 'rank'))).toEqual(rows);
  });

  it('sorts by the supplied net points, retaining each club’s official rank', () => {
    const deducted = { ...rows[1], points: 2, deducted: 5 };
    const highest = chooseStandingsSort(officialOrder, 'points');
    expect(sortStandings([rows[0], deducted, rows[2], rows[3]], highest)).toEqual([
      rows[0],
      rows[2],
      deducted,
      rows[3],
    ]);
  });
});
