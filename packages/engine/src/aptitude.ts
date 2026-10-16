import type { Grade, OffPitchQualities, Personality } from '../../contracts/src/player';
import { gradeOf } from './player';
import { random } from './primitives';

/** Person-specific draws never consume the existing playing/profile stream. */
export function generateQualities(seed: string, person: string): OffPitchQualities {
  const rng = random(`${seed}:aptitude:${person}`);
  return { understanding: gradeOf(rng), teaching: gradeOf(rng), judgement: gradeOf(rng) };
}
const meanGrade = (...values: Grade[]): Grade =>
  Math.max(
    1,
    Math.min(5, Math.floor(values.reduce((a, b) => a + b, 0) / values.length + 0.5)),
  ) as Grade;
export function coachingGrade(person: {
  personality: Pick<Personality, 'professionalism'>;
  qualities?: OffPitchQualities;
}): Grade | undefined {
  const q = person.qualities;
  return q && meanGrade(person.personality.professionalism, q.understanding, q.teaching);
}
export function managerialGrade(person: { qualities?: OffPitchQualities }): Grade | undefined {
  const q = person.qualities;
  return q && meanGrade(q.understanding, q.judgement);
}
