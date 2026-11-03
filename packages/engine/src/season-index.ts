/** Append-aware, read-only season indices. Entries stay references, including mutable installments. */
import type { Event, MatchRecord, World } from '../../contracts/src/types';
interface SeasonIndex<T> {
  at: number;
  tail?: T;
  years: Map<number, T[]>;
}
const eventIndices = new WeakMap<Event[], SeasonIndex<Event>>();
const matchIndices = new WeakMap<MatchRecord[], SeasonIndex<MatchRecord>>();
function rowsInYear<T extends { year: number }>(
  rows: T[],
  year: number,
  cache: WeakMap<T[], SeasonIndex<T>>,
): T[] {
  let index = cache.get(rows);
  if (!index || index.at > rows.length || (index.at && rows[index.at - 1] !== index.tail)) {
    index = { at: 0, years: new Map() };
    cache.set(rows, index);
  }
  while (index.at < rows.length) {
    const row = rows[index.at++];
    let bucket = index.years.get(row.year);
    if (!bucket) index.years.set(row.year, (bucket = []));
    bucket.push(row);
    index.tail = row;
  }
  return index.years.get(year) ?? [];
}
export const eventsInSeason = (w: Pick<World, 'events'>, year: number) =>
  rowsInYear(w.events, year, eventIndices);
export const matchesInSeason = (w: Pick<World, 'ownMatches'>, year: number) =>
  rowsInYear(w.ownMatches, year, matchIndices);
