/**
 * The own club's settled matches, wherever the world keeps them (→SAVE-32, →ARCH-36). Matches of
 * seasons before the current one leave memory at a save (`coldOwnMatchCount`): their rows stay in
 * the record store, cold, and `w.ownMatchesBase` counts them, so a match's absolute index — its
 * place among every own match, and its `own_match` row key — is `ownMatchesBase + position`. Every
 * read goes through these accessors, which read memory and the store in absolute order; reading
 * never changes an outcome (→ARCH-5).
 */
import { recordStoreOf, type RowFilter, type StoredRow } from '../../contracts/src/record-store';
import type { MatchRecord, World } from '../../contracts/src/types';
import { matchesInSeason } from './season-index';

type Own = Pick<World, 'ownMatches' | 'ownMatchesBase'>;

/** How many own matches have left memory: the absolute index of the first one memory holds. */
export const ownMatchesBase = (w: Own) => w.ownMatchesBase ?? 0;
/** Every own match the world has settled, in memory or cold. */
export const ownMatchCount = (w: Own) => ownMatchesBase(w) + w.ownMatches.length;

const parse = (row: StoredRow) => JSON.parse(row.data) as MatchRecord;

/** The cold matches of `w` matching `filter`, in absolute order; none without a base or store. */
function coldMatches(w: Own, filter: RowFilter = {}): MatchRecord[] {
  const base = ownMatchesBase(w);
  if (!base) return [];
  const store = recordStoreOf(w);
  if (!store) return [];
  return store.rows('own_match', { ...filter, cold: true, seqTo: base - 1 }).map(parse);
}

/** The last few cold matches read one at a time, parsed once: a cold row never changes. */
const recentCold = new WeakMap<object, Map<number, MatchRecord>>();
const RECENT_COLD = 4;

/** The own match at absolute index `index`, or undefined outside `0 … ownMatchCount - 1`. */
export function ownMatchAt(w: Own, index: number): MatchRecord | undefined {
  const base = ownMatchesBase(w);
  if (index >= base) return w.ownMatches[index - base];
  if (index < 0) return undefined;
  const store = recordStoreOf(w);
  if (!store) return undefined;
  let recent = recentCold.get(store);
  const hit = recent?.get(index);
  if (hit) return hit;
  const row = store.get('own_match', String(index));
  if (!row?.cold) return undefined;
  const match = parse(row);
  if (!recent) recentCold.set(store, (recent = new Map()));
  if (recent.size >= RECENT_COLD) recent.delete(recent.keys().next().value!);
  recent.set(index, match);
  return match;
}

/**
 * The latest short cold read, kept per store: the daily view reads the same few earlier-season
 * matches until the season's own matches fill it, and cold rows never change.
 */
const shortCold = new WeakMap<object, { key: string; matches: MatchRecord[] }>();
const SHORT_COLD = 64;

/** Every own match from absolute index `from` on, in settlement order. */
export function ownMatchesFrom(w: Own, from: number): MatchRecord[] {
  const base = ownMatchesBase(w);
  if (from >= base) return from > base ? w.ownMatches.slice(from - base) : w.ownMatches;
  const start = Math.max(0, from);
  const store = recordStoreOf(w);
  const key = `${start}:${base}`;
  const short = base - start <= SHORT_COLD && store ? shortCold.get(store) : undefined;
  let cold = short?.key === key ? short.matches : undefined;
  if (!cold) {
    cold = coldMatches(w, { seqFrom: start });
    if (store && base - start <= SHORT_COLD) shortCold.set(store, { key, matches: cold });
  }
  return [...cold, ...w.ownMatches];
}

/** The latest `n` own matches, oldest first. */
export const latestOwnMatches = (w: Own, n: number) =>
  ownMatchesFrom(w, Math.max(0, ownMatchCount(w) - n));

/** Whether the world keeps an own match with this id, in memory or cold. */
export function hasOwnMatch(w: Own, id: string): boolean {
  if (w.ownMatches.some((m) => m.id === id)) return true;
  const base = ownMatchesBase(w);
  if (!base) return false;
  return (recordStoreOf(w)?.count('own_match', { cold: true, id, seqTo: base - 1 }) ?? 0) > 0;
}

/** The own match with this id, in memory or cold. */
export function ownMatchById(w: Own, id: string): MatchRecord | undefined {
  return w.ownMatches.find((m) => m.id === id) ?? coldMatches(w, { id })[0];
}

/** The own matches of season `year`, in settlement order. */
export function ownMatchesOfSeason(w: Own, year: number): MatchRecord[] {
  const cold = coldMatches(w, { year });
  const held = matchesInSeason(w, year);
  return cold.length ? [...cold, ...held] : held;
}

/** The own matches against `club`, in settlement order. */
export function ownMatchesAgainst(w: Own, club: string): MatchRecord[] {
  return [
    ...coldMatches(w, { opponent: club }),
    ...w.ownMatches.filter((m) => m.home === club || m.away === club),
  ];
}

/** What the manager-history read keeps of an own match (→HIST-18). */
export type OwnMatchSummary = Pick<
  MatchRecord,
  | 'id'
  | 'year'
  | 'round'
  | 'kind'
  | 'home'
  | 'away'
  | 'score'
  | 'regulation'
  | 'shootout'
  | 'managerTenure'
>;

/** Every own match as its summary with its absolute index, in settlement order. */
export function ownMatchSummaries(w: Own): { match: OwnMatchSummary; order: number }[] {
  return ownMatchesFrom(w, 0).map((m, order) => ({
    match: {
      id: m.id,
      year: m.year,
      round: m.round,
      kind: m.kind,
      home: m.home,
      away: m.away,
      score: m.score,
      ...(m.regulation ? { regulation: m.regulation } : {}),
      ...(m.shootout ? { shootout: m.shootout } : {}),
      ...(m.managerTenure !== undefined ? { managerTenure: m.managerTenure } : {}),
    },
    order,
  }));
}

/**
 * How many own matches, from the first memory holds, belong to seasons before the current one:
 * they leave memory at the next save (→SAVE-32, →MATCH-5). Their material is already gone
 * (`reduceSeasonMaterial` at their season's close), and every scan that settles the current season
 * reads only this season's matches or goes through these accessors.
 */
export function coldOwnMatchCount(w: Pick<World, 'ownMatches' | 'year'>): number {
  let n = 0;
  while (n < w.ownMatches.length && w.ownMatches[n]!.year < w.year) n++;
  return n;
}

/** Drops the first `n` own matches from memory once their rows are saved cold. */
export function releaseOwnMatches(w: Pick<World, 'ownMatches' | 'ownMatchesBase'>, n: number) {
  if (n <= 0) return;
  w.ownMatches = w.ownMatches.slice(n);
  w.ownMatchesBase = (w.ownMatchesBase ?? 0) + n;
}
