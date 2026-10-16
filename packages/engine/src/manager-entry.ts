import type { CareerDate, PersonCareer, World } from '../../contracts/src/types';
import { managerialGrade } from './aptitude';
import { careerDate, coachingService, longestMentor } from './person-careers';
import { integer, random } from './primitives';
import { candidateStyles } from './styles';

export function managerialEntryReady(person: PersonCareer, at: CareerDate) {
  return (managerialGrade(person) ?? 0) >= 4 && coachingService(person, at).qualified;
}
/** The initial actual manager values are independent of coaching ability and generic age bands. */
export function managerialProfile(
  person: PersonCareer,
  at: CareerDate,
  rng: () => number,
  fallback: NonNullable<PersonCareer['management']>['school'],
): NonNullable<PersonCareer['management']> {
  const veryHigh = managerialGrade(person) === 5;
  return {
    ability: integer(rng, veryHigh ? 60 : 55, veryHigh ? 70 : 65),
    potential: integer(rng, veryHigh ? 85 : 75, veryHigh ? 95 : 85),
    school: longestMentor(person, at)?.school ?? fallback,
    at: { ...at },
  };
}
/** Dated processing owns initialization; candidate/profile/history reads only consume it. */
export function qualifyManagers(w: World) {
  const at = careerDate(w);
  for (const person of Object.values(w.people ?? {})) {
    if (person.management || !managerialEntryReady(person, at)) continue;
    person.management = managerialProfile(
      person,
      at,
      random(`${w.seed}:managerial-entry:${person.id}`),
      candidateStyles(`${w.seed}:managerial-entry:${person.id}`, at.year)[0],
    );
  }
}
