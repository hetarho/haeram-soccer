import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { base64 } from './base64';
import { DECOMPRESSED_LIMIT, PORTABLE_FILE_LIMIT } from './repository';
import { encodePayload, decodePayload, payloadBytes } from './compression';
describe('gzip-base64 checkpoint compression', () => {
  it('round-trips every byte through gzip-base64', async () => {
    const bytes = new TextEncoder().encode('한글, exact money 000123, emoji ⚽️ 🧑🏽‍💻');
    const encoded = await encodePayload(bytes);
    expect(encoded.codec).toBe('gzip-base64');
    expect(encoded.payload).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
    expect(await decodePayload(encoded.codec, encoded.payload)).toEqual(bytes);
  });
  it('stops decompressing at the limit', async () => {
    const limit = 64 * 1024;
    const over = new Uint8Array(limit + 1);
    await expect(encodePayload(over, limit)).rejects.toThrow('한도');
    const bomb = base64(new Uint8Array(gzipSync(over)));
    await expect(decodePayload('gzip-base64', bomb, limit)).rejects.toThrow('한도');
    expect((await decodePayload('gzip-base64', bomb, limit + 1)).length).toBe(limit + 1);
  });
  it('limits a save to 1 GiB decompressed', () => {
    expect(DECOMPRESSED_LIMIT).toBe(1024 * 1024 * 1024);
    expect(PORTABLE_FILE_LIMIT).toBe(256 * 1024 * 1024);
  });
  it('accepts no other codec', async () => {
    expect(() => payloadBytes('brotli-bmp127' as never, 'AAAA')).toThrow();
    await expect(decodePayload('gzip-cjk14' as never, 'AAAA')).rejects.toThrow();
  });
});
