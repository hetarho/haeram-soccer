import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { denseBytes, denseText } from './dense';

describe('dense checkpoint text', () => {
  it('round-trips any bytes exactly', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 4096 }), (bytes) => {
        expect(denseBytes(denseText(bytes))).toEqual(bytes);
      }),
      { numRuns: 400 },
    );
  });
  it('carries 14 bits per character from assigned, unnormalized ideographs', () => {
    const bytes = Uint8Array.from({ length: 70000 }, (_, i) => (i * 131 + (i >> 7)) & 0xff);
    const text = denseText(bytes);
    expect(text.length).toBe(1 + Math.ceil((bytes.length * 8) / 14));
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      expect(code >= 0x4e00 && code <= 0x8dff).toBe(true);
    }
    expect(text.normalize('NFKC')).toBe(text);
    expect(JSON.parse(JSON.stringify(text))).toBe(text);
  });
  it('rejects foreign characters, wrong lengths and non-zero padding', () => {
    const text = denseText(Uint8Array.from([1, 2, 3, 4, 5]));
    expect(() => denseBytes('')).toThrow('헤더');
    expect(() => denseBytes('A' + text.slice(1))).toThrow('헤더');
    expect(() => denseBytes(text.slice(0, 2) + 'A' + text.slice(3))).toThrow('문자');
    expect(() => denseBytes(text + text.slice(1, 2))).toThrow();
    expect(() => denseBytes(text.slice(0, -1))).toThrow();
    const last = text.charCodeAt(text.length - 1);
    expect(() => denseBytes(text.slice(0, -1) + String.fromCharCode(last | 1))).toThrow('패딩');
  });
});
