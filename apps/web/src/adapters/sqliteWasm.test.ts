import { describe, expect, it } from 'vitest';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import {
  backupFileName,
  databaseDriver,
  gameFileName,
  hasOpfsSyncAccess,
  heldElsewhere,
  openGamePool,
  retryWhileHeld,
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

describe('sqliteWasm pool held by a previous page', () => {
  const held = () =>
    Object.assign(new Error('Access Handles cannot be created'), {
      name: 'NoModificationAllowedError',
    });

  it('recognises a held handle, also wrapped as a cause', () => {
    expect(heldElsewhere(held())).toBe(true);
    expect(heldElsewhere(new Error('wrapped', { cause: held() }))).toBe(true);
    expect(heldElsewhere(new Error('Missing required OPFS APIs.'))).toBe(false);
    expect(heldElsewhere(undefined)).toBe(false);
  });

  it('retries a held pool until it frees, asking SQLite to try again', async () => {
    const retries: boolean[] = [],
      waits: number[] = [];
    const pool = await retryWhileHeld(
      async (retry) => {
        retries.push(retry);
        if (retries.length < 4) throw held();
        return 'pool';
      },
      15_000,
      async (ms) => void waits.push(ms),
    );
    expect(pool).toBe('pool');
    expect(retries).toEqual([false, true, true, true]);
    expect(waits).toEqual([50, 100, 200]);
  });

  it('fails at once on another error and after the limit on a pool that stays held', async () => {
    const other = new Error('Missing required OPFS APIs.');
    let calls = 0;
    await expect(
      retryWhileHeld(
        async () => {
          calls++;
          throw other;
        },
        15_000,
        async () => {},
      ),
    ).rejects.toBe(other);
    expect(calls).toBe(1);
    const waits: number[] = [];
    await expect(
      retryWhileHeld(
        async () => {
          throw held();
        },
        1_000,
        async (ms) => void waits.push(ms),
      ),
    ).rejects.toMatchObject({ name: 'NoModificationAllowedError' });
    expect(waits.reduce((a, b) => a + b, 0)).toBe(1_000);
  });
});
