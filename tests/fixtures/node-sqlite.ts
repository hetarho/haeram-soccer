/**
 * The record store's schema over `node:sqlite` (→ARCH-36): tests and tools run the game database in
 * memory, or in a file, without a browser.
 */
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import type { RecordStore } from '../../packages/contracts/src/record-store';
import { sqlRecordStore, type SqlDriver } from '../../apps/web/src/adapters/sqlRecordStore';

/** A driver over `DatabaseSync`, caching one prepared statement per SQL string. */
export function nodeSqliteDriver(path = ':memory:'): SqlDriver {
  const db = new DatabaseSync(path);
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
