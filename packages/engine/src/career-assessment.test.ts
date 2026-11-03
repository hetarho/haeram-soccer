import { describe, expect, it } from 'vitest';
import { aptitudeLabel, careerAssessment } from './career-assessment';
import { managerialEntryReady } from './manager-entry';
import { careerWorld } from './career.testkit';
const world = () => careerWorld({ seed: 'assessment' });
describe('qualitative career assessment', () => {
  it('uses exact own labels and the existing bounded scout ranges', () => {
    for (const ability of [undefined, 59, 60, 79, 80]) {
      expect(aptitudeLabel(4, true, ability)).toBe('높음');
      expect(aptitudeLabel(1, false, ability)).toBe(
        ability === 80
          ? '매우 낮음'
          : ability === 60 || ability === 79
            ? '매우 낮음~낮음'
            : '매우 낮음~보통',
      );
      expect(aptitudeLabel(5, false, ability)).toBe(
        ability === 80
          ? '매우 높음'
          : ability === 60 || ability === 79
            ? '높음~매우 높음'
            : '보통~매우 높음',
      );
    }
    expect(aptitudeLabel(undefined, false)).toBeUndefined();
  });
  it('keeps an uncertain high-looking estimate independent of true-low eligibility and makes no historical observation', () => {
    const w = world(),
      p = w.players[0],
      person = w.people![p.id];
    p.qualities = { understanding: 2, teaching: 2, judgement: 2 };
    p.personality.professionalism = 2;
    person.qualities = { ...p.qualities };
    person.professionalism = 2;
    p.retiring = w.year;
    const before = JSON.stringify(w);
    expect(careerAssessment(w, p, false)).toMatchObject({
      coaching: '매우 낮음~높음',
      managerial: '매우 낮음~높음',
      managerQualified: false,
    });
    expect(JSON.stringify(w)).toBe(before);
    expect(person.mentors).toEqual([]);
    expect(person.management).toBeUndefined();
  });
  it('shows aptitude grades only and reports the real manager gates without creating candidacy', () => {
    const w = world(),
      p = w.players[0],
      person = w.people![p.id];
    p.qualities = { understanding: 4, teaching: 4, judgement: 4 };
    p.personality.professionalism = 4;
    Object.assign(person, { qualities: { ...p.qualities }, professionalism: 4 });
    p.retiring = w.year;
    person.intention = { at: { year: w.year, day: 0 }, draw: 0, willing: true };
    // Grades and specialty, never an exact aptitude, an intention or an owner action (→WEB-78).
    expect(Object.keys(careerAssessment(w, p, true)).sort()).toEqual([
      'coaching',
      'managerQualified',
      'managerial',
      'specialty',
    ]);
    expect(careerAssessment(w, p, true)).toMatchObject({ coaching: '높음' });
    person.management = {
      ability: 55,
      potential: 75,
      school: 'developer',
      at: { year: w.year, day: 0 },
    };
    expect(careerAssessment(w, p, true).managerQualified).toBe(false);
    person.employment = [
      { role: 'assistant', club: w.playerClub, from: { year: w.year - 3, day: 0 } },
    ];
    expect(managerialEntryReady(person, { year: w.year, day: 0 })).toBe(true);
    expect(careerAssessment(w, p, true).managerQualified).toBe(true);
  });
});
