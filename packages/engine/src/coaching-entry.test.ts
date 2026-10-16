import { describe, expect, it } from 'vitest';
import type { PersonCareer } from '../../contracts/src/types';
import { createWorld, operate } from './index';
import {
  canEncourageCoaching,
  coachingEntryReady,
  decideCoachingIntention,
  encourageCoaching,
  intentionFromDraw,
} from './coaching-entry';
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
  it('uses exact strict natural and encouraged thresholds for both qualifying grades', () => {
    for (const grade of [4, 5] as const)
      for (const [draw, expected, boosted] of grade === 4
        ? [
            [0.49999, true, true],
            [0.5, false, true],
            [0.64999, false, true],
            [0.65, false, false],
          ]
        : [
            [0.79999, true, true],
            [0.8, false, true],
            [0.94999, false, true],
            [0.95, false, false],
          ]) {
        const { w, p, person } = candidate(grade);
        p.retiring = w.year;
        person.intention = intentionFromDraw(person, careerDate(w), draw as number);
        expect(person.intention?.willing).toBe(expected);
        const before = JSON.stringify(person.qualities);
        operate(w, { type: 'encourage-coaching', player: p.id });
        expect(person.intention?.willing).toBe(boosted);
        expect(person.intention?.draw).toBe(draw);
        expect(JSON.stringify(person.qualities)).toBe(before);
        expect(person.intention?.encouraged?.changed).toBe(!expected && boosted);
        expect(() => encourageCoaching(w, p.id)).toThrow('한 번');
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
    expect(canEncourageCoaching(w, p.id)).toBe(false);
    const reload = JSON.parse(JSON.stringify(person)) as PersonCareer;
    expect(coachingEntryReady(reload)).toBe(true);
    expect(reload.intention?.draw).toBe(initial!.draw);
    reload.employment.push({ role: 'goalkeeping', club: w.playerClub, from: careerDate(w) });
    expect(coachingEntryReady(reload)).toBe(false);
  });
  it('rejects nonannounced, low-grade and other-club attempts without spending any opportunity', () => {
    const { w, p, person } = candidate();
    expect(() => encourageCoaching(w, p.id)).toThrow();
    expect(person.intention).toBeUndefined();
    const npc = Object.values(w.people!).find((p) => p.origin)!;
    recordRetirementAnnouncement(w, npc);
    expect(() => encourageCoaching(w, npc.id)).toThrow();
    expect(npc.intention?.encouraged).toBeUndefined();
    p.retiring = w.year;
    p.personality.professionalism = 1;
    p.qualities = { understanding: 1, teaching: 1, judgement: 1 };
    expect(() => encourageCoaching(w, p.id)).toThrow();
    expect(person.intention).toBeUndefined();
    expect(
      intentionFromDraw(
        { ...person, professionalism: 1, qualities: p.qualities },
        careerDate(w),
        0,
      ),
    ).toBeUndefined();
  });
});
