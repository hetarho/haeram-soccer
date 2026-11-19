/**
 * The world as rows of the game database (→SAVE-2, →ARCH-8): each large family is one row per
 * record keyed by its stable ID, every other top-level field one `world_field` row. Row data is the
 * record's JSON text; `seq` keeps memory order, so loading restores object key and array order.
 */
import { canonical } from '../../../../packages/contracts/src/index';
import {
  recordStoreOf,
  type RecordStore,
  type RowFilter,
  type StoredRow,
} from '../../../../packages/contracts/src/record-store';
import type { World } from '../../../../packages/contracts/src/types';
import type { RecordTable } from './saveSchema';

type Fields = Record<string, unknown>;

interface Family {
  table: RecordTable;
  shape: 'record' | 'array';
  /** The world field counting the array entries no longer held in memory (T1016–T1018). */
  base?: string;
  /** A record's key and index columns, from its value, its absolute index and the world. */
  columns?: (value: never, index: number, w: Fields) => Partial<StoredRow>;
}

/** The world fields held as one row per record, by field name. */
export const FAMILIES: Readonly<Record<string, Family>> = {
  people: { table: 'person', shape: 'record' },
  squads: { table: 'squad', shape: 'record' },
  playerRecords: { table: 'player_record', shape: 'record' },
  ownMatches: {
    table: 'own_match',
    shape: 'array',
    base: 'ownMatchesBase',
    columns: (m: World['ownMatches'][number], _index, w) => ({
      id: m.id,
      year: m.year,
      opponent: m.home === w.playerClub ? m.away : m.home,
    }),
  },
  history: {
    table: 'season_archive',
    shape: 'array',
    base: 'historyBase',
    columns: (archive: World['history'][number]) => ({
      key: String(archive.year),
      year: archive.year,
    }),
  },
  events: {
    table: 'event',
    shape: 'array',
    base: 'eventsBase',
    columns: (event: World['events'][number]) => ({ year: event.year, kind: event.kind }),
  },
};

/** The news journal keeps its season buckets in `news_bucket`; the rest of it is a world field. */
const JOURNAL = 'newsJournal';

/** Every table a world's rows use, `world_field` first. */
export const WORLD_TABLES: readonly RecordTable[] = [
  'world_field',
  ...Object.values(FAMILIES).map((family) => family.table),
  'news_bucket',
];

function row(table: RecordTable, key: string, seq: number, value: unknown): StoredRow {
  return { table, key, seq, cold: false, data: JSON.stringify(value) };
}

/** Every row of `w`, in memory order; none is cold. */
export function worldToRows(w: World): StoredRow[] {
  const fields = w as unknown as Fields;
  const rows: StoredRow[] = [];
  let position = 0;
  for (const field of Object.keys(fields)) {
    const value = fields[field];
    if (value === undefined) continue;
    const family = FAMILIES[field];
    if (family) {
      // The field's row holds the empty container, so its presence and position survive a load.
      rows.push(row('world_field', field, position++, family.shape === 'array' ? [] : {}));
      if (family.shape === 'record') {
        let seq = 0;
        for (const [key, record] of Object.entries(value as Fields))
          if (record !== undefined) rows.push(row(family.table, key, seq++, record));
      } else {
        const base = (fields[family.base!] as number | undefined) ?? 0;
        (value as unknown[]).forEach((record, index) => {
          const absolute = base + index;
          rows.push({
            ...row(family.table, String(absolute), absolute, record),
            ...family.columns?.(record as never, absolute, fields),
          });
        });
      }
    } else if (field === JOURNAL && 'seasons' in (value as Fields)) {
      const { seasons } = value as { seasons: Record<string, unknown> };
      rows.push(row('world_field', field, position++, { ...(value as Fields), seasons: {} }));
      let seq = 0;
      for (const [year, bucket] of Object.entries(seasons))
        rows.push({ ...row('news_bucket', year, seq++, bucket), year: Number(year) });
    } else rows.push(row('world_field', field, position++, value));
  }
  return rows;
}

/** Rebuilds a world from its rows; `rowsOf` returns a table's rows in `seq` order. */
function assemble(rowsOf: (table: RecordTable) => StoredRow[]): World {
  const world: Fields = {};
  for (const { key, data } of rowsOf('world_field')) world[key] = JSON.parse(data);
  for (const [field, family] of Object.entries(FAMILIES)) {
    const container = world[field];
    if (container === undefined) continue;
    const rows = rowsOf(family.table);
    if (family.shape === 'array')
      (container as unknown[]).push(...rows.map(({ data }) => JSON.parse(data) as unknown));
    else for (const { key, data } of rows) (container as Fields)[key] = JSON.parse(data);
  }
  const journal = world[JOURNAL] as { seasons?: Fields } | undefined;
  if (journal?.seasons)
    for (const { key, data } of rowsOf('news_bucket')) journal.seasons[key] = JSON.parse(data);
  return world as unknown as World;
}

/**
 * The world stored in `store`: with `includeCold` the complete world, else what memory holds — the
 * rows not marked cold (→SAVE-32).
 */
export function rowsToWorld(store: RecordStore, options: { includeCold: boolean }): World {
  const filter: RowFilter = options.includeCold ? {} : { cold: false };
  return assemble((table) => store.rows(table, filter));
}

const bySeq = (a: StoredRow, b: StoredRow) =>
  a.seq - b.seq || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/**
 * The canonical text of the complete world: `w` with the cold rows of its attached store merged in,
 * for determinism checks and benchmark hashes. Until a record is cold it is `canonical(w)`.
 */
export function worldFacts(w: World): string {
  const store = recordStoreOf(w);
  if (!store) return canonical(w);
  const byTable = new Map<RecordTable, StoredRow[]>();
  for (const stored of worldToRows(w)) {
    const table = stored.table as RecordTable;
    const held = byTable.get(table);
    if (held) held.push(stored);
    else byTable.set(table, [stored]);
  }
  for (const table of WORLD_TABLES) {
    const held = byTable.get(table) ?? [];
    const keys = new Set(held.map((stored) => stored.key));
    const cold = store.rows(table, { cold: true }).filter((stored) => !keys.has(stored.key));
    if (cold.length) byTable.set(table, [...held, ...cold].sort(bySeq));
  }
  return canonical(assemble((table) => byTable.get(table) ?? []));
}
