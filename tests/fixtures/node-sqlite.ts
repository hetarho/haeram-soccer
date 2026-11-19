/**
 * The record store's schema over `node:sqlite` (→ARCH-36): tests and tools run the game database in
 * memory, or in a file, without a browser.
 */
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import type { RecordStore } from '../../packages/contracts/src/record-store';
import { sqlRecordStore, type SqlDriver } from '../../apps/web/src/adapters/sqlRecordStore';

/** A driver that can also write its database out as the bytes of a SQLite file. */
export interface SerializableDriver extends SqlDriver {
  serialize(): Uint8Array;
}

/**
 * A driver over `DatabaseSync`, caching one prepared statement per SQL string; `bytes` is a SQLite
 * file's content to start from (in memory), and `serialize` writes it out again.
 */
export function nodeSqliteDriver(path = ':memory:', bytes?: Uint8Array): SerializableDriver {
  const db = new DatabaseSync(path);
  if (bytes) db.deserialize(bytes);
  const statements = new Map<string, StatementSync>();
  const prepared = (sql: string) => {
    let statement = statements.get(sql);
    if (!statement) {
      statement = db.prepare(sql);
      statements.set(sql, statement);
    }
    return statement;
  };
  const values = (params: unknown[] = []) => params as SQLInputValue[];
  return {
    serialize: () => db.serialize(),
    exec: (sql) => db.exec(sql),
    run: (sql, params) => {
      prepared(sql).run(...values(params));
    },
    all: <T>(sql: string, params?: unknown[]) => prepared(sql).all(...values(params)) as T[],
    get: <T>(sql: string, params?: unknown[]) =>
      prepared(sql).get(...values(params)) as T | undefined,
    transaction: <T>(fn: () => T): T => {
      db.exec('BEGIN');
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
      statements.clear();
      db.close();
    },
  };
}

/** A fresh in-memory game database behind the record store. */
export function memoryRecordStore(): RecordStore {
  return sqlRecordStore(nodeSqliteDriver());
}
