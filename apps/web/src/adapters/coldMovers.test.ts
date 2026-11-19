import { describe, expect, it } from 'vitest';
import {
  attachRecordStore,
  type RecordChanges,
  type RecordStore,
} from '../../../../packages/contracts/src/record-store';
import type { PersonCareer, World } from '../../../../packages/contracts/src/types';
import { peopleOf, personOf, restorePerson } from '../../../../packages/engine/src/person-careers';
import { memoryRecordStore } from '../../../../tests/fixtures/node-sqlite';
import { moveColdPeople, saveMovingCold } from './coldMovers';
import { RowSaver } from './rowSaver';
import { rowsToWorld, worldFacts } from './worldRows';

const person = (id: string, extra: Partial<PersonCareer> = {}): PersonCareer => ({
  id,
  name: id,
  born: 1900,
  position: 'CM',
  professionalism: 3,
  qualities: { understanding: 3, teaching: 3, judgement: 3 },
  playing: 'retired',
  employment: [],
  mentors: [],
  ...extra,
});
/** A synthetic world of four people, two of them without a current role; not playable. */
function tinyWorld() {
  return {
    engine: '0.9.0',
    catalog: 'test-catalog',
    catalogHash: 'h1',
    id: 'world-1',
    revision: 1,
    year: 1960,
    playerClub: 'c1',
    manager: { id: 'm', person: 'kept' },
    people: {
      gone1: person('gone1'),
      active: person('active', { playing: 'active', club: 'c1' }),
      gone2: person('gone2'),
      kept: person('kept'),
    },
  } as unknown as World;
}
/** A store whose writes fail while `fail.now` holds. */
function failingStore(fail: { now: boolean }) {
  const inner = memoryRecordStore();
  const store: RecordStore = {
    ...inner,
    write(changes: RecordChanges) {
      if (fail.now) throw new Error('quota');
      inner.write(changes);
    },
  };
  return store;
}

describe('people leave memory at a save (→SAVE-32)', () => {
  it('writes them cold in the one save, then drops them from memory in order', () => {
    const w = tinyWorld();
    const store = memoryRecordStore();
    attachRecordStore(w, store);
    const saver = new RowSaver(store);
    saver.save(w);
    const complete = worldFacts(w);
    let writes = 0;
    const counted: RecordStore = {
      ...store,
      write: (changes) => {
        writes++;
        store.write(changes);
      },
    };
    const counting = new RowSaver(counted);
    counting.prime(rowsToWorld(store, { includeCold: false }));
    expect(peopleOf(w)).toHaveLength(4);
    expect(saveMovingCold(w, counting)).toMatchObject({ written: 2, deleted: 0 });
    expect(writes).toBe(1);
    expect(Object.keys(w.people!)).toEqual(['active', 'kept']);
    expect(peopleOf(w).map((p) => p.id)).toEqual(['active', 'kept']);
    expect(store.get('person', 'gone1')?.cold).toBe(true);
    expect(store.get('person', 'gone2')?.cold).toBe(true);
    expect(personOf(w, 'gone2')).toEqual(person('gone2'));
    expect(worldFacts(w)).toBe(complete);
    // Opening the game reads only what memory held.
    expect(Object.keys(rowsToWorld(store, { includeCold: false }).people!)).toEqual([
      'active',
      'kept',
    ]);
    // Nothing more to move: a later save writes nothing.
    expect(saveMovingCold(w, counting)).toMatchObject({ written: 0, deleted: 0 });
  });

  it('removes nothing when the write fails, and the marks do not outlive it', () => {
    const fail = { now: false };
    const store = failingStore(fail);
    const w = attachRecordStore(tinyWorld(), store);
    const saver = new RowSaver(store);
    saver.save(w);
    fail.now = true;
    expect(() => saveMovingCold(w, saver)).toThrow('quota');
    expect(Object.keys(w.people!)).toEqual(['gone1', 'active', 'gone2', 'kept']);
    expect(store.get('person', 'gone1')?.cold).toBe(false);
    // Hired meanwhile, he is current again: a plain save keeps his row current.
    fail.now = false;
    w.people!['gone1']!.playing = 'released';
    w.revision++;
    saver.save(w);
    expect(store.get('person', 'gone1')?.cold).toBe(false);
  });

  it('marks nothing for a world whose people all hold a current role', () => {
    const w = tinyWorld();
    delete w.people!['gone1'];
    delete w.people!['gone2'];
    const marked: string[] = [];
    const after = moveColdPeople(w, { markCold: (_table, keys) => marked.push(...keys) });
    after();
    expect(marked).toEqual([]);
    expect(Object.keys(w.people!)).toEqual(['active', 'kept']);
  });

  it('saves a restored person back in his place, rewriting no one after him', () => {
    const w = tinyWorld();
    const store = memoryRecordStore();
    attachRecordStore(w, store);
    const saver = new RowSaver(store);
    saveMovingCold(w, saver);
    const seqs = () =>
      Object.fromEntries(
        store.rows('person').map((stored) => [stored.key, [stored.seq, stored.cold]]),
      );
    const before = seqs();
    // A write on a cold person brings him back first, at his stored place.
    restorePerson(w, 'gone2')!.playing = 'released';
    expect(Object.keys(w.people!)).toEqual(['active', 'gone2', 'kept']);
    expect(saver.save(w)).toMatchObject({ written: 1, deleted: 0 });
    expect(seqs()).toEqual({ ...before, gone2: [before['gone2']![0], false] });
  });
});
