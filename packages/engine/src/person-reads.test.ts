import { describe, expect, it } from 'vitest';
import { attachRecordStore, cloneWorld, type StoredRow } from '../../contracts/src/record-store';
import type { PersonCareer, World } from '../../contracts/src/types';
import { memoryRecordStore } from '../../../tests/fixtures/node-sqlite';
import { forgetColdPerson, hasPerson, personIdsWithPrefix, personOf } from './person-careers';

const person = (id: string, name = id): PersonCareer => ({
  id,
  name,
  born: 1950,
  position: 'CM',
  professionalism: 3,
  qualities: { understanding: 3, teaching: 3, judgement: 3 },
  playing: 'retired',
  employment: [],
  mentors: [],
});
const row = (p: PersonCareer, seq: number, cold: boolean): StoredRow => ({
  table: 'person',
  key: p.id,
  seq,
  cold,
  data: JSON.stringify(p),
});
/** A world holding `held` in memory, its store holding `stored` rows as given. */
function world(held: PersonCareer[], stored: StoredRow[]) {
  const w = { people: Object.fromEntries(held.map((p) => [p.id, p])) } as unknown as World;
  const store = memoryRecordStore();
  store.write({ put: stored, delete: [] });
  return attachRecordStore(w, store);
}

describe('person reads through the record store (→SAVE-32, →ARCH-36)', () => {
  const a = person('c1:y:1960:0'),
    b = person('c1:y:1960:1'),
    other = person('c2:y:1960:0');

  it('answers alike whether a person is in memory or only a cold row', () => {
    const memory = world([a, b, other], []),
      cold = world([a], [row(a, 0, false), row(b, 1, true), row(other, 2, true)]);
    for (const w of [memory, cold]) {
      expect(personOf(w, b.id)).toEqual(b);
      expect(hasPerson(w, b.id)).toBe(true);
      expect(personOf(w, 'nobody')).toBeUndefined();
      expect(hasPerson(w, 'nobody')).toBe(false);
      expect([...personIdsWithPrefix(w, 'c1:y:1960:')].sort()).toEqual([a.id, b.id]);
    }
    // Memory comes first, and the cold parse is kept per world.
    expect(personOf(cold, a.id)).toBe(a);
    expect(personOf(cold, b.id)).toBe(personOf(cold, b.id));
  });

  it('reads no store row memory still holds or has dropped: only cold rows stand for a person', () => {
    const w = world([], [row(a, 0, false)]);
    expect(personOf(w, a.id)).toBeUndefined();
    expect(hasPerson(w, a.id)).toBe(false);
    expect(personIdsWithPrefix(w, 'c1:')).toEqual(new Set());
  });

  it('reads memory alone without a store, and a clone keeps its store', () => {
    const bare = { people: { [a.id]: a } } as unknown as World;
    expect(personOf(bare, a.id)).toBe(a);
    expect(hasPerson(bare, b.id)).toBe(false);
    const w = world([a], [row(b, 1, true)]),
      copy = cloneWorld(w);
    expect(personOf(copy, b.id)).toEqual(b);
    expect([...personIdsWithPrefix(copy, 'c1:')].sort()).toEqual([a.id, b.id]);
  });

  it('drops a parse once the person is restored to memory', () => {
    const w = world([], [row(b, 1, true)]),
      parsed = personOf(w, b.id)!,
      restored = { ...b, name: 'Restored' };
    w.people![b.id] = restored;
    forgetColdPerson(w, b.id);
    expect(personOf(w, b.id)).toBe(restored);
    delete w.people![b.id];
    expect(personOf(w, b.id)).not.toBe(parsed);
    expect(personOf(w, b.id)).toEqual(b);
  });
});
