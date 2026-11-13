import { describe, expect, it } from 'vitest';
import type { World } from '../../../../packages/contracts/src/types';
import { validateWorld } from '../../../../packages/contracts/src/schema';
import { worldMarketFixture } from '../../../../packages/engine/src/world-market.testkit';
import { pack, unpack } from './packing';
import { packPlayerRecords, unpackPlayerRecords } from './playerRecordPacking';

const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const records: NonNullable<World['playerRecords']> = {
  one: { moves: [
    { year: 1950, day: 0, from: 'own', to: 'foreign', fee: '90071992547409931234567890' },
    { year: 1950, day: 153, from: 'foreign', to: 'own', fee: '1', loan: false },
  ] },
  empty: { moves: [] },
  loaned: {
    moves: [{ year: 1950, day: 3, from: 'own', to: 'foreign', fee: '20', loan: true }],
    loan: { club: 'own', until: 1951, wage: '9007199254740993', contractUntil: 1954, year: 1950, graduate: true, joined: 1948 },
  },
};

describe('lossless player move columns on a tiny fixture', () => {
  it('retains exact fees, order, empty records, optional booleans and parent terms', () => {
    const packed = plain(packPlayerRecords(records));
    expect(packed.clubs).toEqual(['own', 'foreign']);
    expect(unpackPlayerRecords(packed)).toEqual(records);
    expect(Object.keys(unpackPlayerRecords(packed))).toEqual(Object.keys(records));
    expect(unpackPlayerRecords(plain(packPlayerRecords({})))).toEqual({});
  });
  it('uses the actual world packer, accepts old inline records and rejects ambiguous copies', () => {
    const w = worldMarketFixture();
    w.playerRecords = records;
    w.npcMarketAt = { year: w.year, day: 3 };
    const p = plain(pack(w));
    expect(p.world).not.toHaveProperty('playerRecords');
    expect(unpack(p).playerRecords).toEqual(records);
    expect(unpack(p).npcMarketAt).toEqual(w.npcMarketAt);
    p.world.playerRecords = records;
    expect(() => unpack(p)).toThrow();
    delete p.playerRecords;
    expect(unpack(p).playerRecords).toEqual(records);
    delete p.world.playerRecords;
    expect(unpack(p)).not.toHaveProperty('playerRecords');
  });
  it('survives the canonical schema parse rather than silently losing the new field', () => {
    const w = worldMarketFixture();
    // The boundary requires ten clubs; this supplies only synthetic rows, no generated world.
    w.catalogHash = '0'.repeat(64);
    w.clubs.push(...Array.from({ length: 7 }, (_, i) => ({ ...w.clubs[1]!, id: `synthetic:${i}` })));
    w.playerRecords = { one: { moves: records.one!.moves.slice(0, 1) } };
    w.npcMarketAt = { year: w.year, day: 3 };
    expect(validateWorld(plain(w)).playerRecords).toEqual(w.playerRecords);
    expect(validateWorld(plain(w)).npcMarketAt).toEqual(w.npcMarketAt);
    w.playerRecords!.one!.moves.push({ year: w.year, day: 3, from: 'foreign', to: 'own', fee: '0' });
    expect(validateWorld(plain(w)).playerRecords).toEqual(w.playerRecords);
    const invalid = plain(w);
    invalid.playerRecords!.one!.moves[0]!.fee = '-1';
    expect(() => validateWorld(invalid)).toThrow();
    const unknownClub = plain(w);
    unknownClub.playerRecords!.one!.moves[1]!.from = 'missing';
    expect(() => validateWorld(unknownClub)).toThrow();
    const reversed = plain(w);
    reversed.playerRecords!.one!.moves.reverse();
    expect(() => validateWorld(reversed)).toThrow();
  });
  it('rejects corrupt counts, dictionaries, fees, date rows and duplicated loans', () => {
    const valid = plain(packPlayerRecords(records));
    for (const mutate of [
      (p: typeof valid) => { p.counts[0] = 999; },
      (p: typeof valid) => { p.ids[1] = p.ids[0]!; },
      (p: typeof valid) => { p.moves[0]![2] = -1; },
      (p: typeof valid) => { p.moves[0]![4] = '-2'; },
      (p: typeof valid) => { p.moves[0]![1] = 999; },
      (p: typeof valid) => { p.moves[0]![5] = 3 as 1; },
      (p: typeof valid) => { p.loans.push(p.loans[0]!); },
    ]) {
      const p = plain(valid);
      mutate(p);
      expect(() => unpackPlayerRecords(p)).toThrow();
    }
  });
});
