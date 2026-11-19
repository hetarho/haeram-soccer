import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { DECOMPRESSED_LIMIT, PORTABLE_FILE_LIMIT } from './repository';
import { gzip } from './compression';
describe('gzip compression of a game file', () => {
  it('round-trips every byte', async () => {
    const bytes = new TextEncoder().encode('한글, exact money 000123, emoji ⚽️ 🧑🏽‍💻');
    const packed = await gzip(bytes, true, DECOMPRESSED_LIMIT);
    expect(packed[0]).toBe(0x1f);
    expect(packed[1]).toBe(0x8b);
    expect(await gzip(packed, false, DECOMPRESSED_LIMIT)).toEqual(bytes);
  });
  it('stops decompressing at the limit', async () => {
    const limit = 64 * 1024;
    const over = new Uint8Array(limit + 1);
    const bomb = new Uint8Array(gzipSync(over));
    await expect(gzip(bomb, false, limit)).rejects.toThrow('한도');
    expect((await gzip(bomb, false, limit + 1)).length).toBe(limit + 1);
  });
  it('limits a save to 1 GiB decompressed', () => {
    expect(DECOMPRESSED_LIMIT).toBe(1024 * 1024 * 1024);
    expect(PORTABLE_FILE_LIMIT).toBe(256 * 1024 * 1024);
  });
});
