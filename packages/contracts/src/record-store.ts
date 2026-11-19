/**
 * The record-store port (→ARCH-36): the engine reads and writes persisted rows only through these
 * domain operations. It is synchronous inside the engine worker and names no SQL or SQLite; the
 * SQLite adapter (`apps/web/src/adapters/sqlRecordStore.ts`) implements it, and tests reach the
 * same schema through `tests/fixtures/node-sqlite.ts`.
 */

/** Every persisted table of a game database (→SAVE-2). */
export type TableName =
  | 'meta'
  | 'world_field'
  | 'person'
  | 'squad'
  | 'player_record'
  | 'own_match'
  | 'season_archive'
  | 'event'
  | 'news_bucket';

/** One persisted record: `data` is the JSON text of the record; the rest are its index columns. */
export interface StoredRow {
  table: TableName;
  key: string;
  /** The stable order every multi-row read follows (→ARCH-36). */
  seq: number;
  /** A record the current season no longer changes (→SAVE-32). */
  cold: boolean;
  data: string;
  year?: number;
  opponent?: string;
  kind?: string;
  id?: string;
}

/** A multi-row read's filter; every bound is inclusive. */
export interface RowFilter {
  cold?: boolean;
  year?: number;
  opponent?: string;
  kindPrefix?: string;
  /** A record's own stable ID column, where its table has one. */
  id?: string;
  seqFrom?: number;
  seqTo?: number;
  limit?: number;
  descending?: boolean;
}

/** One save's changed rows, applied in one transaction (→SAVE-3). */
export interface RecordChanges {
  put: StoredRow[];
  delete: { table: TableName; key: string }[];
  meta?: Record<string, string>;
}

export interface RecordStore {
  get(table: TableName, key: string): StoredRow | undefined;
  has(table: TableName, key: string): boolean;
  /** Keys starting with `prefix`, in `seq` order. */
  keysWithPrefix(table: TableName, prefix: string): string[];
  /** Rows matching `filter`, in `seq` order (descending when asked). */
  rows(table: TableName, filter?: RowFilter): StoredRow[];
  count(table: TableName, filter?: RowFilter): number;
  /** Applies every change or none. */
  write(changes: RecordChanges): void;
  meta(): Record<string, string>;
  close(): void;
}

const stores = new WeakMap<object, RecordStore>();

/** Attaches the store a world reads its out-of-memory records from; returns the world. */
export function attachRecordStore<W extends object>(w: W, store: RecordStore): W {
  stores.set(w, store);
  return w;
}

/** The store attached to `w`, if any. */
export function recordStoreOf(w: object): RecordStore | undefined {
  return stores.get(w);
}

/** A deep copy of `w` that reads the same store as `w`. */
export function cloneWorld<W extends object>(w: W): W {
  const copy = structuredClone(w);
  const store = stores.get(w);
  if (store) stores.set(copy, store);
  return copy;
}
