import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  attachRecordStore,
  cloneWorld,
  recordStoreOf,
  type StoredRow,
} from '../../../../packages/contracts/src/record-store';
import { SaveCompatibilityError } from '../../../../packages/contracts/src/versions';
import { memoryRecordStore, nodeSqliteDriver } from '../../../../tests/fixtures/node-sqlite';
import { SAVE_SCHEMA_VERSION } from './saveSchema';
import { sqlRecordStore } from './sqlRecordStore';

const match = (key: string, seq: number, year: number, opponent: string, cold = false) =>
  ({
    table: 'own_match',
    key,
    seq,
    cold,
    data: `{"k":"${key}"}`,
    id: key,
    year,
    opponent,
  }) satisfies StoredRow;

describe('sqlRecordStore over node:sqlite', () => {
  it('puts and gets rows with their index columns', () => {
    const store = memoryRecordStore();
    store.write({
      put: [
        match('m1', 3, 1950, 'c9'),
        { table: 'person', key: 'p1', seq: 1, cold: true, data: '{}' },
      ],
      delete: [],
    });
    expect(store.get('own_match', 'm1')).toEqual(match('m1', 3, 1950, 'c9'));
    expect(store.get('person', 'p1')).toEqual({
      table: 'person',
      key: 'p1',
      seq: 1,
      cold: true,
      data: '{}',
    });
    expect(store.has('person', 'p1')).toBe(true);
    expect(store.has('person', 'p2')).toBe(false);
    expect(store.get('person', 'p2')).toBeUndefined();
    store.write({ put: [match('m1', 4, 1951, 'c8', true)], delete: [] });
    expect(store.get('own_match', 'm1')).toEqual(match('m1', 4, 1951, 'c8', true));
  });

  it('lists keys by prefix and rows by index in seq order', () => {
    const store = memoryRecordStore();
    store.write({
      put: [
        match('m:b', 2, 1951, 'c1'),
        match('m:a', 5, 1950, 'c1'),
        match('m:c', 1, 1950, 'c2', true),
        match('x:1', 0, 1950, 'c1'),
      ],
      delete: [],
    });
    expect(store.keysWithPrefix('own_match', 'm:')).toEqual(['m:c', 'm:b', 'm:a']);
    expect(store.rows('own_match', { year: 1950 }).map((row) => row.key)).toEqual([
      'x:1',
      'm:c',
      'm:a',
    ]);
    expect(
      store.rows('own_match', { opponent: 'c1', descending: true }).map((row) => row.key),
    ).toEqual(['m:a', 'm:b', 'x:1']);
    expect(store.rows('own_match', { seqFrom: 1, seqTo: 2 }).map((row) => row.key)).toEqual([
      'm:c',
      'm:b',
    ]);
    expect(store.rows('own_match', { limit: 2 }).map((row) => row.key)).toEqual(['x:1', 'm:c']);
    expect(store.rows('own_match', { cold: true }).map((row) => row.key)).toEqual(['m:c']);
    expect(store.count('own_match', { cold: false })).toBe(3);
    expect(store.count('own_match', { limit: 2 })).toBe(2);
  });

  it('filters events by kind prefix', () => {
    const store = memoryRecordStore();
    const event = (key: string, seq: number, kind: string): StoredRow => ({
      table: 'event',
      key,
      seq,
      cold: false,
      data: '{}',
      year: 1950,
      kind,
    });
    store.write({
      put: [event('e1', 2, 'transfer-in'), event('e2', 1, 'transfer-out'), event('e3', 0, 'youth')],
      delete: [],
    });
    expect(store.rows('event', { kindPrefix: 'transfer' }).map((row) => row.key)).toEqual([
      'e2',
      'e1',
    ]);
  });

  it('writes in one transaction: a failing write leaves the database unchanged', () => {
    const store = memoryRecordStore();
    store.write({ put: [match('m1', 1, 1950, 'c1')], delete: [], meta: { worldId: 'w1' } });
    // m3 repeats m2's unique id under another key, so the whole write fails.
    const failing = {
      put: [match('m2', 2, 1950, 'c1'), { ...match('m3', 3, 1950, 'c1'), id: 'm2' }],
      delete: [{ table: 'own_match' as const, key: 'm1' }],
      meta: { worldId: 'w2' },
    };
    expect(() => store.write(failing)).toThrow();
    expect(store.keysWithPrefix('own_match', '')).toEqual(['m1']);
    expect(store.meta()).toEqual({ worldId: 'w1' });
    store.write({ put: [], delete: [{ table: 'own_match', key: 'm1' }], meta: { revision: '2' } });
    expect(store.count('own_match')).toBe(0);
    expect(store.meta()).toEqual({ revision: '2', worldId: 'w1' });
  });

  it('refuses a database of another schema version', () => {
    const dir = mkdtempSync(join(tmpdir(), 'record-store-'));
    try {
      const path = join(dir, 'game.sqlite');
      const created = nodeSqliteDriver(path);
      sqlRecordStore(created).close();
      const reopened = nodeSqliteDriver(path);
      expect(reopened.get<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(
        SAVE_SCHEMA_VERSION,
      );
      sqlRecordStore(reopened).close();
      const newer = nodeSqliteDriver(path);
      newer.exec(`PRAGMA user_version = ${SAVE_SCHEMA_VERSION + 1}`);
      expect(() => sqlRecordStore(newer)).toThrow(SaveCompatibilityError);
      newer.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('clones a world onto the same store', () => {
    const store = memoryRecordStore();
    const world = attachRecordStore({ season: { year: 1950 } }, store);
    const copy = cloneWorld(world);
    expect(copy).toEqual(world);
    expect(copy).not.toBe(world);
    expect(recordStoreOf(copy)).toBe(store);
    expect(recordStoreOf({})).toBeUndefined();
  });
});
