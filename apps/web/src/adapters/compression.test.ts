import { describe, expect, it } from 'vitest';
import { brotliCompressSync, brotliDecompressSync, constants } from 'node:zlib';
import { encodePayload, decodePayload } from './compression';
import { bmpText } from './bmp127';
import { compress } from 'brotli/compress';
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
    const over = new Uint8Array(32 * 1024 * 1024 + 1);
    await expect(encodePayload(over)).rejects.toThrow('한도');
    const compressed = brotliCompressSync(over, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 0 },
    });
    await expect(decodePayload('brotli-bmp127', bmpText(compressed))).rejects.toThrow('limit');
    const small = brotliCompressSync(new Uint8Array(1024));
    expect(() => decompress(small, 1024, 512)).toThrow('limit');
    expect(() => decompress(small, -1)).toThrow('limit');
  });
  it('keeps every byte the pinned encoder splits into several meta-blocks', async () => {
    // A 16-bit window closes a meta-block every 128 KiB, as about 2M commands do at the
    // checkpoint's 24-bit window; the unpatched encoder ended the stream after the first one, so
    // the century checkpoint lost its last 2.2 MB and failed its checksum (T271).
    const bytes = new TextEncoder().encode(
      Array.from({ length: 20000 }, (_, i) => `{"id":"p${i}","goals":${i % 37}}`).join(','),
    );
    const packed = await compress(bytes, { quality: 5, lgwin: 16 });
    expect(decompress(packed!)).toEqual(bytes);
    expect(new Uint8Array(brotliDecompressSync(packed!))).toEqual(bytes);
  });
});
