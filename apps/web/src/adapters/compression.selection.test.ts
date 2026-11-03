import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodePayload } from './compression';
const { compress } = vi.hoisted(() => ({ compress: vi.fn() }));
vi.mock('brotli/compress', () => ({ compress }));
class PassthroughCompression {
  readable: ReadableStream;
  writable: WritableStream;
  constructor() {
    const stream = new TransformStream();
    this.readable = stream.readable;
    this.writable = stream.writable;
  }
}
beforeEach(() => {
  compress.mockReset().mockResolvedValue(new Uint8Array([1, 2, 3]));
});
afterEach(() => vi.unstubAllGlobals());
describe('budget-aware compression selection', () => {
  it('keeps small writes on gzip without invoking Brotli', async () => {
    const result = await encodePayload(new Uint8Array(100), () => false);
    expect(result.codec).toBe('gzip-cjk14');
    expect(compress).not.toHaveBeenCalled();
  });
  it('uses a larger fast candidate only when the complete-envelope predicate accepts it', async () => {
    vi.stubGlobal('CompressionStream', PassthroughCompression);
    const bytes = new Uint8Array(1_200_001);
    const result = await encodePayload(bytes, (candidate) => candidate.codec === 'gzip-cjk14');
    expect(result.codec).toBe('gzip-cjk14');
    expect(compress).not.toHaveBeenCalled();
  });
  it('retains maximum compact compression when fast output is too large or no storage budget is supplied', async () => {
    vi.stubGlobal('CompressionStream', PassthroughCompression);
    const bytes = new Uint8Array(1_200_001);
    expect((await encodePayload(bytes, () => false)).codec).toBe('brotli-bmp127');
    expect((await encodePayload(bytes)).codec).toBe('brotli-bmp127');
    expect(compress).toHaveBeenCalledTimes(2);
    expect(compress).toHaveBeenCalledWith(bytes, { quality: 11, lgwin: 24 });
  });
});
