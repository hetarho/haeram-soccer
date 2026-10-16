import { describe, expect, it } from 'vitest';
import type { Grade, PersonCareer, Position } from '../../contracts/src/types';
import { createWorld, hireStaff, releaseStaff, staffCandidates } from './index';
import { coachingProfile, coachingSpecialty, initializeCoaching } from './coaching-entry';
import { careerDate } from './person-careers';
import { retirePerson } from './careers';
const world = () =>
  createWorld({
    country: 'ENG',
    name: 'Coaching Candidates',
    color: '#224466',
    seed: 'coaching-candidates',
    level: 'easy',
  });
function retire(w: ReturnType<typeof world>, index: number, grade: 4 | 5 = 4) {
  const p = w.players[index],
    person = w.people![p.id];
  p.personality.professionalism = grade;
  p.position = 'CM';
  p.qualities = { understanding: grade, teaching: grade, judgement: grade };
  Object.assign(person, {
    professionalism: grade,
    position: 'CM',
    qualities: { ...p.qualities },
    intention: { at: careerDate(w), draw: 0, willing: true },
  });
  p.status = 'retired';
  retirePerson(w, person);
  return person;
}
describe('former player coaching candidates', () => {
  it('uses the first matching specialty including overlapping conditions', () => {
    const base = {
      position: 'CM' as Position,
      professionalism: 4 as Grade,
      qualities: { understanding: 4 as Grade, teaching: 4 as Grade, judgement: 4 as Grade },
    };
    for (const [person, expected] of [
      [
        {
          ...base,
          position: 'GK',
          professionalism: 5,
          qualities: { understanding: 5, teaching: 5, judgement: 5 },
        },
        'goalkeeping',
      ],
      [{ ...base, qualities: { ...base.qualities, teaching: 5 } }, 'youth'],
      [{ ...base, professionalism: 5 }, 'assistant'],
      [{ ...base, professionalism: 5, qualities: { ...base.qualities, judgement: 3 } }, 'fitness'],
      ...(['LB', 'CB', 'RB', 'LWB', 'RWB', 'DM'] as const).map((position) => [
        { ...base, position, qualities: { ...base.qualities, judgement: 3 } },
        'defense',
      ]),
      [{ ...base, position: 'ST', qualities: { ...base.qualities, judgement: 3 } }, 'attack'],
    ] as const)
      expect(coachingSpecialty(person as typeof base)).toBe(expected);
  });
  it('uses inclusive actual ability ranges without another age offset and initializes only once', () => {
    for (const grade of [4, 5] as const) {
      const w = world(),
        person = retire(w, 0, grade);
      expect(coachingProfile(person, careerDate(w), () => 0)).toMatchObject({
        ability: grade === 5 ? 55 : 50,
        potential: grade === 5 ? 80 : 70,
      });
      expect(coachingProfile(person, careerDate(w), () => 0.999999)).toMatchObject({
        ability: grade === 5 ? 65 : 60,
        potential: grade === 5 ? 90 : 80,
      });
      const first = structuredClone(person.coaching);
      w.year++;
      expect(initializeCoaching(w, person)).toEqual(first);
      const offers = staffCandidates(w, person.coaching!.role),
        offer = offers.find((c) => c.id === person.id)!;
      expect(offer).toMatchObject({
        name: person.name,
        born: person.born,
        ability: first!.ability,
        potential: first!.potential,
        person: person.id,
      });
      const before = JSON.stringify(w);
      staffCandidates(w, person.coaching!.role);
      expect(JSON.stringify(w)).toBe(before);
    }
  });
  it('appends to the ordinary three and uses stable IDs after list indices shift', () => {
    const w = world();
    w.cash = '9999999999';
    const a = retire(w, 0),
      b = retire(w, 1);
    const role = a.coaching!.role;
    expect(role).toBe(b.coaching!.role);
    const pool = staffCandidates(w, role);
    expect(pool).toHaveLength(5);
    const bIndex = pool.findIndex((c) => c.id === b.id);
    hireStaff(
      w,
      role,
      pool.findIndex((c) => c.id === a.id),
      2,
      a.id,
    );
    expect(staffCandidates(w, role).some((c) => c.id === a.id)).toBe(false);
    // The old index can point elsewhere; stable identity is revalidated against today's pool.
    hireStaff(w, role, bIndex, 2, b.id);
    expect(w.staff!.find((c) => c.role === role)?.person).toBe(b.id);
    expect(a.employment.some((job) => !job.to && job.role === role)).toBe(false);
    releaseStaff(w, role);
    expect(staffCandidates(w, role).some((c) => c.id === b.id)).toBe(true);
    const first = structuredClone(b.coaching);
    initializeCoaching(w, b);
    expect(b.coaching).toEqual(first);
    b.intention!.willing = false;
    expect(staffCandidates(w, role).some((c) => c.id === b.id)).toBe(false);
  });
  it('does not initialize a low-grade or unwilling person', () => {
    const w = world(),
      person = w.people![w.players[0].id];
    person.professionalism = 1;
    person.qualities = { understanding: 1, teaching: 1, judgement: 1 };
    person.intention = { at: careerDate(w), draw: 0, willing: true };
    expect(initializeCoaching(w, person)).toBeUndefined();
    person.professionalism = 5;
    person.qualities = { understanding: 5, teaching: 5, judgement: 5 };
    person.intention.willing = false;
    expect(initializeCoaching(w, person)).toBeUndefined();
    expect((person as PersonCareer).coaching).toBeUndefined();
  });
});
