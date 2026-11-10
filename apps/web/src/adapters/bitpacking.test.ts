import { describe, expect, it } from 'vitest';
import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { integer, random } from '../../../../packages/engine/src/primitives';
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

  it('roundtrips bit planes, including 53-bit values, without changing legacy column layout', () => {
    const values = [0, 90, 0, 7, 90, Number.MAX_SAFE_INTEGER, 1, 90, 2 ** 40 + 17];
    const legacy = packBitColumns(values, 3);
    const planes = packBitColumns(values, 3, 'planes');
    expect(legacy.layout).toBeUndefined();
    expect(planes.layout).toBe('planes');
    expect(planes.headers).toEqual(legacy.headers);
    expect(planes.data.length).toBe(legacy.data.length);
    for (const packed of [legacy, planes]) {
      const reader = readBitColumns(packed, 3);
      expect([...reader.take(2), ...reader.take(7)]).toEqual(values);
      reader.done();
    }
    const empty = packBitColumns([], 3, 'planes');
    expect(readBitColumns(empty, 3).take(0)).toEqual([]);
    expect(() =>
      readBitColumns({ ...planes, layout: 'unknown' } as unknown as BitColumns, 3),
    ).toThrow();
  });
});

describe('bit layout equivalence', () => {
  it('preserves varied integer columns and partial reads in both representations', () => {
    const values = Array.from({ length: 37 * 7 }, (_, i) =>
      i % 7 === 0 ? 12 : (i * 7919) % 104729,
    );
    for (const layout of [undefined, 'planes'] as const) {
      const reader = readBitColumns(packBitColumns(values, 7, layout), 7);
      const restored = [];
      for (let remaining = values.length; remaining > 0;) {
        const take = Math.min(13, remaining);
        restored.push(...reader.take(take));
        remaining -= take;
      }
      expect(restored).toEqual(values);
      reader.done();
    }
  });
});

// Frozen copy of bitpacking.ts before T780 (planning commit 81463c87): the oracle the integer
// paths must match byte for byte. Do not update it when the codec changes.
const LEGACY_MAX_COUNT = 1_000_000;
const LEGACY_MAX_CELLS = 16 * 1024 * 1024;

function legacyValidateWidth(width: number) {
  if (!Number.isInteger(width) || width < 1 || width > 156)
    throw new Error(sourceMessage('copy.bitpacking.c852cf9f8f'));
}

function legacyBase64(bytes: Uint8Array) {
  let encoded = '';
  for (let i = 0; i < bytes.length; i += 32768)
    encoded += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(encoded);
}

function legacyUnbase64(encoded: string) {
  if (
    typeof encoded !== 'string' ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
  )
    throw new Error(sourceMessage('copy.bitpacking.35fae48603'));
  return Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
}

function legacyRangeBits(range: number) {
  let bits = 0;
  for (; range > 0; range = Math.floor(range / 2)) bits++;
  return bits;
}

function legacyPackBitColumns(values: number[], width: number, layout?: 'planes'): BitColumns {
  legacyValidateWidth(width);
  if (layout !== undefined && layout !== 'planes')
    throw new Error(sourceMessage('copy.bitpacking.01dcc08ad1'));
  const count = values.length / width;
  if (!Number.isInteger(count) || count > LEGACY_MAX_COUNT || values.length > LEGACY_MAX_CELLS)
    throw new Error(sourceMessage('copy.bitpacking.41ba32cdfb'));
  const headers: [number, number][] = [];
  let totalBits = 0;
  for (let column = 0; column < width; column++) {
    let min = Number.MAX_SAFE_INTEGER,
      max = 0;
    for (let row = 0; row < count; row++) {
      const value = values[row * width + column];
      if (!Number.isSafeInteger(value) || value < 0)
        throw new Error(sourceMessage('copy.bitpacking.936448c6ca'));
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    if (!count) min = 0;
    const bits = legacyRangeBits(max - min);
    headers.push([min, bits]);
    totalBits += count * bits;
  }
  const bytes = new Uint8Array(Math.ceil(totalBits / 8));
  let offset = 0;
  for (let column = 0; column < width; column++) {
    const [min, widthBits] = headers[column];
    if (layout === 'planes') {
      for (let bit = 0; bit < widthBits; bit++) {
        const weight = 2 ** bit;
        for (let row = 0; row < count; row++) {
          const value = values[row * width + column] - min;
          bytes[Math.floor(offset / 8)] += (Math.floor(value / weight) % 2) * 2 ** (offset % 8);
          offset++;
        }
      }
      continue;
    }
    for (let row = 0; row < count; row++) {
      let value = values[row * width + column] - min;
      let remaining = widthBits;
      while (remaining) {
        const withinByte = offset % 8;
        const chunk = Math.min(8 - withinByte, remaining);
        bytes[Math.floor(offset / 8)] += (value % 2 ** chunk) * 2 ** withinByte;
        value = Math.floor(value / 2 ** chunk);
        remaining -= chunk;
        offset += chunk;
      }
    }
  }
  return { count, headers, data: legacyBase64(bytes), ...(layout ? { layout } : {}) };
}

function legacyReadBitColumns(packed: BitColumns, width: number) {
  legacyValidateWidth(width);
  if (
    !packed ||
    !Number.isInteger(packed.count) ||
    packed.count < 0 ||
    packed.count > LEGACY_MAX_COUNT ||
    packed.count * width > LEGACY_MAX_CELLS ||
    !Array.isArray(packed.headers) ||
    packed.headers.length !== width ||
    (packed.layout !== undefined && packed.layout !== 'planes')
  )
    throw new Error(sourceMessage('copy.bitpacking.d845f1a234'));
  const offsets: number[] = [];
  let totalBits = 0;
  for (const header of packed.headers) {
    if (
      !Array.isArray(header) ||
      header.length !== 2 ||
      !Number.isSafeInteger(header[0]) ||
      header[0] < 0 ||
      !Number.isInteger(header[1]) ||
      header[1] < 0 ||
      header[1] > 53
    )
      throw new Error(sourceMessage('copy.bitpacking.7898b86990'));
    offsets.push(totalBits);
    totalBits += packed.count * header[1];
  }
  const bytes = legacyUnbase64(packed.data);
  if (
    bytes.length !== Math.ceil(totalBits / 8) ||
    (totalBits % 8 && bytes.at(-1)! >= 2 ** (totalBits % 8))
  )
    throw new Error(sourceMessage('copy.bitpacking.665c029da5'));
  const cells = packed.count * width;
  let cursor = 0;
  return {
    take(n: number): number[] {
      if (!Number.isInteger(n) || n < 0 || cursor + n > cells)
        throw new Error(sourceMessage('copy.bitpacking.698d8a75fe'));
      const result = Array.from({ length: n }, (_, i) => {
        const index = cursor + i,
          column = index % width,
          row = Math.floor(index / width);
        const [min, widthBits] = packed.headers[column];
        let offset = offsets[column] + row * widthBits;
        let remaining = widthBits,
          written = 0,
          value = 0;
        if (packed.layout === 'planes') {
          for (let bit = 0; bit < widthBits; bit++) {
            const position = offsets[column] + bit * packed.count + row;
            value +=
              (Math.floor(bytes[Math.floor(position / 8)] / 2 ** (position % 8)) % 2) * 2 ** bit;
          }
          remaining = 0;
        }
        while (remaining) {
          const withinByte = offset % 8;
          const chunk = Math.min(8 - withinByte, remaining);
          const part = Math.floor(bytes[Math.floor(offset / 8)] / 2 ** withinByte) % 2 ** chunk;
          value += part * 2 ** written;
          offset += chunk;
          written += chunk;
          remaining -= chunk;
        }
        value += min;
        if (!Number.isSafeInteger(value) || value < 0)
          throw new Error(sourceMessage('copy.bitpacking.c74e47069c'));
        return value;
      });
      cursor += n;
      return result;
    },
    done() {
      if (cursor !== cells) throw new Error(sourceMessage('copy.bitpacking.39c0a255cf'));
    },
  };
}

type Outcome = { value: unknown } | { error: string };
type Layout = 'planes' | undefined;
const LAYOUTS: Layout[] = [undefined, 'planes'];
const SAFE_BITS = 53;

/** The result, or the error's class and message, so throws compare as data. */
function outcome(run: () => unknown): Outcome {
  try {
    return { value: run() };
  } catch (error) {
    return { error: `${(error as Error).name}: ${(error as Error).message}` };
  }
}

/** A uniform integer in [0, 2^bits), exact up to 53 bits. */
function uniformBits(r: () => number, bits: number) {
  if (bits <= 26) return Math.floor(r() * 2 ** bits);
  return Math.floor(r() * 2 ** (bits - 26)) * 2 ** 26 + Math.floor(r() * 2 ** 26);
}

/** Rows whose columns span exactly `bits[column]` bits (two rows or more) above a zero, random or top minimum. */
function randomColumns(r: () => number, bits: number[], count: number) {
  const width = bits.length,
    values = new Array<number>(width * count);
  bits.forEach((size, column) => {
    const span = 2 ** size - 1,
      choice = r();
    const min =
      choice < 0.3
        ? 0
        : choice < 0.5
          ? Number.MAX_SAFE_INTEGER - span
          : uniformBits(r, SAFE_BITS - Math.max(size, 1)) % (Number.MAX_SAFE_INTEGER - span + 1);
    for (let row = 0; row < count; row++) {
      const pick = r();
      const delta =
        row === 0 ? span : row === 1 || pick < 0.15 ? 0 : pick < 0.3 ? span : uniformBits(r, size);
      values[row * width + column] = min + delta;
    }
  });
  return values;
}

/** Take sizes that consume `cells` in random chunks, empty takes included. */
function chunks(r: () => number, cells: number, width: number) {
  const sizes: number[] = [];
  for (let left = cells; left > 0;) {
    const choice = r();
    const n = Math.min(
      left,
      choice < 0.1 ? 0 : choice < 0.4 ? 1 : choice < 0.7 ? width : integer(r, 1, 2 * width + 3),
    );
    sizes.push(n);
    left -= n;
  }
  return sizes;
}

/** Every open, take and done of one reader with its result or error. */
function readTrace(
  read: typeof readBitColumns,
  packed: BitColumns,
  width: number,
  takes: number[],
): Outcome[] {
  let reader: ReturnType<typeof readBitColumns> | undefined;
  const trace = [
    outcome(() => {
      reader = read(packed, width);
    }),
  ];
  if (!reader) return trace;
  for (const n of takes) trace.push(outcome(() => reader!.take(n)));
  trace.push(outcome(() => reader!.done()));
  return trace;
}

describe('integer bit paths match the frozen floating-point codec', () => {
  const widths = new Set<string>();

  function expectSame(values: number[], width: number, layout: Layout, takes: number[]) {
    const before = legacyPackBitColumns(values, width, layout);
    const after = packBitColumns(values, width, layout);
    expect(after).toStrictEqual(before);
    const bytes = (data: string) => Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
    expect(bytes(after.data)).toStrictEqual(bytes(before.data));
    const trace = readTrace(readBitColumns, before, width, takes);
    expect(trace).toStrictEqual(readTrace(legacyReadBitColumns, before, width, takes));
    // Decoding adds the minimum to +0, so a stored -0 reads back as 0 in both codecs.
    expect(
      trace.slice(1, -1).flatMap((step) => ('value' in step ? (step.value as number[]) : [])),
    ).toStrictEqual(values.map((value) => value + 0));
    expect(trace.at(-1)).toStrictEqual({ value: undefined });
    for (const [, bits] of after.headers) widths.add(`${layout ?? 'rows'}:${bits}`);
  }

  it('packs, encodes and decodes seeded random columns of every width 1–53 identically', () => {
    const r = random('T780 equivalence');
    for (let bits = 0; bits <= SAFE_BITS; bits++)
      for (const layout of LAYOUTS)
        for (let trial = 0; trial < 4; trial++) {
          const width = integer(r, 1, 6),
            count = trial < 3 ? integer(r, 2, 40) : integer(r, 0, 40);
          const sizes = Array.from({ length: width }, (_, column) =>
            column === trial % width ? bits : integer(r, 0, SAFE_BITS),
          );
          expectSame(
            randomColumns(r, sizes, count),
            width,
            layout,
            chunks(r, width * count, width),
          );
        }
    const edges = [0, 1, 7, 8, 9, 15, 16, 17, 24, 25, 30, 31, 32, 33, 48, 52, 53];
    for (let trial = 0; trial < 300; trial++) {
      const width = integer(r, 1, 12),
        count = integer(r, 0, 70),
        layout = LAYOUTS[trial % 2];
      const sizes = Array.from({ length: width }, () =>
        r() < 0.5 ? edges[integer(r, 0, edges.length - 1)] : integer(r, 0, SAFE_BITS),
      );
      expectSame(randomColumns(r, sizes, count), width, layout, chunks(r, width * count, width));
    }
    for (const layout of LAYOUTS) {
      for (const width of [1, 3, 156]) expectSame([], width, layout, [0]);
      expectSame([0, 0, 0, 0], 2, layout, [4]);
      expectSame([Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER], 1, layout, [2]);
      expectSame([0, Number.MAX_SAFE_INTEGER, 2 ** 31 - 1, 2 ** 31, 2 ** 32], 1, layout, [2, 3]);
      expectSame([-0, 0, 5, -0], 2, layout, [1, 3]);
      const wide = randomColumns(r, new Array<number>(156).fill(31), 3);
      expectSame(wide, 156, layout, [100, 0, 368]);
    }
    for (const layout of LAYOUTS)
      for (let bits = 1; bits <= SAFE_BITS; bits++)
        expect(widths.has(`${layout ?? 'rows'}:${bits}`)).toBe(true);
  });

  it('writes and reads every byte value through base64 as btoa and atob do', () => {
    const r = random('T780 base64');
    for (const length of [...Array.from({ length: 40 }, (_, i) => i + 2), 32768 * 2 + 5]) {
      const values = Array.from({ length }, () => integer(r, 0, 255));
      values[0] = 0;
      values[1] = 255;
      const packed = packBitColumns(values, 1);
      expect(packed.data).toBe(legacyBase64(Uint8Array.from(values)));
      expect(packed).toStrictEqual(legacyPackBitColumns(values, 1));
      expect(readBitColumns(packed, 1).take(length)).toStrictEqual(values);
      expect(legacyReadBitColumns(packed, 1).take(length)).toStrictEqual(values);
    }
  });

  it('rejects malformed input with the same error at the same step', () => {
    const r = random('T780 malformed');
    const packInputs: [unknown, unknown, unknown][] = [
      ...[0, -1, 157, 1.5, NaN, '2'].map((width) => [[], width, undefined]),
      ...['rows', null, '', 0].map((layout) => [[1], 1, layout]),
      ...[-1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, -Infinity, '1', undefined, null].map(
        (value) => [[3, value, 4, 5], 2, 'planes'],
      ),
      [[1, 2], 3, undefined],
      [new Array<number>(1_000_001).fill(0), 1, undefined],
      [null, 1, undefined],
    ] as [unknown, unknown, unknown][];
    for (const [values, width, layout] of packInputs) {
      const run = (pack: typeof packBitColumns) =>
        outcome(() => pack(values as number[], width as number, layout as Layout));
      const result = run(packBitColumns);
      expect(result).toHaveProperty('error');
      expect(result).toStrictEqual(run(legacyPackBitColumns));
    }

    const streams: [BitColumns, number][] = [];
    for (const layout of LAYOUTS) {
      const packed = packBitColumns([0, 7, 2 ** 40, 3, 1, 5], 3, layout);
      const [first, second, third] = packed.headers,
        data = packed.data;
      const patches: Record<string, unknown>[] = [
        { count: -1 },
        { count: 1.5 },
        { count: NaN },
        { count: '2' },
        { count: 1_000_001 },
        { count: 3 },
        { headers: 'x' },
        { headers: [second, third] },
        { headers: [first, 7, third] },
        { headers: [first, [0, 3, 1], third] },
        ...[-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '1'].map((min) => ({
          headers: [[min, first[1]], second, third],
        })),
        ...[-1, 1.5, 54, '3'].map((bits) => ({ headers: [[0, bits], second, third] })),
        { headers: [[Number.MAX_SAFE_INTEGER - 1, first[1]], second, third] },
        { headers: [first, second, [Number.MAX_SAFE_INTEGER - 2 ** 39, third[1]]] },
        { layout: 'rows' },
        { layout: null },
        ...[
          123,
          null,
          '',
          '!',
          'A',
          'AA',
          'AA=',
          'AAA',
          'AAAA=',
          ` ${data}`,
          `${data}\n`,
          '====',
        ].map((value) => ({ data: value })),
        { data: data.slice(0, -4) },
        { data: `${data}AAAA` },
        { data: `${data.slice(0, -2)}//` },
        { data: data.replace(/=+$/, '') },
      ];
      for (const patch of patches) streams.push([{ ...packed, ...patch } as BitColumns, 3]);
      for (const width of [0, 2, 1.5]) streams.push([packed, width]);
      streams.push([null as unknown as BitColumns, 3], [undefined as unknown as BitColumns, 3]);
    }
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    for (let trial = 0; trial < 400; trial++) {
      const width = integer(r, 1, 5),
        count = integer(r, 1, 12);
      const sizes = Array.from({ length: width }, () => integer(r, 0, SAFE_BITS));
      const mutated = packBitColumns(randomColumns(r, sizes, count), width, LAYOUTS[trial % 2]);
      const column = integer(r, 0, width - 1),
        kind = integer(r, 0, 3),
        symbols = mutated.data.replace(/=+$/, '').length;
      if (kind === 0 && symbols) {
        const at = integer(r, 0, symbols - 1);
        mutated.data = `${mutated.data.slice(0, at)}${alphabet[integer(r, 0, 63)]}${mutated.data.slice(at + 1)}`;
      } else if (kind === 1)
        mutated.headers[column][0] = Number.MAX_SAFE_INTEGER - integer(r, 0, 9);
      else if (kind === 2) mutated.headers[column][1] += integer(r, -1, 1);
      else mutated.count += integer(r, -1, 1);
      streams.push([mutated, width]);
    }
    const seen = new Set<string>();
    for (const [packed, width] of streams) {
      const count = (packed as BitColumns | null | undefined)?.count,
        cells = typeof count === 'number' ? count * width : 0;
      const takes = [1, 0, -1, 1.5, NaN, cells + 1, Math.max(cells - 2, 0), 1, 5, cells];
      const trace = readTrace(readBitColumns, packed, width, takes);
      expect(trace).toStrictEqual(readTrace(legacyReadBitColumns, packed, width, takes));
      for (const step of trace) if ('error' in step) seen.add(step.error);
    }
    for (const id of [
      'copy.bitpacking.c852cf9f8f',
      'copy.bitpacking.35fae48603',
      'copy.bitpacking.d845f1a234',
      'copy.bitpacking.7898b86990',
      'copy.bitpacking.665c029da5',
      'copy.bitpacking.698d8a75fe',
      'copy.bitpacking.c74e47069c',
      'copy.bitpacking.39c0a255cf',
    ] as const)
      expect(seen).toContain(`Error: ${sourceMessage(id)}`);
  });
});
