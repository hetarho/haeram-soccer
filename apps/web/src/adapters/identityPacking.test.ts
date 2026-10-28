import { describe, expect, it } from 'vitest';
import { canonical } from '../../../../packages/contracts/src/index';
import type { AppearanceSide, MatchAppearance } from '../../../../packages/contracts/src/identity';
import type { MatchRecord } from '../../../../packages/contracts/src/types';
import { isSaveCompatibilityError } from '../../../../packages/contracts/src/versions';
import { packAppearances, readAppearances } from './identityPacking';

/** Only the fields the stream reads; the codec rebuilds the rest from its columns. */
const record = (id: string, home: string, away: string, appearance?: MatchAppearance) =>
  ({ id, home, away, ...(appearance ? { appearance } : {}) }) as MatchRecord;
const side = (club: string, primary: string): AppearanceSide => ({
  club,
  crest: { shape: 'shield', pattern: 'stripes', emblem: 'star', primary },
  role: 'home',
  shirt: { pattern: 'stripes', primary, secondary: '#FfFfFf', trim: '#0b1f44' },
  goalkeeper: '#00ff99',
});
const look = (home: string, away: string, primary = '#C8102e'): MatchAppearance => ({
  version: 1,
  sides: [side(home, primary), side(away, '#0b1f44')],
  warnings: ['teams'],
});
/** A version-2 look: whole kits, the home keeper designed and the away keeper a fallback. */
const kitLook = (home: string, away: string): MatchAppearance => {
  const [first, second] = look(home, away).sides;
  return {
    version: 2,
    sides: [
      {
        ...first,
        goalkeeper: '#F5E663',
        shorts: '#0b1f44',
        socks: '#C8102e',
        keeper: {
          shirt: { pattern: 'hoops', primary: '#F5E663', secondary: '#121212' },
          shorts: '#121212',
          socks: '#F5E663',
          gloves: '#00a6c8',
        },
      },
      {
        ...second,
        shorts: '#FfFfFf',
        socks: '#0b1f44',
        keeper: {
          shirt: { pattern: 'plain', primary: '#00ff99' },
          shorts: '#00ff99',
          socks: '#00ff99',
          gloves: '#111111',
        },
        keeperFallback: true,
      },
    ],
    warnings: [],
  };
};
/** Five records: the same design twice, a different one, and two without an appearance. */
function matches() {
  return [
    record('m1', 'own', 'a', look('own', 'a')),
    record('m2', 'b', 'own'),
    record('m3', 'own', 'c', look('own', 'c', '#AbCdEf')),
    record('m4', 'own', 'a', look('own', 'a')),
    record('m5', 'own', 'd'),
  ];
}
/** The records as the codec rebuilds them: every field but the appearance. */
const rebuilt = (source: MatchRecord[]) =>
  source.map(({ appearance: _drop, ...rest }) => (void _drop, rest as MatchRecord));
const roundTrip = (source: MatchRecord[]) => {
  const target = rebuilt(source);
  readAppearances(JSON.parse(JSON.stringify(packAppearances(source))), target);
  return target;
};
const failure = (stream: unknown, target = rebuilt(matches())) => {
  try {
    readAppearances(stream, target);
  } catch (error) {
    return error;
  }
  throw new Error('accepted');
};

describe('appearance side channel (→SAVE-22, KIT-12)', () => {
  it('mixes absent and present snapshots in original match order', () => {
    const source = matches();
    expect(packAppearances(source)!.refs).toEqual([1, 0, 2, 1, 0]);
    const target = roundTrip(source);
    expect(canonical(target)).toBe(canonical(source));
    expect(target.map((m) => 'appearance' in m)).toEqual([true, false, true, true, false]);
    // Nothing to keep: no stream, and the records stay as they are.
    const plain = rebuilt(source);
    expect(packAppearances(plain)).toBeUndefined();
    readAppearances(undefined, plain);
    expect(plain.every((m) => !('appearance' in m))).toBe(true);
  });

  it('interns recurring designs', () => {
    const source = matches();
    // The same design written in another key order is one entry; literal spelling is kept.
    const reordered = look('own', 'a');
    source[3].appearance = { warnings: reordered.warnings, sides: reordered.sides, version: 1 };
    const packed = packAppearances(source)!;
    expect(packed.values).toHaveLength(2);
    expect(packed.values[1].sides[0].crest.primary).toBe('#AbCdEf');
    expect(canonical(roundTrip(source))).toBe(canonical(matches()));
  });

  it('expands independent copies', () => {
    const packed = JSON.parse(JSON.stringify(packAppearances(matches())));
    const target = rebuilt(matches());
    readAppearances(packed, target);
    expect(target[0].appearance).toEqual(target[3].appearance);
    expect(target[0].appearance).not.toBe(target[3].appearance);
    expect(packed.values).not.toContain(target[0].appearance);
    target[0].appearance!.sides[0].shirt.primary = '#000000';
    expect(target[3].appearance!.sides[0].shirt.primary).toBe('#C8102e');
    expect(packed.values[0].sides[0].shirt.primary).toBe('#C8102e');
  });

  it('refuses invalid metadata, refs, values and side IDs before attaching anything', () => {
    const good = () => JSON.parse(JSON.stringify(packAppearances(matches())));
    const variants: [string, (s: ReturnType<typeof good>) => unknown][] = [
      ['not an object', () => [1]],
      ['missing version', ({ version: _v, ...s }) => (void _v, s)],
      ['zero version', (s) => ({ ...s, version: 0 })],
      ['text version', (s) => ({ ...s, version: '1' })],
      ['values not a list', (s) => ({ ...s, values: {} })],
      [
        'more values than records',
        (s) => ({ ...s, values: [...s.values, ...s.values, ...s.values] }),
      ],
      ['oversized values', (s) => ({ ...s, values: Array(100001).fill(null) })],
      ['short refs', (s) => ({ ...s, refs: s.refs.slice(1) })],
      ['long refs', (s) => ({ ...s, refs: [...s.refs, 0] })],
      ['negative ref', (s) => ({ ...s, refs: [1, -1, 2, 1, 0] })],
      ['fractional ref', (s) => ({ ...s, refs: [1, 0.5, 2, 1, 0] })],
      ['out-of-range ref', (s) => ({ ...s, refs: [1, 0, 2, 3, 0] })],
      ['text ref', (s) => ({ ...s, refs: ['1', 0, 2, 1, 0] })],
      ['skipped first occurrence', (s) => ({ ...s, refs: [2, 0, 1, 2, 0] })],
      ['unused value', (s) => ({ ...s, refs: [1, 0, 1, 1, 0] })],
      ['duplicate value', (s) => ({ ...s, values: [s.values[0], s.values[0]] })],
      ['unknown field', (s) => ((s.values[0].sides[0].kit = 'x'), s)],
      ['invalid colour', (s) => ((s.values[1].sides[1].goalkeeper = 'red'), s)],
      ['unknown warning', (s) => ((s.values[0].warnings = ['mud']), s)],
      ['swapped side IDs', (s) => ((s.values[0].sides = [...s.values[0].sides].reverse()), s)],
    ];
    for (const [name, damage] of variants) {
      const target = rebuilt(matches());
      const error = failure(damage(good()), target);
      expect(error, name).toBeInstanceOf(Error);
      expect(isSaveCompatibilityError(error), name).toBe(false);
      expect(
        target.every((m) => !('appearance' in m)),
        name,
      ).toBe(true);
    }
  });

  it('round-trips version-1 and version-2 appearances', () => {
    const source = matches();
    source[2].appearance = kitLook('own', 'c');
    const packed = packAppearances(source)!;
    expect(packed.version).toBe(1);
    expect(packed.values.map((value) => value.version)).toEqual([1, 2]);
    const target = roundTrip(source);
    expect(canonical(target)).toBe(canonical(source));
    // Each snapshot keeps its recorded version: a version-1 one is never rewritten.
    expect(target.map((m) => m.appearance?.version)).toEqual([1, undefined, 2, 1, undefined]);
    expect('shorts' in target[0].appearance!.sides[0]).toBe(false);
    expect(target[2].appearance!.sides[1].keeperFallback).toBe(true);
    // A version-2 snapshot must carry the whole kits; a version-1 one must not.
    const damaged: [string, (s: ReturnType<typeof packAppearances>) => unknown][] = [
      ['v2 without keeper', (s) => (delete s!.values[1].sides[0].keeper, s)],
      ['v2 without socks', (s) => (delete s!.values[1].sides[1].socks, s)],
      ['v2 shirt-only sides', (s) => ((s!.values[1] = { ...s!.values[0], version: 2 }), s)],
      ['v1 with shorts', (s) => ((s!.values[0].sides[0].shorts = '#000000'), s)],
      ['keeper colour mismatch', (s) => ((s!.values[1].sides[0].goalkeeper = '#000000'), s)],
      ['false fallback', (s) => ((s!.values[1].sides[0].keeperFallback = false as never), s)],
    ];
    for (const [name, damage] of damaged) {
      const stream = JSON.parse(JSON.stringify(packAppearances(source)));
      const error = failure(damage(stream), rebuilt(source));
      expect(error, name).toBeInstanceOf(Error);
      expect(isSaveCompatibilityError(error), name).toBe(false);
    }
  });

  it('version 3 is a compatibility error', () => {
    const good = () => JSON.parse(JSON.stringify(packAppearances(matches())));
    const newer = good();
    newer.version = 2;
    // Damage elsewhere is not reported for a newer game.
    newer.refs = 'damaged';
    expect(isSaveCompatibilityError(failure(newer))).toBe(true);
    const value = good();
    value.values[1].version = 3;
    value.refs = [1, 0, 2, 9, 0];
    expect(isSaveCompatibilityError(failure(value))).toBe(true);
    // A snapshot marked 2 is a current one: without whole kits it is damage, not a newer game.
    const current = good();
    current.values[1].version = 2;
    expect(isSaveCompatibilityError(failure(current))).toBe(false);
  });
});
