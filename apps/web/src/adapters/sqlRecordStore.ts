/**
 * The record store over SQLite (→ARCH-36, →ARCH-11). It speaks SQL through a small driver, so the
 * browser's SQLite WebAssembly build and `node:sqlite` (tests and tools) run the same schema.
 */
import type {
  RecordChanges,
  RecordStore,
  RowFilter,
  StoredRow,
  TableName,
} from '../../../../packages/contracts/src/record-store';
import { SaveCompatibilityError } from '../../../../packages/contracts/src/versions';
import {
  RECORD_TABLES,
  SAVE_SCHEMA_VERSION,
  SCHEMA_DDL,
  type IndexColumn,
  type RecordTable,
} from './saveSchema';

/** The SQLite operations the store needs; a driver may cache prepared statements per SQL string. */
export interface SqlDriver {
  exec(sql: string): void;
  run(sql: string, params?: unknown[]): void;
  all<T>(sql: string, params?: unknown[]): T[];
  get<T>(sql: string, params?: unknown[]): T | undefined;
  /** Runs `fn` in one transaction: committed when it returns, rolled back when it throws. */
  transaction<T>(fn: () => T): T;
  close(): void;
}

/** Above every key character a prefix scan meets: `key < prefix + PREFIX_END` bounds the prefix. */
const PREFIX_END = '￿';

interface SqlRow {
  key: string;
  seq: number;
  cold: number;
  data: string;
  id?: string | null;
  year?: number | null;
  opponent?: string | null;
  kind?: string | null;
}

/** The columns a table's rows are read with; `meta` reads as rows of seq 0 ordered by key. */
function source(table: TableName): { from: string; columns: readonly IndexColumn[] } {
  if (table === 'meta')
    return { from: '(SELECT key, 0 AS seq, 0 AS cold, value AS data FROM meta)', columns: [] };
  const columns = RECORD_TABLES[table];
  if (!columns) throw new Error(`Unknown record table ${String(table)}`);
  return { from: table, columns };
}

function toRow(table: TableName, row: SqlRow, columns: readonly IndexColumn[]): StoredRow {
  const stored: StoredRow = {
    table,
    key: row.key,
    seq: row.seq,
    cold: row.cold !== 0,
    data: row.data,
  };
  for (const column of columns) {
    const value = row[column];
    if (value !== null && value !== undefined)
      (stored as unknown as Record<string, unknown>)[column] = value;
  }
  return stored;
}

function where(
  table: TableName,
  columns: readonly IndexColumn[],
  filter: RowFilter,
): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const need = (column: IndexColumn) => {
    if (!columns.includes(column)) throw new Error(`Table ${table} has no ${column} column`);
  };
  if (filter.cold !== undefined) {
    clauses.push('cold = ?');
    params.push(filter.cold ? 1 : 0);
  }
  if (filter.year !== undefined) {
    need('year');
    clauses.push('year = ?');
    params.push(filter.year);
  }
  if (filter.opponent !== undefined) {
    need('opponent');
    clauses.push('opponent = ?');
    params.push(filter.opponent);
  }
  if (filter.kindPrefix !== undefined) {
    need('kind');
    clauses.push('kind >= ? AND kind < ?');
    params.push(filter.kindPrefix, filter.kindPrefix + PREFIX_END);
  }
  if (filter.seqFrom !== undefined) {
    clauses.push('seq >= ?');
    params.push(filter.seqFrom);
  }
  if (filter.seqTo !== undefined) {
    clauses.push('seq <= ?');
    params.push(filter.seqTo);
  }
  return { sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', params };
}

function prepareSchema(driver: SqlDriver): void {
  const version = driver.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;
  if (version === SAVE_SCHEMA_VERSION) return;
  if (version !== 0) throw new SaveCompatibilityError();
  const tables = driver.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM sqlite_schema WHERE type = 'table'",
  );
  // A versionless database holding tables was not written by this game.
  if (tables && tables.n > 0) throw new SaveCompatibilityError();
  driver.transaction(() => {
    for (const statement of SCHEMA_DDL) driver.exec(statement);
  });
}

/** Opens the store on `driver`, creating schema version 1 in an empty database (→SAVE-1). */
export function sqlRecordStore(driver: SqlDriver): RecordStore {
  prepareSchema(driver);
  const put = (row: StoredRow) => {
    if (row.table === 'meta') {
      driver.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [row.key, row.data]);
      return;
    }
    const table: RecordTable = row.table;
    const { columns } = source(table);
    const names = ['key', 'seq', 'cold', 'data', ...columns];
    driver.run(
      // An upsert on the key, not OR REPLACE: a unique id held by another key must fail the write,
      // never silently delete that other row.
      `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')}) ON CONFLICT (key) DO UPDATE SET ${names
        .slice(1)
        .map((name) => `${name} = excluded.${name}`)
        .join(', ')}`,
      [
        row.key,
        row.seq,
        row.cold ? 1 : 0,
        row.data,
        ...columns.map((column) => row[column] ?? null),
      ],
    );
  };
  const select = (table: TableName, filter: RowFilter) => {
    const { from, columns } = source(table);
    const clause = where(table, columns, filter);
    const order = filter.descending ? 'DESC' : 'ASC';
    const limit = filter.limit !== undefined ? ' LIMIT ?' : '';
    return {
      columns,
      sql: `SELECT key, seq, cold, data${columns.map((column) => `, ${column}`).join('')} FROM ${from}${clause.sql} ORDER BY seq ${order}, key ${order}${limit}`,
      params: filter.limit !== undefined ? [...clause.params, filter.limit] : clause.params,
    };
  };
  return {
    get(table, key) {
      const { from, columns } = source(table);
      const row = driver.get<SqlRow>(
        `SELECT key, seq, cold, data${columns.map((column) => `, ${column}`).join('')} FROM ${from} WHERE key = ?`,
        [key],
      );
      return row && toRow(table, row, columns);
    },
    has(table, key) {
      const { from } = source(table);
      return driver.get(`SELECT 1 AS found FROM ${from} WHERE key = ?`, [key]) !== undefined;
    },
    keysWithPrefix(table, prefix) {
      const { from } = source(table);
      return driver
        .all<{ key: string }>(
          `SELECT key FROM ${from} WHERE key >= ? AND key < ? ORDER BY seq, key`,
          [prefix, prefix + PREFIX_END],
        )
        .map((row) => row.key);
    },
    rows(table, filter = {}) {
      const { columns, sql, params } = select(table, filter);
      return driver.all<SqlRow>(sql, params).map((row) => toRow(table, row, columns));
    },
    count(table, filter = {}) {
      const { sql, params } = select(table, filter);
      return driver.get<{ n: number }>(`SELECT COUNT(*) AS n FROM (${sql})`, params)?.n ?? 0;
    },
    write(changes: RecordChanges) {
      driver.transaction(() => {
        for (const { table, key } of changes.delete) {
          source(table);
          driver.run(`DELETE FROM ${table} WHERE key = ?`, [key]);
        }
        for (const row of changes.put) put(row);
        for (const [key, value] of Object.entries(changes.meta ?? {}))
          driver.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value]);
      });
    },
    meta() {
      const meta: Record<string, string> = {};
      for (const row of driver.all<{ key: string; value: string }>(
        'SELECT key, value FROM meta ORDER BY key',
      ))
        meta[row.key] = row.value;
      return meta;
    },
    close() {
      driver.close();
    },
  };
}
