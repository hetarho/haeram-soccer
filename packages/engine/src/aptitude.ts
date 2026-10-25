import type { Grade, OffPitchQualities, Personality } from '../../contracts/src/player';
import { gradeOf } from './player';
import { random } from './primitives';

/** Person-specific draws never consume the existing playing/profile stream. */
export function generateQualities(seed: string, person: string): OffPitchQualities {
  const rng = random(`${seed}:aptitude:${person}`);
  return { understanding: gradeOf(rng), teaching: gradeOf(rng), judgement: gradeOf(rng) };
}
/** The grades' mean, rounded half up; grades are whole, so their sum is exact in any order. */
const meanGrade = (sum: number, count: number): Grade =>
  Math.max(1, Math.min(5, Math.floor(sum / count + 0.5))) as Grade;
export function coachingGrade(person: {
  personality: Pick<Personality, 'professionalism'>;
  qualities?: OffPitchQualities;
}): Grade | undefined {
  const q = person.qualities;
  return q && meanGrade(person.personality.professionalism + q.understanding + q.teaching, 3);
}
export function managerialGrade(person: { qualities?: OffPitchQualities }): Grade | undefined {
  const q = person.qualities;
  return q && meanGrade(q.understanding + q.judgement, 2);
}
