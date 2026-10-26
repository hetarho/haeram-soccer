import type { CareerDate, PersonCareer, World } from '../../contracts/src/types';
import { coachingGrade } from './aptitude';
import { careerDate, coachingProfiled, retainPerson } from './person-careers';
import { integer, random } from './primitives';
import { addEvent } from './events';

export function personCoachingGrade(person: PersonCareer) {
  return coachingGrade({
    qualities: person.qualities,
    personality: { professionalism: person.professionalism },
  });
}
/** One retained draw, with strict threshold comparisons; low aptitude cannot enter. */
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
export function canEncourageCoaching(w: World, id: string) {
  const p = w.players.find((p) => p.id === id && p.status === 'active');
  const person = w.people?.[id];
  return (
    !!p &&
    p.retiring !== undefined &&
    person?.playing !== 'retired' &&
    !person?.retirement?.at &&
    !person?.intention?.encouraged &&
    (coachingGrade(p) ?? 0) >= 4
  );
}
export function encourageCoaching(w: World, id: string) {
  if (!canEncourageCoaching(w, id))
    throw new Error('은퇴를 발표한 우리 선수에게 한 번만 권유할 수 있어요.');
  const p = w.players.find((p) => p.id === id)!;
  const person = retainPerson(w, p, w.playerClub, true);
  const intention = decideCoachingIntention(w, person)!;
  const wasWilling = intention.willing;
  intention.willing ||= intention.draw < (personCoachingGrade(person) === 5 ? 0.95 : 0.65);
  intention.encouraged = { at: careerDate(w), changed: !wasWilling && intention.willing };
  const response = wasWilling
    ? '이미 지도자의 길을 생각하고 있었어요.'
    : intention.willing
      ? '권유를 받아들여 은퇴 뒤 지도자의 길을 준비해요.'
      : '권유에 감사하지만 지도자의 길은 선택하지 않았어요.';
  addEvent(
    w,
    'coaching-encouragement',
    `${person.name} 지도자 진로 권유`,
    `${response} 채용이나 플레잉 코치 계약이 보장되지는 않아요.`,
  );
  return intention;
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
