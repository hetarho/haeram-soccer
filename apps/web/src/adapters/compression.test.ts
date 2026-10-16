import { describe, expect, it } from 'vitest';
import { brotliCompressSync, constants } from 'node:zlib';
import { encodePayload, decodePayload } from './compression';
import { bmpText } from './bmp127';
import { decompress } from 'brotli/decompress';
describe('bounded adaptive checkpoint compression', () => {
  it('keeps small writes fast and decodes portable Brotli bytes exactly', async () => {
    const bytes = new TextEncoder().encode('한글, exact money 000123, emoji ⚽️ 🧑🏽‍💻');
    const small = await encodePayload(bytes);
    expect(small.codec).toBe('gzip-cjk14');
    expect(await decodePayload(small.codec, small.payload)).toEqual(bytes);
    const compressed = brotliCompressSync(bytes);
    expect(await decodePayload('brotli-bmp127', bmpText(compressed))).toEqual(bytes);
    await expect(
      decodePayload('brotli-bmp127', bmpText(compressed.subarray(0, 2))),
    ).rejects.toThrow();
  });
  it('refuses oversized input and decoder allocation before growth', async () => {
    const over = new Uint8Array(16 * 1024 * 1024 + 1);
    await expect(encodePayload(over)).rejects.toThrow('한도');
    const compressed = brotliCompressSync(over, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 0 },
    });
    await expect(decodePayload('brotli-bmp127', bmpText(compressed))).rejects.toThrow('limit');
    const small = brotliCompressSync(new Uint8Array(1024));
    expect(() => decompress(small, 1024, 512)).toThrow('limit');
    expect(() => decompress(small, -1)).toThrow('limit');
  });
});
