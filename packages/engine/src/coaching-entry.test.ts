import { describe, expect, it } from 'vitest';
import type { PersonCareer } from '../../contracts/src/types';
import { createWorld } from './index';
import { coachingEntryReady, decideCoachingIntention, intentionFromDraw } from './coaching-entry';
import { careerDate } from './person-careers';
import { recordRetirementAnnouncement, retirePerson } from './careers';
const world = () =>
  createWorld({
    country: 'ENG',
    name: 'Coaching Intention',
    color: '#224466',
    seed: 'intention',
    level: 'easy',
  });
function candidate(grade: 4 | 5 = 4) {
  const w = world(),
    p = w.players[0],
    person = w.people![p.id];
  p.personality.professionalism = grade;
  p.qualities = { understanding: grade, teaching: grade, judgement: grade };
  person.professionalism = grade;
  person.qualities = { ...p.qualities };
  return { w, p, person };
}
describe('once-only coaching entry', () => {
  it('uses the exact strict natural thresholds for both qualifying grades and nothing else', () => {
    // 높음 50%, 매우 높음 80% (→STAFF-25); the draws the withdrawn encouragement turned willing
    // (below 65% and 95%) stay unwilling.
    for (const grade of [4, 5] as const)
      for (const [draw, expected] of grade === 4
        ? [
            [0.49999, true],
            [0.5, false],
            [0.64999, false],
          ]
        : [
            [0.79999, true],
            [0.8, false],
            [0.94999, false],
          ]) {
        const { w, person } = candidate(grade);
        person.intention = intentionFromDraw(person, careerDate(w), draw as number);
        expect(person.intention).toEqual({ at: careerDate(w), draw, willing: expected });
      }
  });
  it('stores announcement intention once and creates entry readiness only at actual retirement', () => {
    const { w, p, person } = candidate(5);
    p.retiring = w.year;
    recordRetirementAnnouncement(w, person);
    const initial = structuredClone(person.intention);
    decideCoachingIntention(w, person);
    expect(person.intention).toEqual(initial);
    person.intention!.willing = true;
    expect(coachingEntryReady(person)).toBe(false);
    retirePerson(w, person);
    expect(coachingEntryReady(person)).toBe(true);
    const reload = JSON.parse(JSON.stringify(person)) as PersonCareer;
    expect(coachingEntryReady(reload)).toBe(true);
    expect(reload.intention?.draw).toBe(initial!.draw);
    reload.employment.push({ role: 'goalkeeping', club: w.playerClub, from: careerDate(w) });
    expect(coachingEntryReady(reload)).toBe(false);
  });
  it('gives low aptitude no intention to enter', () => {
    const { w, p, person } = candidate();
    p.retiring = w.year;
    p.personality.professionalism = 1;
    p.qualities = { understanding: 1, teaching: 1, judgement: 1 };
    Object.assign(person, { professionalism: 1, qualities: { ...p.qualities } });
    recordRetirementAnnouncement(w, person);
    expect(person.intention).toBeUndefined();
    expect(intentionFromDraw(person, careerDate(w), 0)).toBeUndefined();
  });
});
