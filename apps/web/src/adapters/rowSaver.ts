/**
 * Saves a world as the rows changed since the previous save, in one transaction (→SAVE-3). The
 * saver remembers what it last committed; a failed write leaves that memory, so the next save
 * writes the same changes again.
 */
import type {
  RecordStore,
  StoredRow,
  TableName,
} from '../../../../packages/contracts/src/record-store';
import type { World } from '../../../../packages/contracts/src/types';
import { SAVE_SCHEMA_VERSION, type RecordTable } from './saveSchema';
import { WORLD_TABLES, worldToRows } from './worldRows';

/** What one save wrote. */
export interface SaveStats {
  /** Rows put, cold ones included. */
  written: number;
  deleted: number;
  /** Rows the world held in memory. */
  rows: number;
}

/** The database metadata a save rewrites (→SAVE-2). */
export function worldMeta(w: World): Record<string, string> {
  return {
    schema_version: String(SAVE_SCHEMA_VERSION),
    engine: w.engine,
    catalog: w.catalog,
    catalog_hash: w.catalogHash,
    world_id: w.id,
    revision: String(w.revision),
  };
}

const id = (table: TableName, key: string) => `${table}\u0000${key}`;

/** Tables whose `seq` is a memory position rather than an absolute array index. */
const POSITIONAL = new Set<TableName>([
  'world_field',
  'person',
  'squad',
  'player_record',
  'news_bucket',
]);

export class RowSaver {
  /** The rows last committed and still held in memory, by table and key. */
  private readonly written = new Map<string, StoredRow>();
  /** Per positional table, the highest `seq` the store holds or this saver wrote. */
  private top: Map<TableName, number> | undefined;
  private readonly cold = new Map<string, { table: RecordTable; key: string }>();
  /** The positional tables the store holds cold rows of, read once and kept as saves add them. */
  private coldTables: Set<TableName> | undefined;

  constructor(private readonly store: RecordStore) {}

  /**
   * Takes `w`, the world just opened from the store, as this saver's last commit, so the next save
   * writes only what changed since (→SAVE-3). Each of its rows keeps the place (`seq`) the store
   * gives it; a row is compared by the text `w` writes, so a validation that only reorders a
   * record's keys rewrites nothing.
   */
  prime(w: World): void {
    const held = new Map<string, number>();
    for (const table of WORLD_TABLES)
      for (const stored of this.store.rows(table, { cold: false }))
        held.set(id(table, stored.key), stored.seq);
    for (const stored of worldToRows(w)) {
      const at = id(stored.table, stored.key);
      const seq = held.get(at);
      if (seq !== undefined) this.written.set(at, { ...stored, seq });
    }
  }

  /**
   * Marks records the current season no longer changes (→SAVE-32): the next save writes them cold,
   * and their absence from memory afterwards never deletes them. The marks last for that save only,
   * committed or not, so each save's movers mark afresh what has left play by then.
   */
  markCold(table: RecordTable, keys: Iterable<string>): void {
    for (const key of keys) this.cold.set(id(table, key), { table, key });
  }

  /** Writes the rows of `w` changed since the previous save, with its metadata, in one write. */
  save(w: World): SaveStats {
    try {
      return this.write(w);
    } finally {
      this.cold.clear();
    }
  }

  private write(w: World): SaveStats {
    const rows = this.stable(worldToRows(w));
    const put: StoredRow[] = [];
    const current = new Set<string>();
    const cooled = new Set<string>();
    for (const stored of rows) {
      const at = id(stored.table, stored.key);
      if (this.cold.has(at)) {
        put.push({ ...stored, cold: true });
        cooled.add(at);
        continue;
      }
      current.add(at);
      const before = this.written.get(at);
      if (!before || before.seq !== stored.seq || before.data !== stored.data) put.push(stored);
    }
    const remove: { table: TableName; key: string }[] = [];
    for (const [at, before] of this.written) {
      if (current.has(at) || cooled.has(at)) continue;
      // A record marked cold after leaving memory keeps its last committed row, now cold.
      if (this.cold.has(at)) put.push({ ...before, cold: true });
      else remove.push({ table: before.table, key: before.key });
    }
    this.store.write({ put, delete: remove, meta: worldMeta(w) });
    for (const stored of put) {
      const at = id(stored.table, stored.key);
      if (stored.cold) {
        this.coldTables?.add(stored.table);
        this.written.delete(at);
      } else this.written.set(at, stored);
    }
    for (const { table, key } of remove) this.written.delete(id(table, key));
    return { written: put.length, deleted: remove.length, rows: rows.length };
  }

  /**
   * Keeps each surviving record's committed `seq` while memory order allows, so removing one record
   * does not rewrite every record after it; a record brought back from its cold row keeps that
   * row's `seq` the same way, and a new or moved record takes the next free `seq`.
   */
  private stable(rows: StoredRow[]): StoredRow[] {
    const top = (this.top ??= this.storeTops());
    const last = new Map<TableName, number>();
    return rows.map((stored) => {
      if (!POSITIONAL.has(stored.table)) return stored;
      const previous = last.get(stored.table) ?? -1;
      const committed = this.written.get(id(stored.table, stored.key))?.seq ?? this.coldSeq(stored);
      const seq =
        committed !== undefined && committed > previous
          ? committed
          : Math.max(previous, top.get(stored.table) ?? -1) + 1;
      last.set(stored.table, seq);
      top.set(stored.table, Math.max(seq, top.get(stored.table) ?? -1));
      return seq === stored.seq ? stored : { ...stored, seq };
    });
  }

  /** The `seq` of `stored`'s cold row, when the store holds it cold (→SAVE-32). */
  private coldSeq(stored: StoredRow): number | undefined {
    this.coldTables ??= new Set(
      [...POSITIONAL].filter((table) => this.store.count(table, { cold: true, limit: 1 }) > 0),
    );
    if (!this.coldTables.has(stored.table)) return undefined;
    const row = this.store.get(stored.table, stored.key);
    return row?.cold ? row.seq : undefined;
  }

  private storeTops(): Map<TableName, number> {
    const top = new Map<TableName, number>();
    for (const table of WORLD_TABLES)
      if (POSITIONAL.has(table)) {
        const [highest] = this.store.rows(table, { descending: true, limit: 1 });
        if (highest) top.set(table, highest.seq);
      }
    return top;
  }
}
