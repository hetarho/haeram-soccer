export type StandingsMetric =
  | 'rank'
  | 'ovr'
  | 'points'
  | 'played'
  | 'won'
  | 'drawn'
  | 'lost'
  | 'gf'
  | 'ga'
  | 'difference'
  | 'movement';

export type StandingsSort = {
  column: StandingsMetric;
  direction: 'ascending' | 'descending';
};

type SortableStanding = { rank: number } & Partial<Record<StandingsMetric, number>>;

export const officialOrder: StandingsSort = { column: 'rank', direction: 'ascending' };

export function chooseStandingsSort(sort: StandingsSort, column: StandingsMetric): StandingsSort {
  if (sort.column === column)
    return { column, direction: sort.direction === 'ascending' ? 'descending' : 'ascending' };
  return { column, direction: column === 'rank' ? 'ascending' : 'descending' };
}

export function sortStandings<T extends SortableStanding>(rows: readonly T[], sort: StandingsSort) {
  const { column, direction } = sort;
  return [...rows].sort((a, b) => {
    const left = a[column];
    const right = b[column];
    if (left === right) return a.rank - b.rank;
    if (left === undefined) return 1;
    if (right === undefined) return -1;
    return direction === 'ascending' ? left - right : right - left;
  });
}
