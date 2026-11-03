import type { CareerDate, PersonCareer, World } from '../../contracts/src/types';
import { managerialGrade } from './aptitude';
import {
  careerDate,
  careerOrdinal,
  coachingPeople,
  coachingService,
  coachingServiceShort,
  longestMentor,
  managementProfiled,
} from './person-careers';
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
/**
 * The calendar day before which each person read short of his service cannot qualify, and how many
 * jobs he held then (T669): only an opened job can bring the day nearer, so it reads him again.
 */
const waits = new WeakMap<PersonCareer, { jobs: number; until: number }>();
/**
 * Per `coachingPeople` list, those who may still qualify: no management yet and the managerial
 * grade it needs, which qualities that never change fix (T669).
 */
const candidates = new WeakMap<readonly PersonCareer[], PersonCareer[]>();
/** Dated processing owns initialization; candidate/profile/history reads only consume it. */
export function qualifyManagers(w: World) {
  const at = careerDate(w),
    today = careerOrdinal(at);
  // Only someone who has coached can have the service that qualifies him (T450).
  const coached = coachingPeople(w);
  let list = candidates.get(coached);
  if (!list)
    candidates.set(
      coached,
      (list = coached.filter((p) => !p.management && (managerialGrade(p) ?? 0) >= 4)),
    );
  for (const person of list) {
    if (person.management) continue;
    const wait = waits.get(person);
    if (wait && wait.jobs === person.employment.length && today < wait.until) continue;
    // `managerialEntryReady`'s service, read once and kept while he is short of it.
    const short = coachingServiceShort(person, at);
    if (short === undefined) continue;
    if (short > 0) {
      waits.set(person, { jobs: person.employment.length, until: today + short });
      continue;
    }
    person.management = managerialProfile(
      person,
      at,
      random(`${w.seed}:managerial-entry:${person.id}`),
      candidateStyles(`${w.seed}:managerial-entry:${person.id}`, at.year)[0],
    );
    managementProfiled(w);
  }
}
