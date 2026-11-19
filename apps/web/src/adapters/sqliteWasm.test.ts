import { describe, expect, it } from 'vitest';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import {
  backupFileName,
  databaseDriver,
  gameFileName,
  hasOpfsSyncAccess,
  openGamePool,
  STORAGE_CAPABILITY_CODE,
  StorageCapabilityError,
} from './sqliteWasm';
import { sqlRecordStore } from './sqlRecordStore';

const memoryDriver = async () => databaseDriver(new (await sqlite3InitModule()).oo1.DB(':memory:'));

describe('sqliteWasm driver', () => {
  it('runs prepared statements, reads objects and rolls back a failed transaction', async () => {
    const driver = await memoryDriver();
    driver.exec('CREATE TABLE t (k TEXT PRIMARY KEY, n INTEGER)');
    driver.run('INSERT INTO t VALUES (?, ?)', ['a', 1]);
    driver.run('INSERT INTO t VALUES (?, ?)', ['b', 2]);
    expect(driver.all('SELECT k, n FROM t ORDER BY k')).toEqual([
      { k: 'a', n: 1 },
      { k: 'b', n: 2 },
    ]);
    expect(driver.get('SELECT n FROM t WHERE k = ?', ['b'])).toEqual({ n: 2 });
    expect(driver.get('SELECT n FROM t WHERE k = ?', ['z'])).toBeUndefined();
    expect(() =>
      driver.transaction(() => {
        driver.run('INSERT INTO t VALUES (?, ?)', ['c', 3]);
        throw new Error('cut short');
      }),
    ).toThrow('cut short');
    expect(driver.transaction(() => driver.all('SELECT k FROM t ORDER BY k'))).toEqual([
      { k: 'a' },
      { k: 'b' },
    ]);
    driver.close();
  });

  it('carries the record store schema', async () => {
    const store = sqlRecordStore(await memoryDriver());
    store.write({
      put: [{ table: 'person', key: 'p1', seq: 0, cold: false, data: '{"n":1}' }],
      delete: [],
    });
    expect(store.get('person', 'p1')?.data).toBe('{"n":1}');
  });
});

describe('sqliteWasm files and capability', () => {
  it('names game and backup files', () => {
    expect(gameFileName('g7')).toBe('/game-g7.sqlite3');
    expect(backupFileName('g7', 'b')).toBe('/backup-g7-b.sqlite3');
  });

  it('reports missing OPFS as a typed capability error', async () => {
    expect(hasOpfsSyncAccess({} as typeof globalThis)).toBe(false);
    expect(
      hasOpfsSyncAccess({
        navigator: { storage: { getDirectory: () => undefined } },
        FileSystemSyncAccessHandle: class {},
      } as unknown as typeof globalThis),
    ).toBe(true);
    const error = await openGamePool().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StorageCapabilityError);
    expect(error).toMatchObject({ code: STORAGE_CAPABILITY_CODE, capability: 'opfs' });
  });
});
