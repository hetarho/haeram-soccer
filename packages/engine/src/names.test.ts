import { describe, expect, it } from 'vitest';
import { COUNTRIES } from '../../catalogs/src/index';
import type { Club } from '../../contracts/src/types';
import { makePlayer, npcSquad, personName, SURNAME_STRIDE } from './world';
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
