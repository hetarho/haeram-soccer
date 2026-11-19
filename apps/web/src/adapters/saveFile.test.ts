import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { isSaveCompatibilityError } from '../../../../packages/contracts/src/versions';
import { nodeSqliteDriver } from '../../../../tests/fixtures/node-sqlite';
import { DECOMPRESSED_LIMIT, PORTABLE_FILE_LIMIT } from './repository';
import {
  decodeSaveFile,
  encodeSaveFile,
  readSaveFileHeader,
  SAVE_FILE_MAGIC,
  saveMetaOf,
  sha256Hex,
  type SaveFileMeta,
} from './saveFile';
import { sqlRecordStore } from './sqlRecordStore';

const meta: SaveFileMeta = {
  schema: 1,
  engine: '0.8.14',
  catalog: '2026-demo-5',
  catalogHash: 'a'.repeat(64),
  worldId: 'world-1',
};
const text = new TextEncoder();
const rejects = async (run: Promise<unknown>) =>
  ((await run.then(
    () => undefined,
    (error: unknown) => error,
  )) as Error | undefined) ?? new Error('resolved');
/** A real SQLite file's bytes, small enough to read in a test. */
function database() {
  const driver = nodeSqliteDriver();
  const store = sqlRecordStore(driver);
  store.write({
    put: [{ table: 'person', key: 'p1', seq: 0, cold: false, data: '{"name":"한글"}' }],
    delete: [],
    meta: { schema_version: '1', engine: '0.8.14', catalog: 'c', catalog_hash: 'h', world_id: 'w' },
  });
  const bytes = driver.serialize();
  driver.close();
  return bytes;
}
/** The file with its header line rewritten by `change`. */
function withHeader(file: Uint8Array, change: (header: Record<string, unknown>) => unknown) {
  const { header, offset } = readSaveFileHeader(file);
  const head = text.encode(`${SAVE_FILE_MAGIC}${JSON.stringify(change({ ...header }))}\n`);
  return Uint8Array.from([...head, ...file.subarray(offset)]);
}

describe('the portable save file (→SAVE-9, →ARCH-12)', () => {
  it('lays out the magic, one header line and the gzipped database', async () => {
    const bytes = database();
    const file = await encodeSaveFile(meta, bytes);
    expect(new TextDecoder().decode(file.subarray(0, 8))).toBe('HRSAVE1\n');
    const { header, offset } = readSaveFileHeader(file);
    expect(header).toEqual({
      format: 'sqlite-1',
      ...meta,
      sha256: await sha256Hex(bytes),
      size: bytes.length,
    });
    // The line ends in a newline, and gzip's magic follows it.
    expect(file[offset - 1]).toBe(0x0a);
    expect([file[offset], file[offset + 1]]).toEqual([0x1f, 0x8b]);
    expect(file.length).toBeLessThan(bytes.length);
  });

  it('round-trips the database bytes exactly, and a real database still opens', async () => {
    const bytes = database();
    const decoded = await decodeSaveFile(await encodeSaveFile(meta, bytes));
    expect(decoded.dbBytes).toEqual(bytes);
    expect(decoded.header.worldId).toBe('world-1');
    const driver = nodeSqliteDriver(':memory:', decoded.dbBytes);
    expect(sqlRecordStore(driver).get('person', 'p1')?.data).toBe('{"name":"한글"}');
    driver.close();
  });

  it('reads a header from a database own metadata, whatever its version', () => {
    expect(
      saveMetaOf({
        schema_version: '1',
        engine: '0.8.14',
        catalog: 'c',
        catalog_hash: 'h',
        world_id: 'w',
      }),
    ).toEqual({ schema: 1, engine: '0.8.14', catalog: 'c', catalogHash: 'h', worldId: 'w' });
    expect(() => saveMetaOf({ engine: '1' })).toThrow(sourceMessage('copy.persistence.830e86ddaf'));
  });

  it('refuses a truncated file', async () => {
    const file = await encodeSaveFile(meta, database());
    const { offset } = readSaveFileHeader(file);
    // Cut inside the header line, and inside the gzip stream.
    expect((await rejects(decodeSaveFile(file.subarray(0, 40)))).message).toBe(
      sourceMessage('copy.saveFile.truncated'),
    );
    expect((await rejects(decodeSaveFile(file.subarray(0, offset + 30)))).message).toBe(
      sourceMessage('copy.saveFile.truncated'),
    );
    // A header with no database after it is as cut short.
    expect((await rejects(decodeSaveFile(file.subarray(0, offset)))).message).toBe(
      sourceMessage('copy.saveFile.truncated'),
    );
  });

  it('refuses a wrong checksum or size before anything opens the bytes', async () => {
    const file = await encodeSaveFile(meta, database());
    const wrong = sourceMessage('copy.persistence.0d2cd0c308');
    expect(
      (await rejects(decodeSaveFile(withHeader(file, (h) => ({ ...h, sha256: 'b'.repeat(64) })))))
        .message,
    ).toBe(wrong);
    const { header } = readSaveFileHeader(file);
    // A declared size under the real one stops the gunzip at the declaration, never beyond it.
    expect(
      (await rejects(decodeSaveFile(withHeader(file, (h) => ({ ...h, size: header.size - 1 })))))
        .message,
    ).toBe(wrong);
    expect(
      (await rejects(decodeSaveFile(withHeader(file, (h) => ({ ...h, size: header.size + 1 })))))
        .message,
    ).toBe(wrong);
  });

  it('refuses an oversize file or database, stopping decompression at the limit', async () => {
    const file = await encodeSaveFile(meta, database());
    expect((await rejects(decodeSaveFile(file, { file: file.length - 1 }))).message).toBe(
      sourceMessage('copy.persistence.02b1e71246'),
    );
    expect((await rejects(encodeSaveFile(meta, database(), { file: 100 }))).message).toBe(
      sourceMessage('copy.persistence.02b1e71246'),
    );
    const limit = 64 * 1024;
    const over = new Uint8Array(limit + 1);
    expect((await rejects(encodeSaveFile(meta, over, { database: limit }))).message).toBe(
      sourceMessage('copy.compression.32374943f3'),
    );
    // A bomb: a header declaring more than the limit is refused unread; one declaring less than
    // the gzip holds stops at its declaration.
    const bomb = await encodeSaveFile(meta, over);
    expect((await rejects(decodeSaveFile(bomb, { database: limit }))).message).toBe(
      sourceMessage('copy.compression.32374943f3'),
    );
    const small = withHeader(bomb, (h) => ({ ...h, size: 10 }));
    expect((await rejects(decodeSaveFile(small))).message).toBe(
      sourceMessage('copy.persistence.0d2cd0c308'),
    );
    expect(DECOMPRESSED_LIMIT).toBe(1024 * 1024 * 1024);
    expect(PORTABLE_FILE_LIMIT).toBe(256 * 1024 * 1024);
  });

  it('refuses a JSON envelope or any file without the magic as unsupported (→SAVE-29)', async () => {
    const envelope = text.encode(
      JSON.stringify({ schema: 5, engine: '0.8.14', codec: 'gzip-base64', payload: 'H4sI' }),
    );
    const error = await rejects(decodeSaveFile(envelope));
    expect(isSaveCompatibilityError(error)).toBe(true);
    expect(error.message).toBe(sourceMessage('copy.saveFile.notSaveFile'));
    for (const other of [
      new Uint8Array(),
      text.encode('HRSAVE'),
      new Uint8Array(gzipSync(database())),
      text.encode('SQLite format 3\0'),
    ])
      expect(isSaveCompatibilityError(await rejects(decodeSaveFile(other)))).toBe(true);
    // A later format number is as unsupported, never read as this one.
    const file = await encodeSaveFile(meta, database());
    expect(
      isSaveCompatibilityError(
        await rejects(decodeSaveFile(withHeader(file, (h) => ({ ...h, format: 'sqlite-2' })))),
      ),
    ).toBe(true);
  });

  it('refuses a malformed header', async () => {
    const file = await encodeSaveFile(meta, database());
    const invalid = sourceMessage('copy.persistence.830e86ddaf');
    for (const change of [
      (h: Record<string, unknown>) => ({ ...h, sha256: 'xyz' }),
      (h: Record<string, unknown>) => ({ ...h, size: -1 }),
      (h: Record<string, unknown>) => ({ ...h, engine: 7 }),
      (h: Record<string, unknown>) => ({ ...h, worldId: '' }),
    ])
      expect((await rejects(decodeSaveFile(withHeader(file, change)))).message).toBe(invalid);
    expect(
      (await rejects(decodeSaveFile(text.encode(`${SAVE_FILE_MAGIC}{not json}\n`)))).message,
    ).toBe(invalid);
    // A header line that never ends is cut short, not read to the end of a huge file.
    expect(
      (await rejects(decodeSaveFile(text.encode(SAVE_FILE_MAGIC + 'x'.repeat(5000))))).message,
    ).toBe(sourceMessage('copy.saveFile.truncated'));
  });
});
