import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { base64 } from './base64';
import { encodePayload, decodePayload, payloadBytes } from './compression';
describe('gzip-base64 checkpoint compression', () => {
  it('round-trips every byte through gzip-base64', async () => {
    const bytes = new TextEncoder().encode('한글, exact money 000123, emoji ⚽️ 🧑🏽‍💻');
    const encoded = await encodePayload(bytes);
    expect(encoded.codec).toBe('gzip-base64');
    expect(encoded.payload).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
    expect(await decodePayload(encoded.codec, encoded.payload)).toEqual(bytes);
  });
  it('refuses oversized input and decompression beyond the limit', async () => {
    const over = new Uint8Array(32 * 1024 * 1024 + 1);
    await expect(encodePayload(over)).rejects.toThrow('한도');
    const bomb = base64(new Uint8Array(gzipSync(over)));
    await expect(decodePayload('gzip-base64', bomb)).rejects.toThrow('한도');
  });
  it('accepts no other codec', async () => {
    expect(() => payloadBytes('brotli-bmp127' as never, 'AAAA')).toThrow();
    await expect(decodePayload('gzip-cjk14' as never, 'AAAA')).rejects.toThrow();
  });
});
