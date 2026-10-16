import { describe, expect, it } from 'vitest';
import { createWorld } from './index';
import {
  announceRetirements,
  retireAtClose,
  retirementAnnounceDay,
  retirementChanceWithContext,
} from './careers';
import { squad } from './world';
const world = () =>
  createWorld({
    country: 'ENG',
    name: 'Retained Retirement',
    color: '#224466',
    seed: 'npc-retirement',
    level: 'easy',
  });
describe('actual retained NPC retirement', () => {
  it('distinguishes missing minutes, known low minutes, regular starters and goalkeeper age', () => {
    expect(retirementChanceWithContext(1950, 1918, 'CM')).toBe(0.08);
    expect(retirementChanceWithContext(1950, 1918, 'CM', { minutes: 0 })).toBeCloseTo(0.08 * 1.4);
    expect(
      retirementChanceWithContext(1950, 1918, 'CM', { minutes: 2000, strongStarter: true }),
    ).toBeCloseTo(0.08 * 0.6);
    expect(retirementChanceWithContext(1950, 1918, 'GK')).toBe(0);
    expect(retirementChanceWithContext(1950, 1917, 'GK')).toBe(0.08);
  });
  it('records announcement and actual retirement separately once and excludes retired players', () => {
    const w = world(),
      person = Object.values(w.people!).find((p) => p.origin)!;
    person.born = w.year - 40;
    const club = w.clubs.find((c) => c.id === person.club)!;
    w.calendar = { day: retirementAnnounceDay(w.year) };
    announceRetirements(w);
    const announced = structuredClone(person.retirement);
    expect(announced).toMatchObject({
      year: w.year,
      announced: { year: w.year, day: w.calendar.day },
    });
    expect(person.playing).toBe('active');
    expect(person.retirement?.at).toBeUndefined();
    announceRetirements(w);
    expect(person.retirement).toEqual(announced);
    w.calendar.day = 323;
    retireAtClose(w);
    expect(person.playing).toBe('retired');
    expect(person.retirement?.at).toEqual({ year: w.year, day: 323 });
    expect(squad(w, club).some((p) => p.id === person.id)).toBe(false);
    const after = JSON.stringify(person);
    retireAtClose(w);
    expect(JSON.stringify(person)).toBe(after);
    expect(person.ownCareer).toBeUndefined();
  });
  it('is independent of roster inspection and forces actual age 41 even for a keeper', () => {
    const a = world(),
      b = world();
    for (const w of [a, b]) {
      const person = Object.values(w.people!).find((p) => p.origin)!;
      person.born = w.year - 40;
      person.position = 'GK';
      w.calendar = { day: retirementAnnounceDay(w.year) };
    }
    for (const c of a.clubs.slice(0, 40)) squad(a, c);
    announceRetirements(a);
    announceRetirements(b);
    expect(a.people).toEqual(b.people);
    retireAtClose(a);
    retireAtClose(b);
    expect(a.people).toEqual(b.people);
    expect(Object.values(a.people!).find((p) => p.origin)!.playing).toBe('retired');
  });
});
