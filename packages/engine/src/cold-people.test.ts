import { describe, expect, it } from 'vitest';
import { attachRecordStore, type StoredRow } from '../../contracts/src/record-store';
import type { PersonCareer, World } from '../../contracts/src/types';
import { memoryRecordStore } from '../../../tests/fixtures/node-sqlite';
import {
  closeEmployment,
  hasCurrentRole,
  openEmployment,
  peopleOf,
  personOf,
  playingFor,
  referencedPeople,
  releasePeople,
  restorePerson,
} from './person-careers';

/** A retired person with nothing current about him; tests give him what they check. */
const retiree = (id: string, extra: Partial<PersonCareer> = {}): PersonCareer => ({
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
const row = (p: PersonCareer, seq: number, cold: boolean): StoredRow => ({
  table: 'person',
  key: p.id,
  seq,
  cold,
  data: JSON.stringify(p),
});
/** A synthetic world of one club in 1960; not a playable world. */
function world(people: PersonCareer[] = []): World {
  return {
    year: 1960,
    round: 2,
    calendar: { day: 20 },
    playerClub: 'own',
    clubs: [{ id: 'own' }, { id: 'c1' }],
    manager: { id: 'mgr', person: 'mgr-person' },
    staff: [{ id: 's1', role: 'assistant', person: 'staff-person' }],
    staffMarket: { free: { attack: [{ id: 'free-1', person: 'free-person' }] } },
    playingCoachProposals: { 'proposal-person': { person: 'proposal-person' } },
    people: Object.fromEntries(people.map((p) => [p.id, p])),
  } as unknown as World;
}
const at = { year: 1950, day: 0 };

describe('who holds a current role (→SAVE-32)', () => {
  const w = world();
  const current = (p: PersonCareer) => hasCurrentRole(w, p);

  it('holds for anyone still in play, at work or named by a current post or offer', () => {
    expect(current(retiree('a'))).toBe(false);
    expect(current(retiree('a', { playing: 'released' }))).toBe(true);
    expect(current(retiree('a', { playing: 'active' }))).toBe(true);
    expect(
      current(retiree('a', { employment: [{ role: 'assistant', club: 'c1', from: at }] })),
    ).toBe(true);
    expect(
      current(retiree('a', { employment: [{ role: 'assistant', club: 'c1', from: at, to: at }] })),
    ).toBe(false);
    const mentor = { manager: 'm', name: 'M', club: 'c1', from: at };
    expect(current(retiree('a', { mentors: [mentor] }))).toBe(true);
    expect(current(retiree('a', { mentors: [{ ...mentor, to: at }] }))).toBe(false);
    expect(current(retiree('a', { coaching: {} as PersonCareer['coaching'] }))).toBe(true);
    expect(current(retiree('a', { loan: { until: 1950 } }))).toBe(true);
    for (const id of ['mgr-person', 'staff-person', 'free-person', 'proposal-person'])
      expect(current(retiree(id))).toBe(true);
    expect(referencedPeople(w)).toEqual(
      new Set(['mgr-person', 'staff-person', 'free-person', 'proposal-person']),
    );
  });

  it('holds a manager profile only below 70', () => {
    const management = {} as PersonCareer['management'];
    expect(current(retiree('a', { born: 1891, management }))).toBe(true);
    expect(current(retiree('a', { born: 1890, management }))).toBe(false);
  });
});

describe('restoring a cold person for a write (→SAVE-32)', () => {
  const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((id) => retiree(id));

  /** Memory holds a, c and d (d not saved yet); b is a cold row between a and c. */
  function split() {
    const w = world([a, c, d].map((p) => structuredClone(p)));
    const store = memoryRecordStore();
    store.write({ put: [row(a, 0, false), row(b, 1, true), row(c, 2, false)], delete: [] });
    return attachRecordStore(w, store);
  }

  it('puts him back at his stored place among those memory holds', () => {
    const w = split();
    expect(peopleOf(w).map((p) => p.id)).toEqual(['a', 'c', 'd']);
    const restored = restorePerson(w, 'b')!;
    expect(restored).toEqual(b);
    expect(Object.keys(w.people!)).toEqual(['a', 'b', 'c', 'd']);
    expect(peopleOf(w).map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(personOf(w, 'b')).toBe(restored);
    expect(restorePerson(w, 'b')).toBe(restored);
    expect(restorePerson(w, 'nobody')).toBeUndefined();
  });

  it('hires a cold person: the job lands on him in memory', () => {
    const w = split();
    openEmployment(w, 'b', 'player', 'c1');
    expect(w.people!['b']).toMatchObject({ playing: 'active', club: 'c1' });
    expect(Object.keys(w.people!)).toEqual(['a', 'b', 'c', 'd']);
    expect(playingFor(w, 'c1').map((p) => p.id)).toEqual(['b']);
    expect(hasCurrentRole(w, w.people!['b']!)).toBe(true);
    // Closing a cold person's job restores him too, and finds nothing open.
    const other = split();
    closeEmployment(other, 'b', 'player');
    expect(other.people!['b']).toEqual(b);
  });

  it('releases people from memory, keeping everyone else in order', () => {
    const w = split();
    expect(peopleOf(w)).toHaveLength(3);
    releasePeople(w, ['c']);
    expect(Object.keys(w.people!)).toEqual(['a', 'd']);
    expect(peopleOf(w).map((p) => p.id)).toEqual(['a', 'd']);
  });
});
