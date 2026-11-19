import { describe, expect, it } from 'vitest';
import { attachRecordStore, type StoredRow } from '../../contracts/src/record-store';
import type { MatchRecord, World } from '../../contracts/src/types';
import { memoryRecordStore } from '../../../tests/fixtures/node-sqlite';
import {
  coldOwnMatchCount,
  hasOwnMatch,
  latestOwnMatches,
  ownMatchAt,
  ownMatchById,
  ownMatchCount,
  ownMatchesAgainst,
  ownMatchesFrom,
  ownMatchesOfSeason,
  ownMatchSummaries,
  releaseOwnMatches,
} from './own-matches';

/** A synthetic own match; tests give it what they read. */
const match = (n: number, year: number, opponent: string): MatchRecord =>
  ({
    id: `m${n}`,
    year,
    round: n,
    kind: 'league',
    home: n % 2 ? opponent : 'own',
    away: n % 2 ? 'own' : opponent,
    score: { home: n % 3, away: 1 },
    players: [],
  }) as unknown as MatchRecord;

/** Six own matches over 1958–1960: two in each season. */
const matches = () => [
  match(0, 1958, 'a'),
  match(1, 1958, 'b'),
  match(2, 1959, 'a'),
  match(3, 1959, 'c'),
  match(4, 1960, 'a'),
  match(5, 1960, 'b'),
];

const row = (index: number, m: MatchRecord, cold: boolean): StoredRow => ({
  table: 'own_match',
  key: String(index),
  seq: index,
  cold,
  data: JSON.stringify(m),
  id: m.id,
  year: m.year,
  opponent: m.home === 'own' ? m.away : m.home,
});

/** A world in 1960 whose first `cold` own matches sit cold in its store, the rest in memory. */
function world(cold: number): World {
  const all = matches();
  const store = memoryRecordStore();
  store.write({ put: all.map((m, i) => row(i, m, i < cold)), delete: [] });
  const w = {
    year: 1960,
    playerClub: 'own',
    ownMatches: all.slice(cold),
    ...(cold ? { ownMatchesBase: cold } : {}),
  } as unknown as World;
  return attachRecordStore(w, store);
}

const ids = (list: readonly { id: string }[]) => list.map((m) => m.id);

describe('own matches read across memory and store (→SAVE-32)', () => {
  it('answers every read alike whether earlier seasons are in memory or cold', () => {
    const held = world(0),
      moved = world(4);
    for (const w of [held, moved]) {
      expect(ownMatchCount(w)).toBe(6);
      expect(ownMatchAt(w, 1)?.id).toBe('m1');
      expect(ownMatchAt(w, 5)?.id).toBe('m5');
      expect(ownMatchAt(w, 6)).toBeUndefined();
      expect(ownMatchAt(w, -1)).toBeUndefined();
      expect(ids(ownMatchesFrom(w, 0))).toEqual(['m0', 'm1', 'm2', 'm3', 'm4', 'm5']);
      expect(ids(ownMatchesFrom(w, 3))).toEqual(['m3', 'm4', 'm5']);
      expect(ids(latestOwnMatches(w, 3))).toEqual(['m3', 'm4', 'm5']);
      expect(ids(latestOwnMatches(w, 30))).toHaveLength(6);
      expect(hasOwnMatch(w, 'm2')).toBe(true);
      expect(hasOwnMatch(w, 'm9')).toBe(false);
      expect(ownMatchById(w, 'm3')?.year).toBe(1959);
      expect(ids(ownMatchesOfSeason(w, 1959))).toEqual(['m2', 'm3']);
      expect(ids(ownMatchesOfSeason(w, 1960))).toEqual(['m4', 'm5']);
      expect(ids(ownMatchesAgainst(w, 'a'))).toEqual(['m0', 'm2', 'm4']);
      expect(ownMatchSummaries(w).map(({ match: m, order }) => [m.id, order])).toEqual(
        matches().map((m, i) => [m.id, i]),
      );
    }
    // Reading a cold match twice gives the same record, and reading changes nothing.
    expect(ownMatchAt(moved, 2)).toEqual(ownMatchAt(moved, 2));
    expect(ids(moved.ownMatches)).toEqual(['m4', 'm5']);
  });

  it('moves out only the matches of seasons before the current one, keeping indices', () => {
    const w = world(0);
    expect(coldOwnMatchCount(w)).toBe(4);
    releaseOwnMatches(w, 4);
    expect(w.ownMatchesBase).toBe(4);
    expect(ids(w.ownMatches)).toEqual(['m4', 'm5']);
    expect(ownMatchCount(w)).toBe(6);
    expect(coldOwnMatchCount(w)).toBe(0);
    expect(ownMatchAt(w, 4)?.id).toBe('m4');
  });

  it('reads no cold rows without a base', () => {
    const w = world(0);
    expect(ids(ownMatchesFrom({ ...w, ownMatches: [], ownMatchesBase: 0 }, 0))).toEqual([]);
  });
});
