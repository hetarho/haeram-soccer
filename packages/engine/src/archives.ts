/**
 * The season archives, wherever the world keeps them (→SAVE-32, →ARCH-36, →HIST-2). Archives
 * older than the last seven seasons leave memory at a save (`coldArchiveCount`): their rows stay in
 * the record store, cold, and `w.historyBase` counts them, so an archive's absolute index — its
 * place among every archive and its row's `seq` — is `historyBase + position`. The seasons the
 * outcome reads look at stay in memory: last season's (fan mood, books, sponsors, takeover,
 * finance), European access's Y-1 … Y-6 and the Ballon d'Or's last three. Every whole-career read
 * goes through these accessors, which read memory and the store in year order; reading never
 * changes an outcome (→ARCH-5).
 */
import { recordStoreOf, type RecordStore, type StoredRow } from '../../contracts/src/record-store';
import type { SeasonArchive, World } from '../../contracts/src/types';

/**
 * Seasons whose archives stay in memory, Y-7 … Y-1: the longest outcome read, European access's
 * Y-6, plus the current season.
 */
export const HOT_ARCHIVE_SEASONS = 7;

type Archives = Pick<World, 'history' | 'historyBase'>;

/** How many archives have left memory: the absolute index of the first one memory holds. */
export const historyBase = (w: Archives) => w.historyBase ?? 0;
/** Every season the career has archived, in memory or cold. */
export const archiveCount = (w: Archives) => historyBase(w) + w.history.length;

const parse = (row: StoredRow) => JSON.parse(row.data) as SeasonArchive;

/** The archive at absolute index `index`, or undefined outside `0 … archiveCount - 1`. */
export function archiveAt(w: Archives, index: number): SeasonArchive | undefined {
  const base = historyBase(w);
  if (index >= base) return w.history[index - base];
  if (index < 0) return undefined;
  const [row] =
    recordStoreOf(w)?.rows('season_archive', { cold: true, seqFrom: index, seqTo: index }) ?? [];
  return row ? parse(row) : undefined;
}

/** The whole archive of season `year` (standings, brackets and scorers included), if archived. */
export function archiveOf(w: Archives, year: number): SeasonArchive | undefined {
  const held = w.history.find((season) => season.year === year);
  if (held || !historyBase(w)) return held;
  const row = recordStoreOf(w)?.get('season_archive', String(year));
  return row?.cold ? parse(row) : undefined;
}

/**
 * A season as the view sends it (→HIST-13): without its standings, its continental tables, its
 * brackets and its scorers, which come with the archive request (`archiveOf`).
 */
export function archiveSummary(h: SeasonArchive): SeasonArchive {
  const season = {
    ...h,
    standings: [],
    europe: h.europe.map((e) => ({ ...e, standings: [], secondStandings: undefined })),
  };
  delete season.brackets;
  delete season.scorers;
  return season;
}

/**
 * The summaries of a store's cold archives, oldest first: cold rows never change, so each is read
 * once per store and extended as later saves move more out of memory.
 */
const coldCache = new WeakMap<RecordStore, SeasonArchive[]>();

function coldSummaries(w: Archives): readonly SeasonArchive[] {
  const base = historyBase(w);
  if (!base) return [];
  const store = recordStoreOf(w);
  if (!store) return [];
  let cached = coldCache.get(store);
  if (!cached) coldCache.set(store, (cached = []));
  if (cached.length < base)
    for (const row of store.rows('season_archive', {
      cold: true,
      seqFrom: cached.length,
      seqTo: base - 1,
    }))
      cached.push(archiveSummary(parse(row)));
  return cached.length > base ? cached.slice(0, base) : cached;
}

/** Every archived season as the view sends it (`archiveSummary`), oldest first. */
export function archiveSummaries(w: Archives): SeasonArchive[] {
  return [...coldSummaries(w), ...w.history.map(archiveSummary)];
}

/** The year of every archived season, oldest first. */
export function archiveYears(w: Archives): number[] {
  return [...coldSummaries(w), ...w.history].map((season) => season.year);
}

/**
 * How many archives, from the first memory holds, leave memory at the next save (→SAVE-32): those
 * of seasons before `w.year - HOT_ARCHIVE_SEASONS`, never one of the last seven archived, so the
 * last season stays in memory across the war's gap (→WORLD-14) as well.
 */
export function coldArchiveCount(w: Pick<World, 'history' | 'year'>): number {
  const limit = Math.max(0, w.history.length - HOT_ARCHIVE_SEASONS);
  let n = 0;
  while (n < limit && w.history[n]!.year < w.year - HOT_ARCHIVE_SEASONS) n++;
  return n;
}

/** Drops the first `n` archives from memory once their rows are saved cold. */
export function releaseArchives(w: Archives, n: number) {
  if (n <= 0) return;
  w.history = w.history.slice(n);
  w.historyBase = historyBase(w) + n;
}
