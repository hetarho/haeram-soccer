import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { bmpBytes, bmpText } from './bmp127';
describe('bounded BMP checkpoint blocks', () => {
  it('preserves arbitrary bytes and exact final-block lengths', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 4096 }), (bytes) => {
        expect(bmpBytes(bmpText(bytes))).toEqual(bytes);
      }),
      { numRuns: 200 },
    );
    for (const length of [0, 1, 126, 127, 128, 253, 254, 255, 65536]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 137 + (i >> 7)) & 255);
      const text = bmpText(bytes);
      expect(text.length).toBe(1 + 64 * Math.ceil(length / 127));
      expect(bmpBytes(JSON.parse(JSON.stringify(text)))).toEqual(bytes);
      for (const char of text.slice(1)) {
        const code = char.charCodeAt(0);
        expect(
          code >= 0x100 &&
            code <= 0xfffd &&
            !(code >= 0xd800 && code <= 0xdfff) &&
            !(code >= 0xfdd0 && code <= 0xfdef),
        ).toBe(true);
      }
    }
  });
  it('rejects malformed headers, lengths, forbidden digits and excess integer bits', () => {
    const text = bmpText(Uint8Array.of(255));
    for (const invalid of [
      '',
      'A',
      text.slice(1),
      text + '\u0100',
      '\u4e00' + text.slice(1),
      '\u4e80' + text.slice(1),
      '\u4e01' + '\ufffd'.repeat(64),
    ])
      expect(() => bmpBytes(invalid)).toThrow();
    for (const char of ['A', '\ud800', '\udfff', '\ufdd0', '\ufdef', '\ufffe', '\uffff'])
      expect(() => bmpBytes(text.slice(0, 1) + char + text.slice(2))).toThrow();
    expect(() => bmpText(new Uint8Array(16 * 1024 * 1024 + 1))).toThrow();
    expect(() =>
      bmpBytes('\u4e7f' + '\u0100'.repeat(64 * (Math.ceil((16 * 1024 * 1024) / 127) + 1))),
    ).toThrow();
  });
});
