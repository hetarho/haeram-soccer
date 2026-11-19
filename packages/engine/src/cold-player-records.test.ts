import { describe, expect, it } from 'vitest';
import { attachRecordStore, type StoredRow } from '../../contracts/src/record-store';
import type { PersonCareer, PlayerMove, PlayerRecord, World } from '../../contracts/src/types';
import { memoryRecordStore } from '../../../tests/fixtures/node-sqlite';
import {
  coldPlayerRecordIds,
  hasPlayerRecord,
  isColdPlayerRecord,
  lastPlayerMove,
  linkPlayer,
  playerRecord,
  playerRecordOf,
  releasePlayerRecords,
  restorePlayerRecord,
} from './player-records';

const move = (year: number, from = 'c1', to = 'c2'): PlayerMove => ({
  year,
  day: 10,
  from,
  to,
  fee: '0',
});
/** A retired, linked player's record; tests give it what they check. */
const record = (extra: Partial<PlayerRecord> = {}): PlayerRecord => ({
  moves: [move(1950)],
  lines: [],
  linked: true,
  ...extra,
});
const row = (key: string, r: PlayerRecord, seq: number, cold: boolean): StoredRow => ({
  table: 'player_record',
  key,
  seq,
  cold,
  data: JSON.stringify(r),
});
/** A synthetic world in 1960 holding `records`; not a playable world. */
function world(records: Record<string, PlayerRecord> = {}): World {
  return {
    year: 1960,
    playerClub: 'own',
    clubs: [{ id: 'own' }, { id: 'c1' }, { id: 'c2' }],
    players: [{ id: 'own-player' }],
    squads: { c1: [{ id: 'squad-player' }] },
    freeAgents: [{ id: 'free-player' }],
    academy: { players: [{ id: 'prospect' }] },
    people: { 'in-play': { id: 'in-play', playing: 'active' } as PersonCareer },
    playerRecords: records,
  } as unknown as World;
}

describe('which player records leave memory at a save (→SAVE-32)', () => {
  const w = world();
  const cold = (id: string, r: PlayerRecord) => isColdPlayerRecord(w, id, r);

  it('moves a linked or retired record of someone neither in memory nor in play', () => {
    expect(cold('gone', record())).toBe(true);
    expect(
      cold('gone', record({ linked: false, retired: { year: 1959, profile: {} } } as never)),
    ).toBe(true);
  });

  it('keeps a person in memory, a held player, a loan, a move this season or a deletable row', () => {
    expect(cold('in-play', record())).toBe(false);
    for (const id of ['own-player', 'squad-player', 'free-player', 'prospect'])
      expect(cold(id, record())).toBe(false);
    const loan = { club: 'c1', until: 1961, wage: '1', contractUntil: 1962, year: 1960 };
    expect(cold('gone', record({ loan }))).toBe(false);
    expect(cold('gone', record({ moves: [move(1950), move(1960, 'c2', 'c1')] }))).toBe(false);
    expect(cold('gone', record({ linked: false }))).toBe(false);
  });

  it('counts a person leaving memory at the same save as gone', () => {
    const records = world({ 'in-play': record(), gone: record(), kept: record({ linked: false }) });
    expect(coldPlayerRecordIds(records)).toEqual(['gone']);
    expect(coldPlayerRecordIds(records, new Set(['in-play']))).toEqual(['in-play', 'gone']);
  });
});

describe('reading and restoring a cold player record (→SAVE-32)', () => {
  const [a, b, c, d] = [1951, 1952, 1953, 1954].map((year) =>
    record({ moves: [move(year)], linked: year !== 1952 }),
  );

  /** Memory holds a, c and d (d not saved yet); b is a cold row between a and c. */
  function split() {
    const w = world(structuredClone({ a, c, d }));
    const store = memoryRecordStore();
    store.write({
      put: [row('a', a!, 0, false), row('b', b!, 1, true), row('c', c!, 2, false)],
      delete: [],
    });
    return attachRecordStore(w, store);
  }

  it('reads a cold record from its row, and the same from memory once restored', () => {
    const w = split();
    expect(playerRecordOf(w, 'b')).toEqual(b);
    expect(hasPlayerRecord(w, 'b')).toBe(true);
    expect(lastPlayerMove(w, 'b')).toEqual(move(1952));
    expect(hasPlayerRecord(w, 'nobody')).toBe(false);
    expect(playerRecordOf(w, 'nobody')).toBeUndefined();
    expect(lastPlayerMove(w, 'a')).toEqual(move(1951));
    const restored = restorePlayerRecord(w, 'b')!;
    expect(restored).toEqual(b);
    expect(playerRecordOf(w, 'b')).toBe(restored);
    expect(restorePlayerRecord(w, 'nobody')).toBeUndefined();
  });

  it('links a cold record in its stored place, then flips the link', () => {
    const w = split();
    linkPlayer(w, 'b');
    expect(Object.keys(w.playerRecords!)).toEqual(['a', 'b', 'c', 'd']);
    expect(b!.linked).toBe(false);
    expect(w.playerRecords!['b']).toEqual({ ...b, linked: true });
    // A writer of a record the world never kept makes it at the end.
    playerRecord(w, 'e').moves.push(move(1960));
    expect(Object.keys(w.playerRecords!)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('releases records from memory, keeping the others in order', () => {
    const w = split();
    releasePlayerRecords(w, ['c']);
    expect(Object.keys(w.playerRecords!)).toEqual(['a', 'd']);
  });
});
