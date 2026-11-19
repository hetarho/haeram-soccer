/**
 * The portable save file (→SAVE-9, →ARCH-12): `HRSAVE1\n`, one line of header JSON and `\n`, then the
 * game's database gzipped. The header names the file format, the schema, engine and catalog
 * versions, the catalog hash, the world ID and the SHA-256 and size of the uncompressed database.
 * Decoding is pure bytes: it checks the limits and the checksum before anything opens the database
 * (→ARCH-16), so a damaged or oversized file never reaches SQLite.
 */
import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { SaveCompatibilityError } from '../../../../packages/contracts/src/versions';
import { gzip } from './compression';
import type { SqlDriver } from './sqlRecordStore';
import { DECOMPRESSED_LIMIT, PORTABLE_FILE_LIMIT } from './repository';

/** The file's first bytes; a file without them is no save file of this version. */
export const SAVE_FILE_MAGIC = 'HRSAVE1\n';
/** The file extension a download carries and a file input accepts. */
export const SAVE_FILE_EXTENSION = '.haeram-save';
export const SAVE_FILE_FORMAT = 'sqlite-1';
/** A header line is a few hundred bytes; anything longer is not one. */
const HEADER_LIMIT = 4096;

/** What a file says about its database, apart from the checksum and size the encoder measures. */
export interface SaveFileMeta {
  schema: number;
  engine: string;
  catalog: string;
  catalogHash: string;
  worldId: string;
}
export interface SaveFileHeader extends SaveFileMeta {
  format: typeof SAVE_FILE_FORMAT;
  /** SHA-256 of the uncompressed database, lowercase hex. */
  sha256: string;
  /** The uncompressed database's length in bytes. */
  size: number;
}
export interface SaveFileLimits {
  /** The whole file, at most `PORTABLE_FILE_LIMIT`. */
  file?: number;
  /** The database once decompressed, at most `DECOMPRESSED_LIMIT`. */
  database?: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export async function sha256Hex(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', copy.buffer)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

/** `header` plus the gzipped `dbBytes`, as one file. */
export async function encodeSaveFile(
  meta: SaveFileMeta,
  dbBytes: Uint8Array,
  limits: SaveFileLimits = {},
): Promise<Uint8Array> {
  const database = limits.database ?? DECOMPRESSED_LIMIT;
  if (dbBytes.length > database) throw new Error(sourceMessage('copy.compression.32374943f3'));
  const header: SaveFileHeader = {
    format: SAVE_FILE_FORMAT,
    schema: meta.schema,
    engine: meta.engine,
    catalog: meta.catalog,
    catalogHash: meta.catalogHash,
    worldId: meta.worldId,
    sha256: await sha256Hex(dbBytes),
    size: dbBytes.length,
  };
  const packed = await gzip(dbBytes, true, database);
  const head = encoder.encode(`${SAVE_FILE_MAGIC}${JSON.stringify(header)}\n`);
  const file = new Uint8Array(head.length + packed.length);
  file.set(head);
  file.set(packed, head.length);
  if (file.length > (limits.file ?? PORTABLE_FILE_LIMIT))
    throw new Error(sourceMessage('copy.persistence.02b1e71246'));
  return file;
}

const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max;

/** The header of a file whose magic and header line are intact, and where its database starts. */
export function readSaveFileHeader(bytes: Uint8Array): { header: SaveFileHeader; offset: number } {
  const magic = encoder.encode(SAVE_FILE_MAGIC);
  // A file without the magic — an earlier JSON export included — is no save of this version
  // (→SAVE-29); it is refused as unsupported, never read.
  if (bytes.length < magic.length || magic.some((byte, i) => bytes[i] !== byte))
    throw new SaveCompatibilityError(sourceMessage('copy.saveFile.notSaveFile'));
  const end = bytes.indexOf(0x0a, magic.length);
  if (end < 0 || end - magic.length > HEADER_LIMIT)
    throw new Error(sourceMessage('copy.saveFile.truncated'));
  let value: unknown;
  try {
    value = JSON.parse(decoder.decode(bytes.subarray(magic.length, end)));
  } catch {
    throw new Error(sourceMessage('copy.persistence.830e86ddaf'));
  }
  const h = value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
  if (!h || h.format !== SAVE_FILE_FORMAT)
    throw new SaveCompatibilityError(sourceMessage('copy.saveFile.notSaveFile'));
  if (
    !Number.isSafeInteger(h.schema) ||
    !text(h.engine, 20) ||
    !text(h.catalog, 60) ||
    !text(h.catalogHash, 100) ||
    !text(h.worldId, 300) ||
    typeof h.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(h.sha256) ||
    !Number.isSafeInteger(h.size) ||
    (h.size as number) < 0
  )
    throw new Error(sourceMessage('copy.persistence.830e86ddaf'));
  return { header: h as unknown as SaveFileHeader, offset: end + 1 };
}

/**
 * The header and the database bytes of a file, checked in this order: magic and header, the file
 * limit, the declared size against the database limit, bounded decompression, then the size and
 * SHA-256 of what came out (→SAVE-9). Nothing here opens the database.
 */
export async function decodeSaveFile(
  bytes: Uint8Array,
  limits: SaveFileLimits = {},
): Promise<{ header: SaveFileHeader; dbBytes: Uint8Array }> {
  const { header, offset } = readSaveFileHeader(bytes);
  if (bytes.length > (limits.file ?? PORTABLE_FILE_LIMIT))
    throw new Error(sourceMessage('copy.persistence.02b1e71246'));
  const database = limits.database ?? DECOMPRESSED_LIMIT;
  if (header.size > database) throw new Error(sourceMessage('copy.compression.32374943f3'));
  let dbBytes: Uint8Array;
  try {
    // The declared size bounds the output, so a bomb stops at it; the limit above bounds the
    // declaration itself.
    dbBytes = await gzip(bytes.subarray(offset), false, header.size);
  } catch (error) {
    // More output than the header declares is a size that does not match, like a wrong checksum.
    if (error instanceof Error && error.message === sourceMessage('copy.compression.32374943f3'))
      throw new Error(sourceMessage('copy.persistence.0d2cd0c308'));
    throw new Error(sourceMessage('copy.saveFile.truncated'));
  }
  if (dbBytes.length !== header.size || (await sha256Hex(dbBytes)) !== header.sha256)
    throw new Error(sourceMessage('copy.persistence.0d2cd0c308'));
  return { header, dbBytes };
}

/**
 * A database's metadata as a file header's meta (→SAVE-2): its schema, rules and catalog versions,
 * catalog hash and world ID. Read as plain rows, so a database of another version still tells what
 * it is and stays exportable (→SAVE-11).
 */
export function saveMetaOf(meta: Record<string, string>): SaveFileMeta {
  const schema = Number(meta.schema_version);
  if (
    !Number.isSafeInteger(schema) ||
    !text(meta.engine, 20) ||
    !text(meta.catalog, 60) ||
    !text(meta.catalog_hash, 100) ||
    !text(meta.world_id, 300)
  )
    throw new Error(sourceMessage('copy.persistence.830e86ddaf'));
  return {
    schema,
    engine: meta.engine,
    catalog: meta.catalog,
    catalogHash: meta.catalog_hash,
    worldId: meta.world_id,
  };
}
/** The same, read from an open database's `meta` table. */
export function databaseSaveMeta(driver: SqlDriver): SaveFileMeta {
  const meta: Record<string, string> = {};
  try {
    for (const row of driver.all<{ key: string; value: string }>('SELECT key, value FROM meta'))
      meta[row.key] = row.value;
  } catch {
    throw new Error(sourceMessage('copy.persistence.830e86ddaf'));
  }
  return saveMetaOf(meta);
}

/**
 * The game database files as bytes (→SAVE-9): what an export reads and an import writes. The
 * browser's is the OPFS pool; tests run the same schema over `node:sqlite`.
 */
export interface DatabaseBytes {
  /** The committed bytes of a game's database file, or undefined when it has none. */
  read(gameId: string): Uint8Array | undefined | Promise<Uint8Array | undefined>;
  /** What a game's file says about itself, readable whatever its version, or undefined. */
  meta(gameId: string): SaveFileMeta | undefined | Promise<SaveFileMeta | undefined>;
  /**
   * A scratch database outside every game, holding `bytes` (empty without); `bytes()` writes what
   * it holds out as a file and `release` closes and removes it.
   */
  scratch(bytes?: Uint8Array): Promise<{ driver: SqlDriver; bytes(): Uint8Array; release(): void }>;
  /** `bytes` as the game's database file, replacing what it held. */
  write(gameId: string, bytes: Uint8Array): Promise<void>;
}
