import { describe, expect, it } from 'vitest';
import type { Club, PersonCareer, Player, World } from '../../contracts/src/types';
import { fixtureRosterKey, readCopy } from './fixture-copy';
import { continuousSquad } from './npc-continuity';
import { npcSquad } from './world';

const club = { id: 'ENG:test', country: 'ENG', strength: 60, tier: 1 } as Club;
const retained = (p: Player): PersonCareer => ({
  id: p.id,
  name: p.name,
  born: p.born,
  position: p.position,
  professionalism: p.personality.professionalism,
  qualities: p.qualities!,
  playing: 'active',
  club: club.id,
  employment: [],
  mentors: [],
});

describe('fixture roster read copy', () => {
  it('keeps active identities and every reserved ID without copying lifetime career data', () => {
    const raw = npcSquad('read-copy', 2000, club),
      active = { ...retained(raw[0]), name: 'Retained native', origin: { club: club.id, slot: 0 } },
      retired = { ...retained(raw[1]), playing: 'retired' as const },
      reserved = {
        ...retained(raw[2]),
        id: `${club.id}:vacancy:1:2000`,
        playing: 'released' as const,
      },
      w = {
        seed: 'read-copy',
        year: 2000,
        playerClub: 'own',
        clubs: [club],
        people: Object.fromEntries([active, retired, reserved].map((p) => [p.id, p])),
      } as unknown as World;
    Object.defineProperty(retired, 'employment', {
      enumerable: true,
      get() {
        throw new Error('A fixture must not read an inactive career');
      },
    });
    const expected = continuousSquad(w, club),
      copy = readCopy(w),
      remote = JSON.parse(JSON.stringify(copy)) as World;
    expect(continuousSquad(remote, club)).toEqual(expected);
    expect(remote.people![retired.id]).toEqual({ id: retired.id, playing: 'retired' });
    expect(remote.people![reserved.id]).toEqual({ id: reserved.id, playing: 'released' });
    expect(remote.people![active.id]).not.toHaveProperty('employment');
    expect(remote.people![active.id]).not.toHaveProperty('mentors');
    expect(expected[1].id).toBe(`${club.id}:vacancy:1:2000:1`);
    expect(w.people![retired.id]).toBe(retired);
    expect(w.people![active.id]).toBe(active);
  });

  it('tracks retirement, active identity changes, registry replacement and prototype-like IDs', () => {
    const p = retained(npcSquad('read-copy', 2000, club)[0]),
      w = {
        seed: 'read-copy',
        year: 2000,
        playerClub: 'own',
        clubs: [club],
        people: { [p.id]: p },
      } as unknown as World,
      first = readCopy(w),
      firstKey = fixtureRosterKey(first);
    p.name = 'Changed identity';
    expect(fixtureRosterKey(readCopy(w))).not.toBe(firstKey);
    expect(first.people![p.id].name).not.toBe(p.name);
    p.playing = 'retired';
    const retired = readCopy(w),
      retiredKey = fixtureRosterKey(retired);
    p.name = 'Irrelevant to the now retired slot';
    expect(fixtureRosterKey(readCopy(w))).toBe(retiredKey);
    expect(retired.people![p.id]).not.toHaveProperty('name');
    w.people = Object.fromEntries([['__proto__', { ...p, id: '__proto__' }]]);
    const replacement = readCopy(w);
    expect(Object.keys(replacement.people!)).toEqual(['__proto__']);
    expect(Object.getPrototypeOf(replacement.people)).toBe(Object.prototype);
    expect(replacement.people!.__proto__).toEqual({ id: '__proto__', playing: 'retired' });
    delete w.people;
    expect(readCopy(w)).not.toHaveProperty('people');
  });
});
