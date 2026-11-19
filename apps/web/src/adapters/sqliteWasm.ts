/**
 * The game database files in the browser (→ARCH-11): the official SQLite WebAssembly build over its
 * OPFS SyncAccessHandle pool, opened by the engine worker only. The pool needs neither
 * cross-origin isolation headers nor SharedArrayBuffer. The SQLite module loads on first use, so
 * it never joins the entry bundle (→ARCH-28).
 */
import type {
  BindableValue,
  Database,
  PreparedStatement,
  SAHPoolUtil,
} from '@sqlite.org/sqlite-wasm';
import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import type { SqlDriver } from './sqlRecordStore';

/** The pool's VFS name; it also names its OPFS directory, so it stays apart from other storage. */
export const GAME_POOL_NAME = 'haeram-soccor-games';
/** Two games' databases with their backups and journals fit before the pool grows. */
export const GAME_POOL_CAPACITY = 8;

export type GamePool = SAHPoolUtil;

/** A game's database file in the pool. */
export const gameFileName = (gameId: string) => `/game-${gameId}.sqlite3`;
/** One of a game's two backup files (→SAVE-31). */
export const backupFileName = (gameId: string, side: 'a' | 'b') =>
  `/backup-${gameId}-${side}.sqlite3`;

export const STORAGE_CAPABILITY_CODE = 'storage-capability' as const;

/** OPFS or SQLite is unavailable: the game has no other store (→ARCH-11, →ARCH-17, →SAVE-14). */
export class StorageCapabilityError extends Error {
  readonly code = STORAGE_CAPABILITY_CODE;
  constructor(
    /** `opfs`: the browser lacks OPFS sync access; `sqlite`: SQLite or its pool failed to start. */
    readonly capability: 'opfs' | 'sqlite',
    options?: { cause?: unknown },
  ) {
    super(
      sourceMessage(
        capability === 'opfs' ? 'copy.sqliteWasm.opfsMissing' : 'copy.sqliteWasm.sqliteFailed',
      ),
      options,
    );
    this.name = 'StorageCapabilityError';
  }
}

/** Whether this context offers what the SAH pool needs: OPFS and its synchronous access handles. */
export function hasOpfsSyncAccess(scope: typeof globalThis = globalThis): boolean {
  const storage = (scope as { navigator?: { storage?: { getDirectory?: unknown } } }).navigator
    ?.storage;
  return (
    typeof storage?.getDirectory === 'function' &&
    typeof (scope as { FileSystemSyncAccessHandle?: unknown }).FileSystemSyncAccessHandle ===
      'function'
  );
}

let opening: Promise<GamePool> | undefined;

/**
 * The game pool, installed once per worker; a failed install is reported and tried again on the
 * next call. Only one tab may hold the pool at a time (→ARCH-17).
 */
export function openGamePool(): Promise<GamePool> {
  if (!hasOpfsSyncAccess()) return Promise.reject(new StorageCapabilityError('opfs'));
  opening ??= (async () => {
    try {
      const { default: sqlite3InitModule } = await import('@sqlite.org/sqlite-wasm');
      const sqlite3 = await sqlite3InitModule();
      return await sqlite3.installOpfsSAHPoolVfs({
        name: GAME_POOL_NAME,
        initialCapacity: GAME_POOL_CAPACITY,
        preserveOnInitFailure: true,
      });
    } catch (cause) {
      opening = undefined;
      throw new StorageCapabilityError('sqlite', { cause });
    }
  })();
  return opening;
}

const bindable = (params: unknown[]) => params as BindableValue[];

/** A driver over one open SQLite database, caching one prepared statement per SQL string. */
export function databaseDriver(db: Database): SqlDriver {
  const statements = new Map<string, PreparedStatement>();
  const prepared = (sql: string, params?: unknown[]) => {
    let statement = statements.get(sql);
    if (!statement) {
      statement = db.prepare(sql);
      statements.set(sql, statement);
    }
    if (params && params.length > 0) statement.bind(bindable(params));
    return statement;
  };
  /** Steps `statement` through `read`, always leaving it reset and unbound for its next use. */
  const using = <T>(statement: PreparedStatement, read: (s: PreparedStatement) => T): T => {
    try {
      return read(statement);
    } finally {
      statement.reset(true);
    }
  };
  return {
    exec: (sql) => void db.exec(sql),
    run: (sql, params) =>
      using(prepared(sql, params), (s) => {
        s.step();
      }),
    all: <T>(sql: string, params?: unknown[]) =>
      using(prepared(sql, params), (s) => {
        const rows: T[] = [];
        while (s.step()) rows.push(s.get({}) as T);
        return rows;
      }),
    get: <T>(sql: string, params?: unknown[]) =>
      using(prepared(sql, params), (s) => (s.step() ? (s.get({}) as T) : undefined)),
    transaction: <T>(fn: () => T): T => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = fn();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    close: () => {
      for (const statement of statements.values()) statement.finalize();
      statements.clear();
      db.close();
    },
  };
}

/** Opens (creating when absent) a game file of the pool behind the record store's driver. */
export const gameDriver = (pool: GamePool, fileName: string): SqlDriver =>
  databaseDriver(new pool.OpfsSAHPoolDb(fileName));

/** A closed file's bytes, as a portable database (→SAVE-9). */
export const exportFile = (pool: GamePool, fileName: string): Uint8Array =>
  pool.exportFile(fileName);

/** Writes `bytes` as the named database file, replacing what it held. */
export async function importFile(pool: GamePool, fileName: string, bytes: Uint8Array) {
  await pool.importDb(fileName, bytes);
}

/** Removes a closed file; whether it existed. */
export const deleteFile = (pool: GamePool, fileName: string): boolean => pool.unlink(fileName);

/** The pool's files, sorted so callers read them in a stable order. */
export const listFiles = (pool: GamePool): string[] => [...pool.getFileNames()].sort();

/** Releases the pool's handles so another tab can take it (→SAVE-6); every database must be closed. */
export const pause = (pool: GamePool): void => void pool.pauseVfs();

/** Takes the pool's handles back; databases opened before the pause must be opened again. */
export async function unpause(pool: GamePool) {
  await pool.unpauseVfs();
}
