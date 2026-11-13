import { describe, expect, it } from 'vitest';
import type { Club, Fixture, MatchRecord, PersonCareer, Player, World } from '../../contracts/src/types';
import { fixtureRosterKey, readCopy } from './fixture-copy';
import { continuousSquad } from './npc-continuity';
import { npcSquad, squad, squadPlaceAge, startingSquad } from './world';
import { worldMarketFixture } from './world-market.testkit';
import { foundSquads } from './persisted-squads';
import { recordNpcInjury } from './discipline';
import { jobPlayback } from './round-jobs';

const club = { id: 'ENG:test', country: 'ENG', strength: 60, tier: 1 } as Club;
/**
 * The refill of generated place `slot` in 2000. Keyed on the place's cohort, not the year (T807,
 * →WORLD-6), so the man who fills a sold player's place stays one person through the cohort.
 */
const vacancy = (slot: number) =>
  `${club.id}:vacancy:${slot}:${squadPlaceAge('read-copy', club.id, 2000, slot).cohort}`;
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
  it('keeps every persisted player and resolves a helper replacement from outside the eighteen', () => {
    const w = worldMarketFixture();
    w.clubs[2]!.representative = true;
    foundSquads(w);
    const c = w.clubs[1]!,
      selected = squad(w, c),
      f = {
        id: 'fixture',
        home: c.id,
        away: w.clubs[2]!.id,
        kind: 'league',
        year: w.year,
      } as Fixture;
    for (const p of [selected[0]!, ...selected.slice(11)]) recordNpcInjury(w, p.id, c.id, 30);
    const expected = startingSquad(w, c, f);
    expect(selected).not.toContain(expected[0]);
    const remote = JSON.parse(JSON.stringify(readCopy(w))) as World;
    expect(remote.squads).toEqual(w.squads);
    expect(startingSquad(remote, c, f)).toEqual(expected);
    const result = {
      record: { id: f.id, home: f.home, away: f.away } as MatchRecord,
      squads: [expected.map((p) => p.id), squad(w, w.clubs[2]!).map((p) => p.id)] as [
        string[],
        string[],
      ],
    };
    expect(jobPlayback(w, { fixture: f }, result)?.squads[0]).toEqual(expected);
  });
  it('keeps active identities and every reserved ID without copying lifetime career data', () => {
    const raw = npcSquad('read-copy', 2000, club),
      active = { ...retained(raw[0]), name: 'Retained native', origin: { club: club.id, slot: 0 } },
      retired = { ...retained(raw[1]), playing: 'retired' as const },
      reserved = {
        ...retained(raw[2]),
        id: vacancy(1),
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
    expect(expected[1].id).toBe(`${vacancy(1)}:1`);
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

  it("ships only the free agents' IDs, which keep their old places empty (→CLUB-49)", () => {
    const raw = npcSquad('read-copy', 2000, club),
      w = {
        seed: 'read-copy',
        year: 2000,
        playerClub: 'own',
        clubs: [club],
        freeAgents: [{ ...raw[3], freeSince: 2000 }],
      } as unknown as World,
      expected = continuousSquad(w, club),
      copy = readCopy(w),
      remote = JSON.parse(JSON.stringify(copy)) as World;
    expect(copy.freeAgents).toEqual([{ id: raw[3].id }]);
    expect(expected.some((p) => p.id === raw[3].id)).toBe(false);
    expect(expected[3].id).toBe(vacancy(3));
    expect(continuousSquad(remote, club)).toEqual(expected);
    const key = fixtureRosterKey(copy);
    w.freeAgents = [];
    expect(fixtureRosterKey(readCopy(w))).not.toBe(key);
  });

  it("carries the season's sales, so a helper refills a sold place below strength as well", () => {
    const raw = npcSquad('read-copy', 2000, club),
      sale = { year: 2000, day: 40 },
      sold: PersonCareer = {
        ...retained(raw[5]),
        club: 'own',
        employment: [
          { role: 'player', club: club.id, from: sale, to: sale },
          { role: 'player', club: 'own', from: sale },
        ],
      },
      w = {
        seed: 'read-copy',
        year: 2000,
        playerClub: 'own',
        clubs: [club],
        people: { [sold.id]: sold },
      } as unknown as World,
      expected = continuousSquad(w, club),
      copy = readCopy(w),
      remote = JSON.parse(JSON.stringify(copy)) as World;
    expect(expected[5].id).toBe(vacancy(5));
    expect(remote.people![sold.id].employment).toEqual(sold.employment);
    expect(continuousSquad(remote, club)).toEqual(expected);
    // The next season the copy carries none of it, and the refill plays at strength again.
    const next = { ...w, year: 2001 },
      later = readCopy(next);
    expect(later.people![sold.id]).not.toHaveProperty('employment');
    expect(fixtureRosterKey(later)).not.toBe(fixtureRosterKey(copy));
    expect(continuousSquad(JSON.parse(JSON.stringify(later)) as World, club)).toEqual(
      continuousSquad(next, club),
    );
  });
});
