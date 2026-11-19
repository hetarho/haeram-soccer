/**
 * The game database's schema (→ARCH-11, →SAVE-1/2): one SQLite file per game, shared by the web and
 * the app. A schema change raises SAVE_SCHEMA_VERSION; a database of another version is refused
 * (→SAVE-11).
 */
import type { TableName } from '../../../../packages/contracts/src/record-store';

export const SAVE_SCHEMA_VERSION = 1;

/** An index column a record table carries beside its key, seq, cold flag and data. */
export type IndexColumn = 'id' | 'year' | 'opponent' | 'kind';
export type RecordTable = Exclude<TableName, 'meta'>;

/** Each record table's index columns, in column order. */
export const RECORD_TABLES: Readonly<Record<RecordTable, readonly IndexColumn[]>> = {
  world_field: [],
  person: [],
  squad: [],
  player_record: [],
  own_match: ['id', 'year', 'opponent'],
  season_archive: ['year'],
  event: ['year', 'kind'],
  news_bucket: ['year'],
};

const COLUMN_TYPE: Readonly<Record<IndexColumn, string>> = {
  id: 'TEXT',
  year: 'INTEGER',
  opponent: 'TEXT',
  kind: 'TEXT',
};

/** Extra indexes beyond every table's `(cold, seq)`. */
const INDEXES: Readonly<Partial<Record<RecordTable, readonly string[]>>> = {
  own_match: [
    'CREATE INDEX own_match_year ON own_match (year, seq)',
    'CREATE INDEX own_match_opponent ON own_match (opponent, seq)',
    'CREATE UNIQUE INDEX own_match_id ON own_match (id)',
  ],
  event: [
    'CREATE INDEX event_year ON event (year, seq)',
    'CREATE INDEX event_kind ON event (kind, seq)',
  ],
};

/** The statements that create schema version 1 on an empty database. */
export const SCHEMA_DDL: readonly string[] = [
  'CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  ...(Object.entries(RECORD_TABLES) as [RecordTable, readonly IndexColumn[]][]).flatMap(
    ([table, columns]) => [
      `CREATE TABLE ${table} (key TEXT PRIMARY KEY, seq INTEGER NOT NULL, cold INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL${columns
        .map((column) => `, ${column} ${COLUMN_TYPE[column]}`)
        .join('')})`,
      `CREATE INDEX ${table}_cold ON ${table} (cold, seq)`,
      ...(INDEXES[table] ?? []),
    ],
  ),
  `PRAGMA user_version = ${SAVE_SCHEMA_VERSION}`,
];
