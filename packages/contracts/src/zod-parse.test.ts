import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { careerWorld } from '../../engine/src/career.testkit';
import { SaveCompatibilityError } from './versions';
import { worldSchema, zodParse } from './schema';

/** A value with its key order, explicit undefined and −0 spelled out, for exact comparison. */
const spelled = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(spelled)
    : typeof value === 'object' && value !== null
      ? Object.entries(value).map(([key, v]) => [key, spelled(v)])
      : Object.is(value, -0)
        ? '-0'
        : value === undefined
          ? '(undefined)'
          : value;

const count = z.number().int().min(0).max(99);
const sample = z
  .object({
    id: z.string().min(1).max(10),
    name: z.string().trim().max(10).optional(),
    counts: z.array(count).length(3),
    attrs: z.strictObject({ pace: count, stamina: count.optional() }),
    positions: z.partialRecord(z.enum(['GK', 'ST']), z.literal([1, 2, 3])),
    byYear: z.record(z.number().int(), z.string()).optional(),
    pair: z.tuple([count, z.string()]).optional(),
    step: z.union([z.literal(1), z.literal(1.5)]).optional(),
    policy: z
      .object({ level: count, retired: count.optional() })
      .transform(({ retired, ...kept }) => (void retired, kept))
      .optional(),
    format: z
      .preprocess((value) => {
        if (value === 'future') throw new SaveCompatibilityError();
        return value === 'old' ? undefined : value;
      }, z.literal('now').optional())
      .optional(),
    note: z.string().optional(),
  })
  .refine((v) => v.counts[0] <= v.attrs.pace);

const valid = {
  extra: 'stripped',
  note: undefined,
  attrs: { stamina: 4, pace: 7 },
  counts: [0, -0, 7],
  id: 'p1',
  name: '  Kim ',
  positions: { ST: 3, GK: 1 },
  byYear: { 1931: 'a', 1930: 'b' },
  pair: [1, 'x'],
  step: 1.5,
  policy: { retired: 2, level: 3 },
  format: 'old',
};
const variants: [string, unknown][] = [
  ['a strict object with an unknown key', { ...valid, attrs: { pace: 7, speed: 1 } }],
  ['a missing required key', { ...valid, id: undefined }],
  ['a number out of range', { ...valid, counts: [0, 100, 7] }],
  ['a fractional count', { ...valid, counts: [0, 1.5, 7] }],
  ['an array of the wrong length', { ...valid, counts: [0, 7] }],
  ['a record key outside its enum', { ...valid, positions: { CB: 3 } }],
  ['a record key that is no number', { ...valid, byYear: { first: 'a' } }],
  ['a short tuple', { ...valid, pair: [1] }],
  ['a union none of whose options match', { ...valid, step: 2 }],
  ['a failed refinement', { ...valid, counts: [9, 0, 0] }],
  ['a string where an object belongs', { ...valid, attrs: 'fast' }],
  ['an array where an object belongs', { ...valid, policy: [] }],
  ['NaN', { ...valid, counts: [0, NaN, 7] }],
];

describe('zodParse', () => {
  it("returns Zod's own output for an accepted value, key order and absences included", () => {
    const expected = sample.parse(valid);
    const zod = vi.spyOn(sample, 'parse');
    // 7 repeats within a parse; a second parse starts again from nothing accepted.
    for (let i = 0; i < 2; i++) expect(spelled(zodParse(sample, valid))).toEqual(spelled(expected));
    expect(Object.is(zodParse(sample, valid).counts[1], -0)).toBe(true);
    expect(zod).not.toHaveBeenCalled();
    zod.mockRestore();
  });

  it.each(variants)("rejects %s with Zod's own error", (_, input) => {
    zodParse(sample, valid);
    const zod = sample.safeParse(input);
    expect(zod.success).toBe(false);
    expect(() => zodParse(sample, input)).toThrow(z.ZodError);
    try {
      zodParse(sample, input);
    } catch (error) {
      expect((error as z.ZodError).issues).toEqual(zod.error!.issues);
    }
  });

  it("passes a preprocessor's own error through", () => {
    expect(() => zodParse(sample, { ...valid, format: 'future' })).toThrow(SaveCompatibilityError);
  });

  it("keeps a whole world as Zod's parse gives it", () => {
    const world = careerWorld({ seed: 'zod-parse-parity' });
    const expected = spelled(worldSchema.parse(world));
    const zod = vi.spyOn(worldSchema, 'parse');
    expect(spelled(zodParse(worldSchema, world))).toEqual(expected);
    expect(zod).not.toHaveBeenCalled();
    zod.mockRestore();
  });
});
