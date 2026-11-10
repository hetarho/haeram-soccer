import { describe, expect, it } from 'vitest';
import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { integer, random } from '../../../../packages/engine/src/primitives';
import { base64, integers, reader, unbase64 } from './packing';

// Frozen copy of packing.ts's helpers before T789 (planning commit aeb2c618): the oracle the integer
// paths must match byte for byte. Do not update it when the codec changes.
function legacyBase64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 32768)
    s += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(s);
}
function legacyUnbase64(s: string) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error(sourceMessage('copy.packing.0e84000039'));
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
function legacyIntegers(values: number[], width: number) {
  const count = values.length / width;
  values = Array.from(
    { length: values.length },
    (_, i) => values[(i % count) * width + Math.floor(i / count)],
  );
  const out: number[] = [];
  for (let n of values) {
    if (!Number.isSafeInteger(n) || n < 0)
      throw new Error(sourceMessage('copy.packing.2ca992465a'));
    do {
      const b = n % 128;
      n = Math.floor(n / 128);
      out.push(b + (n ? 128 : 0));
    } while (n);
  }
  return legacyBase64(Uint8Array.from(out));
}
function legacyReader(s: string, width: number) {
  const a = legacyUnbase64(s);
  let i = 0;
  const columns: number[] = [];
  while (i < a.length) {
    let n = 0,
      scale = 1,
      b: number;
    do {
      if (i >= a.length || scale > 2 ** 49)
        throw new Error(sourceMessage('copy.packing.7b93217a0a'));
      b = a[i++];
      n += (b % 128) * scale;
      scale *= 128;
    } while (b >= 128);
    if (!Number.isSafeInteger(n)) throw new Error(sourceMessage('copy.packing.cbfdbb8ee5'));
    columns.push(n);
  }
  if (columns.length % width) throw new Error(sourceMessage('copy.packing.ff69a7bc0c'));
  const count = columns.length / width;
  const values = Array.from(
    { length: columns.length },
    (_, j) => columns[(j % width) * count + Math.floor(j / width)],
  );
  let offset = 0;
  return {
    rows: count,
    take(n: number) {
      if (offset + n > values.length) throw new Error(sourceMessage('copy.packing.0d1fed513f'));
      const result = values.slice(offset, offset + n);
      offset += n;
      return result;
    },
    done() {
      if (offset !== values.length) throw new Error(sourceMessage('copy.packing.a78da0c20b'));
    },
  };
}

type Outcome = { value: unknown } | { error: string };
const SAFE_BITS = 53;
/** Every boundary of the 7-bit groups and of the integer path, up to the largest safe integer. */
const EDGES = [
  0,
  1,
  127,
  128,
  2 ** 14 - 1,
  2 ** 14,
  2 ** 21 - 1,
  2 ** 21,
  2 ** 28 - 1,
  2 ** 28,
  2 ** 30,
  7 * 2 ** 28,
  2 ** 31 - 1,
  2 ** 31,
  2 ** 32 - 1,
  2 ** 32,
  2 ** 35 - 1,
  2 ** 35,
  2 ** 42,
  2 ** 49 - 1,
  2 ** 49,
  2 ** 52,
  Number.MAX_SAFE_INTEGER,
];

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

/** Values whose sizes mix edges, small counts and every bit length. */
function randomValues(r: () => number, length: number) {
  return Array.from({ length }, () => {
    const choice = r();
    return choice < 0.25
      ? EDGES[integer(r, 0, EDGES.length - 1)]
      : choice < 0.6
        ? integer(r, 0, 300)
        : uniformBits(r, integer(r, 0, SAFE_BITS));
  });
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

/** Opening a reader (its row count), every take and done, each with its result or error. */
function readTrace(read: typeof reader, s: string, width: number, takes: number[]): Outcome[] {
  let opened: ReturnType<typeof reader> | undefined;
  const trace = [
    outcome(() => {
      opened = read(s, width);
      return opened.rows;
    }),
  ];
  if (!opened) return trace;
  for (const n of takes) trace.push(outcome(() => opened!.take(n)));
  trace.push(outcome(() => opened!.done()));
  return trace;
}

/** A stream as `bytes`, written with the frozen encoder. */
const stream = (bytes: number[]) => legacyBase64(Uint8Array.from(bytes));

/** The first index where two large sequences differ (`Object.is`), -1 when equal; deep equality is slow at this size. */
function firstDifference(a: ArrayLike<unknown>, b: ArrayLike<unknown>) {
  if (a.length !== b.length) return Math.min(a.length, b.length);
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return i;
  return -1;
}

describe('base64 matches the frozen btoa/atob codec', () => {
  it('writes and reads every byte value, short and large buffers identically', () => {
    const r = random('T789 base64');
    const buffers: Uint8Array[] = [
      new Uint8Array(0),
      ...Array.from({ length: 256 }, (_, byte) => Uint8Array.of(byte)),
      Uint8Array.from({ length: 256 }, (_, byte) => byte),
      Uint8Array.from({ length: 256 }, (_, byte) => 255 - byte),
      ...Array.from({ length: 40 }, (_, length) =>
        Uint8Array.from({ length }, () => integer(r, 0, 255)),
      ),
    ];
    // A view into a larger buffer, as `integers` passes its written bytes.
    const backing = Uint8Array.from({ length: 1000 }, () => integer(r, 0, 255));
    buffers.push(backing.subarray(7, 700), backing.subarray(0, 0), backing.subarray(998));
    for (const bytes of buffers) {
      const text = base64(bytes);
      expect(text).toBe(legacyBase64(bytes));
      expect(unbase64(text)).toStrictEqual(legacyUnbase64(text));
      expect(unbase64(text)).toStrictEqual(Uint8Array.from(bytes));
    }
    // Buffers past the frozen encoder's 32768-byte chunks.
    for (const length of [32768 * 2 + 5, 200_001]) {
      const bytes = Uint8Array.from({ length }, () => integer(r, 0, 255)),
        text = base64(bytes);
      expect(text).toBe(legacyBase64(bytes));
      expect(firstDifference(unbase64(text), legacyUnbase64(text))).toBe(-1);
      expect(firstDifference(unbase64(text), bytes)).toBe(-1);
    }
  });

  it('rejects malformed text with the same error, including what only atob refuses', () => {
    const r = random('T789 unbase64');
    const inputs: unknown[] = [
      '',
      '!',
      'A',
      'AA',
      'AA=',
      'AAA',
      'AAAA=',
      'AAAAA',
      'QQ',
      'QR==',
      'Q===',
      'AB=C',
      '=',
      '====',
      ' AAAA',
      'AAAA\n',
      'AA AA',
      'ÿÿÿÿ',
      'AAAA-_',
      null,
      undefined,
      123,
    ];
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/= -_!';
    for (let trial = 0; trial < 500; trial++)
      inputs.push(
        Array.from({ length: integer(r, 0, 13) }, () => alphabet[integer(r, 0, 68)]).join(''),
      );
    const errors = new Set<string>();
    for (const input of inputs) {
      const after = outcome(() => unbase64(input as string));
      expect(after).toStrictEqual(outcome(() => legacyUnbase64(input as string)));
      if ('error' in after) errors.add(after.error);
    }
    expect(errors).toContain(`Error: ${sourceMessage('copy.packing.0e84000039')}`);
    expect([...errors].some((error) => error.startsWith('InvalidCharacterError'))).toBe(true);
  });
});

describe('LEB128 integer streams match the frozen floating-point codec', () => {
  const seen = new Set<string>();

  function expectSame(values: unknown[], width: number, takes: number[]) {
    const after = outcome(() => integers(values as number[], width));
    expect(after).toStrictEqual(outcome(() => legacyIntegers(values as number[], width)));
    if ('error' in after) {
      seen.add(after.error);
      return;
    }
    const text = after.value as string;
    expect(unbase64(text)).toStrictEqual(legacyUnbase64(text));
    const trace = readTrace(reader, text, width, takes);
    expect(trace).toStrictEqual(readTrace(legacyReader, text, width, takes));
    for (const step of trace) if ('error' in step) seen.add(step.error);
    return trace;
  }

  it('writes and reads every edge, -0 and seeded random rows identically', () => {
    const r = random('T789 varints');
    for (const value of EDGES) {
      const trace = expectSame([value], 1, [1]);
      expect(trace?.[1]).toStrictEqual({ value: [value] });
    }
    // Every edge in each of three columns.
    const rows = [...EDGES, ...[...EDGES].reverse(), ...EDGES];
    expect(expectSame(rows, 3, [rows.length])?.[1]).toStrictEqual({ value: rows });
    expectSame([-0, 0, 5, -0], 2, [1, 3]);
    expectSame([], 1, [0]);
    expectSame([], 4, [0, 1]);
    for (let trial = 0; trial < 400; trial++) {
      const width = integer(r, 1, 9),
        count = integer(r, 0, 40);
      const values = randomValues(r, width * count);
      const trace = expectSame(values, width, chunks(r, width * count, width));
      expect(
        trace!.slice(1, -1).flatMap((step) => ('value' in step ? (step.value as number[]) : [])),
      ).toStrictEqual(values.map((value) => value + 0));
    }
    // A large stream (past the frozen encoder's 32768-byte chunks), compared element by element.
    const large = 100_003,
      values = randomValues(r, large * 2),
      text = integers(values, 2);
    expect(text).toBe(legacyIntegers(values, 2));
    const after = reader(text, 2),
      before = legacyReader(text, 2);
    expect(after.rows).toBe(before.rows);
    let offset = 0;
    for (const n of [large - 1, 0, large + 1]) {
      const taken = after.take(n);
      expect(firstDifference(taken, before.take(n))).toBe(-1);
      expect(firstDifference(taken, values.slice(offset, (offset += n)))).toBe(-1);
    }
    after.done();
    before.done();
  });

  it('rejects the same values, widths and malformed streams with the same error', () => {
    const r = random('T789 malformed');
    const invalid = [-1, -(2 ** 31), 0.5, 2 ** 31 + 0.5, NaN, Infinity, -Infinity];
    for (const value of [...invalid, 2 ** 53, '1', undefined, null])
      expectSame([3, value, 4, 5], 2, [4]);
    for (const [length, width] of [
      [3, 2],
      [5, 3],
      [4, 0],
      [0, 0],
      [3, -1],
      [4, 1.5],
      [2, NaN],
    ])
      expectSame(
        Array.from({ length }, (_, i) => i * 1000),
        width,
        [1, 0, 2],
      );

    const streams: [string, number][] = [
      ...['', '!', 'A', 'AA=', ' AAAA', '===='].map((s): [string, number] => [s, 1]),
      // Truncated in the integer bytes and in the exact bytes.
      [stream([128]), 1],
      [stream([5, 255, 255, 255]), 1],
      [stream([255, 255, 255, 255, 128]), 1],
      [stream([255, 255, 255, 255, 255, 255, 255, 255]), 1],
      // A ninth byte, and eight bytes past (2^53, 2^56 - 1) and at (2^53 - 1) the largest safe integer.
      [stream([...new Array<number>(8).fill(128), 1]), 1],
      [stream([128, 128, 128, 128, 128, 128, 128, 16]), 1],
      [stream([255, 255, 255, 255, 255, 255, 255, 127]), 1],
      [stream([255, 255, 255, 255, 255, 255, 255, 15]), 1],
      // Fifth bytes either side of the integer path's last one, 7 (2^31 - 1) and 8 (2^31).
      [stream([255, 255, 255, 255, 7, 128, 128, 128, 128, 8, 255, 255, 255, 255, 8]), 3],
      // Overlong but accepted encodings, then a row count the width does not divide.
      [stream([128, 0, 255, 128, 128, 128, 0, 1]), 3],
      [stream([128, 128, 128, 128, 0, 128, 128, 128, 128, 128, 0, 255, 255, 255, 255, 0]), 3],
      [stream([1, 2, 3]), 2],
      [stream([1, 2, 3]), 0],
      [stream([1, 2, 3]), 1.5],
      [stream([1, 2, 3, 4]), -2],
    ];
    for (let trial = 0; trial < 1500; trial++) {
      const high = r() < 0.5;
      const bytes = Array.from({ length: integer(r, 0, 24) }, () =>
        high && r() < 0.8 ? integer(r, 128, 255) : integer(r, 0, 255),
      );
      streams.push([stream(bytes), integer(r, 1, 4)]);
    }
    for (const [text, width] of streams) {
      const cells = outcome(() => legacyReader(text, width).rows * width),
        total = 'value' in cells && Number.isFinite(cells.value) ? (cells.value as number) : 0;
      const takes = [1, 0, -1, 1.5, NaN, total + 1, Math.max(total - 2, 0), 1, 5, total];
      const trace = readTrace(reader, text, width, takes);
      expect(trace).toStrictEqual(readTrace(legacyReader, text, width, takes));
      for (const step of trace) if ('error' in step) seen.add(step.error);
    }
    for (const id of [
      'copy.packing.2ca992465a',
      'copy.packing.0e84000039',
      'copy.packing.7b93217a0a',
      'copy.packing.cbfdbb8ee5',
      'copy.packing.ff69a7bc0c',
      'copy.packing.0d1fed513f',
      'copy.packing.a78da0c20b',
    ] as const)
      expect(seen).toContain(`Error: ${sourceMessage(id)}`);
  });
});
