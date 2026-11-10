import { describe, expect, it } from 'vitest';
import { COUNTRIES } from '../../catalogs/src/index';
import type { Club, PersonCareer, Player, World } from '../../contracts/src/types';
import { continuousSquad } from './npc-continuity';
import {
  ageLadder,
  makePlayer,
  npcSquad,
  personName,
  SQUAD_AGES,
  squadPlaceAge,
  SURNAME_STRIDE,
  TACTICS,
} from './world';
import { lineOf } from './player';
import { random } from './primitives';

const surnameOf = (name: string) => name.slice(name.indexOf(' ') + 1);
const clubs = (code: string, count: number) =>
  Array.from(
    { length: count },
    (_, k) => ({ id: `${code}:${k}`, country: code, strength: 60, tier: k % 4 }) as Club,
  );

describe('person names (→WORLD-12)', () => {
  it('draws a name with two values of the stream', () => {
    for (const surname of [undefined, 0, 12_345]) {
      let draws = 0;
      const stream = random('names:count');
      personName('POR', () => (draws++, stream()), surname);
      expect(draws).toBe(2);
    }
    const free = makePlayer('ESP', 'seed', 'p:1', 1950, 60, 'CM', 24, 1);
    const placed = makePlayer('ESP', 'seed', 'p:1', 1950, 60, 'CM', 24, 1, undefined, 7);
    expect({ ...placed, name: free.name }).toEqual(free);
    expect(surnameOf(placed.name)).toBe(COUNTRIES.find((c) => c.code === 'ESP')!.family[7]);
  });

  it('keeps a generated NPC squad’s surnames distinct and stable', () => {
    for (const c of COUNTRIES) expect(c.family.length % SURNAME_STRIDE).not.toBe(0);
    for (const country of COUNTRIES)
      for (const club of clubs(country.code, 6)) {
        let last = new Map<string, string>();
        for (let year = 1950; year < 1972; year++) {
          const squad = npcSquad('names', year, club);
          expect(new Set(squad.map((p) => surnameOf(p.name))).size).toBe(squad.length);
          for (const p of squad) if (last.has(p.id)) expect(p.name).toBe(last.get(p.id));
          last = new Map(squad.map((p) => [p.id, p.name]));
        }
      }
  });

  it('makes repeated full names rare across a world', () => {
    for (const country of COUNTRIES) {
      const names = clubs(country.code, 90).flatMap((club) =>
        npcSquad('names', 1950, club).map((p) => p.name),
      );
      expect(new Set(names).size / names.length).toBeGreaterThanOrEqual(0.9);
    }
  });
});

describe("each club's own age ladder (→WORLD-6)", () => {
  const ages = (squad: readonly Player[], year: number) => squad.map((p) => year - p.born);
  const LADDER = Array.from({ length: SQUAD_AGES }, (_, k) => 18 + k);

  it('draws a start and an order of the 18 places from the seed and the club', () => {
    const ladder = ageLadder('ladder', 'ENG:0:0:3');
    expect(ladder).toEqual(ageLadder('ladder', 'ENG:0:0:3'));
    expect(ladder.start).toBeGreaterThanOrEqual(0);
    expect(ladder.start).toBeLessThan(SQUAD_AGES);
    expect([...ladder.order].sort((a, b) => a - b)).toEqual(LADDER.map((age) => age - 18));
    expect(ageLadder('ladder', 'ENG:0:0:4')).not.toEqual(ladder);
    expect(ageLadder('other seed', 'ENG:0:0:3')).not.toEqual(ladder);
  });

  it('gives clubs of one tactic different ages in the same places', () => {
    for (const style of TACTICS) {
      const squads = clubs('ENG', 20).map((club) => npcSquad('ladder', 2000, club, style));
      // The old shared ladder stood every club's place i at one age in a season.
      for (let i = 0; i < SQUAD_AGES; i++)
        expect(new Set(squads.map((s) => 2000 - s[i]!.born)).size).toBeGreaterThanOrEqual(6);
    }
  });

  it('keeps one player of each age from 18 to 35 in every squad', () => {
    for (const style of TACTICS)
      for (const club of clubs('GER', 8))
        for (const year of [1930, 1946, 1977, 2000, 2025]) {
          const squad = npcSquad('ladder', year, club, style);
          expect(ages(squad, year).sort((a, b) => a - b)).toEqual(LADDER);
          squad.forEach((p, i) => {
            const place = squadPlaceAge('ladder', club.id, year, i);
            expect(year - p.born).toBe(place.age);
            expect(p.id).toBe(`${club.id}:p:${i}:${place.cohort}`);
          });
        }
  });

  it("holds one person in a place through his cohort's 18 seasons, a year older each", () => {
    const club = clubs('ITA', 3)[2]!,
      seen = new Map<string, { name: string; born: number; first: number; age: number }>(),
      seasons = new Map<string, number>();
    for (let year = 1950; year < 1950 + 3 * SQUAD_AGES; year++)
      npcSquad('ladder', year, club, 'counter').forEach((p) => {
        const before = seen.get(p.id);
        if (before) {
          expect({ name: p.name, born: p.born }).toEqual({ name: before.name, born: before.born });
          expect(year - p.born).toBe(before.age + year - before.first);
        } else seen.set(p.id, { name: p.name, born: p.born, first: year, age: year - p.born });
        seasons.set(p.id, (seasons.get(p.id) ?? 0) + 1);
      });
    // Every person who arrived at 18 and left at 35 inside the window stood there 18 seasons.
    const whole = [...seen].filter(
      ([, p]) => p.age === 18 && p.first + SQUAD_AGES <= 1950 + 3 * SQUAD_AGES,
    );
    expect(whole.length).toBeGreaterThanOrEqual(SQUAD_AGES);
    for (const [id] of whole) expect(seasons.get(id)).toBe(SQUAD_AGES);
  });

  it('draws the same squad from the same seed, club and year', () => {
    const club = clubs('NED', 2)[1]!;
    expect(npcSquad('ladder', 1988, club)).toEqual(npcSquad('ladder', 1988, club));
    expect(ages(npcSquad('ladder', 1988, club), 1988)).not.toEqual(
      ages(npcSquad('another', 1988, club), 1988),
    );
  });

  it("places keepers and forwards across the age range in a world's first season", () => {
    // The old ladder stood keepers only at 24 and 35 and forwards at 22–23 and 32–34 in 1930.
    const squads = clubs('ENG', 40).map((club, k) =>
      npcSquad('ladder', 1930, club, TACTICS[k % 4]),
    );
    for (const line of ['GK', 'FW'] as const) {
      const held = squads.flatMap((s) =>
        ages(
          s.filter((p) => lineOf(p.position) === line),
          1930,
        ),
      );
      expect(new Set(held).size).toBeGreaterThanOrEqual(12);
      expect(held.some((age) => age <= 21)).toBe(true);
      expect(held.some((age) => age >= 26 && age <= 33)).toBe(true);
    }
  });

  it('leaves a retained person his stored ID and facts (→WORLD-11)', () => {
    const club = clubs('ENG', 1)[0]!,
      generated = npcSquad('ladder', 2000, club),
      // Stored under the shared ladder's cohort and birth year, before each club had its own.
      person: PersonCareer = {
        id: `${club.id}:p:4:110`,
        name: 'Retained Before',
        born: 1972,
        position: generated[4]!.position,
        professionalism: generated[4]!.personality.professionalism,
        qualities: generated[4]!.qualities!,
        playing: 'active',
        club: club.id,
        origin: { club: club.id, slot: 4 },
        employment: [],
        mentors: [],
      },
      w = {
        seed: 'ladder',
        year: 2000,
        playerClub: 'own',
        clubs: [club],
        people: { [person.id]: person },
      } as unknown as World;
    const kept = continuousSquad(w, club);
    expect(kept[4]).toMatchObject({ id: person.id, name: person.name, born: person.born });
    expect(kept.filter((p) => p.id === person.id)).toHaveLength(1);
    // Every other place keeps the club's own ladder.
    expect(kept.filter((_, i) => i !== 4)).toEqual(generated.filter((_, i) => i !== 4));
  });
});
