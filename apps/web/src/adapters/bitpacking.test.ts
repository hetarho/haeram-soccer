import { describe, expect, it } from 'vitest';
import { packBitColumns, readBitColumns, type BitColumns } from './bitpacking';

describe('lossless bit column packing', () => {
  it('reconstructs mixed columns across byte boundaries and sequential take calls', () => {
    const values = [0, 90, 500, 1, 90, 503, 7, 90, 499, 3, 90, 512];
    const packed = packBitColumns(values, 3),
      reader = readBitColumns(packed, 3);
    expect(packed.headers[1]).toEqual([90, 0]);
    expect([...reader.take(1), ...reader.take(5), ...reader.take(6)]).toEqual(values);
    reader.done();
    expect(() => reader.take(1)).toThrow();
  });

  it('preserves all 53 safe integer bits including values above 32 bits and unaligned columns', () => {
    const values = [0, 1, 0, 2 ** 32 + 17, 4, Number.MAX_SAFE_INTEGER, 2 ** 40 + 123, 6, 2 ** 52];
    const packed = packBitColumns(values, 3),
      reader = readBitColumns(packed, 3);
    expect(packed.headers[2][1]).toBe(53);
    expect(reader.take(values.length)).toEqual(values);
    reader.done();
    const boundary = packBitColumns([0, 2 ** 52], 1);
    expect(boundary.headers[0][1]).toBe(53);
    expect(readBitColumns(boundary, 1).take(2)).toEqual([0, 2 ** 52]);
  });

  it('supports empty and constant zero columns without generating data bytes', () => {
    for (const values of [[], [0, 0, 0, 0, 0, 0]]) {
      const packed = packBitColumns(values, 3),
        reader = readBitColumns(packed, 3);
      expect(packed.data).toBe('');
      expect(reader.take(values.length)).toEqual(values);
      reader.done();
    }
  });

  it('rejects unsafe inputs and malformed row widths', () => {
    for (const values of [[-1], [0.5], [Number.MAX_SAFE_INTEGER + 1], [NaN], [Infinity]])
      expect(() => packBitColumns(values, 1)).toThrow();
    expect(() => packBitColumns([1, 2], 3)).toThrow();
    for (const width of [0, -1, 157, 1.5]) expect(() => packBitColumns([], width)).toThrow();
  });

  it('rejects corrupted headers, truncated streams, extra bytes and nonzero padding', () => {
    const packed = packBitColumns([0, 7], 1);
    const invalid: BitColumns[] = [
      { ...packed, count: -1 },
      { ...packed, count: 1_000_001 },
      { ...packed, headers: [] },
      { ...packed, headers: [[-1, 3]] },
      { ...packed, headers: [[0, 54]] },
      { ...packed, headers: [[0.5, 3]] },
      { ...packed, data: '' },
      { ...packed, data: btoa(String.fromCharCode(56, 0)) },
      { ...packed, data: btoa(String.fromCharCode(255)) },
      { ...packed, data: '!' },
    ];
    for (const input of invalid) expect(() => readBitColumns(input, 1)).toThrow();
  });

  it('checks reconstructed bounds and requires callers to consume the whole stream', () => {
    const reader = readBitColumns(packBitColumns([1, 2, 3], 1), 1);
    reader.take(1);
    expect(() => reader.done()).toThrow();
    expect(() => reader.take(-1)).toThrow();
    const overflow = readBitColumns(
      { count: 1, headers: [[Number.MAX_SAFE_INTEGER, 1]], data: btoa(String.fromCharCode(1)) },
      1,
    );
    expect(() => overflow.take(1)).toThrow();
  });
});
