import type { CareerDate, PersonCareer, World } from '../../contracts/src/types';
import { coachingGrade } from './aptitude';
import { careerDate, coachingProfiled } from './person-careers';
import { integer, random } from './primitives';

export function personCoachingGrade(person: PersonCareer) {
  return coachingGrade({
    qualities: person.qualities,
    personality: { professionalism: person.professionalism },
  });
}
/**
 * One retained draw, with strict threshold comparisons: 높음 below 0.5 and 매우 높음 below 0.8 are
 * willing (→STAFF-25), and nothing the owner does changes it; low aptitude cannot enter.
 */
export function intentionFromDraw(
  person: PersonCareer,
  at: CareerDate,
  draw: number,
): PersonCareer['intention'] {
  const grade = personCoachingGrade(person);
  if (!grade || grade < 4) return undefined;
  return { at: { ...at }, draw, willing: draw < (grade === 5 ? 0.8 : 0.5) };
}
export function decideCoachingIntention(w: World, person: PersonCareer) {
  if (!person.intention)
    person.intention = intentionFromDraw(
      person,
      careerDate(w),
      random(`${w.seed}:coaching-intention:${person.id}`)(),
    );
  return person.intention;
}
export function coachingEntryReady(person: PersonCareer) {
  return (
    person.playing === 'retired' &&
    !!person.intention?.willing &&
    (personCoachingGrade(person) ?? 0) >= 4 &&
    !person.employment.some((job) => !job.to && job.role !== 'player')
  );
}

export function coachingSpecialty(
  person: Pick<PersonCareer, 'position' | 'professionalism' | 'qualities'>,
): NonNullable<PersonCareer['coaching']>['role'] {
  if (person.position === 'GK') return 'goalkeeping';
  if (person.qualities.teaching === 5) return 'youth';
  if (person.qualities.understanding >= 4 && person.qualities.judgement >= 4) return 'assistant';
  if (person.professionalism === 5) return 'fitness';
  if (['LB', 'CB', 'RB', 'LWB', 'RWB', 'DM'].includes(person.position)) return 'defense';
  return 'attack';
}
/** Draw actual initial ability once; a candidate read must never call this mutator. */
export function initializeCoaching(w: World, person: PersonCareer) {
  if (person.coaching) return person.coaching;
  const grade = personCoachingGrade(person);
  if (!person.intention?.willing || !grade || grade < 4) return undefined;
  const rng = random(`${w.seed}:coaching-entry:${person.id}`);
  const coaching = (person.coaching = coachingProfile(person, careerDate(w), rng));
  coachingProfiled(w);
  return coaching;
}
export function coachingProfile(
  person: PersonCareer,
  at: CareerDate,
  rng: () => number,
): NonNullable<PersonCareer['coaching']> {
  const high = personCoachingGrade(person) === 5;
  return {
    role: coachingSpecialty(person),
    ability: integer(rng, high ? 55 : 50, high ? 65 : 60),
    potential: integer(rng, high ? 80 : 70, high ? 90 : 80),
    at: { ...at },
  };
}
