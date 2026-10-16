import { describe, expect, it } from 'vitest';
import { createWorld } from './index';
import { aptitudeLabel, careerAssessment } from './career-assessment';
import { managerialEntryReady } from './manager-entry';
const world = () =>
  createWorld({
    country: 'ENG',
    name: 'Career Assessment',
    color: '#224466',
    seed: 'assessment',
    level: 'easy',
  });
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
      encourage: false,
      managerQualified: false,
    });
    expect(careerAssessment(w, p, true).encourage).toBe(false);
    expect(JSON.stringify(w)).toBe(before);
    expect(person.mentors).toEqual([]);
    expect(person.management).toBeUndefined();
  });
  it('reports the once-only encouragement and real manager gates without creating candidacy', () => {
    const w = world(),
      p = w.players[0],
      person = w.people![p.id];
    p.qualities = { understanding: 4, teaching: 4, judgement: 4 };
    p.personality.professionalism = 4;
    Object.assign(person, { qualities: { ...p.qualities }, professionalism: 4 });
    p.retiring = w.year;
    expect(careerAssessment(w, p, true).encourage).toBe(true);
    person.intention = {
      at: { year: w.year, day: 0 },
      draw: 0,
      willing: true,
      encouraged: { at: { year: w.year, day: 0 }, changed: true },
    };
    expect(careerAssessment(w, p, true)).toMatchObject({
      encourage: false,
      encouragement: { willing: true, changed: true },
    });
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
