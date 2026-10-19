import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { POSITIONS, type Grade } from '../../contracts/src/player';
import { validateWorld } from '../../contracts/src/schema';
import { createWorld, makePlayer } from './index';
import { coachingGrade, generateQualities, managerialGrade } from './aptitude';
import { gradeOf } from './player';

const grades: Grade[] = [1, 2, 3, 4, 5];
describe('fixed off-pitch aptitude', () => {
  it('exhausts every component combination and rounds halves upward', () => {
    for (const professionalism of grades)
      for (const understanding of grades)
        for (const teaching of grades)
          for (const judgement of grades) {
            const person = {
              personality: { professionalism },
              qualities: { understanding, teaching, judgement },
            };
            expect(coachingGrade(person)).toBe(
              Math.round((professionalism + understanding + teaching) / 3),
            );
            expect(managerialGrade(person)).toBe(Math.round((understanding + judgement) / 2));
          }
    expect(coachingGrade({ personality: { professionalism: 3 } })).toBeUndefined();
    expect(managerialGrade({})).toBeUndefined();
  });
  it('uses the established 8/22/40/22/8 distribution with independent person draws', () => {
    for (const [draw, grade] of [
      [0, 1],
      [0.07999, 1],
      [0.08, 2],
      [0.29999, 2],
      [0.3, 3],
      [0.69999, 3],
      [0.7, 4],
      [0.91999, 4],
      [0.92, 5],
      [0.99999, 5],
    ])
      expect(gradeOf(() => draw)).toBe(grade);
    expect(generateQualities('a', 'p')).toEqual(generateQualities('a', 'p'));
    expect(
      new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(generateQualities('a', `p${i}`))))
        .size,
    ).toBeGreaterThan(10);
  });
  it('preserves all pre-existing player fields across 42 generation cases', () => {
    const players = POSITIONS.flatMap((pos, i) =>
      ['alpha', 'beta', 'gamma'].map((seed) => {
        const p = makePlayer('ENG', seed, `test:${pos}`, 1950, 30 + i * 3, pos, 18 + i);
        expect(p.qualities).toEqual(generateQualities(seed, p.id));
        const { qualities: _qualities, ...old } = p;
        void _qualities;
        return old;
      }),
    );
    // Recorded from the generator of the sixteen attributes (→PLAYER-2); the off-pitch components
    // stay independent of every other field.
    expect(createHash('sha256').update(JSON.stringify(players)).digest('hex')).toBe(
      '59c117f9fc164a41a5112f49d0da6dd533f79956c4c3394c42c88d638172e961',
    );
  });
  it('keeps fixed aptitude independent of playing state and rejects invalid components', () => {
    const w = createWorld({
      country: 'ENG',
      name: 'Aptitude',
      color: '#224466',
      seed: 'aptitude',
      level: 'easy',
    });
    expect(w.players.every((p) => !!p.qualities)).toBe(true);
    const p = w.players[0];
    const grade = coachingGrade(p),
      management = managerialGrade(p);
    p.attrs.pace = 99;
    p.attrs.vision = 99;
    p.potential = 99;
    p.reputation = 99;
    p.career[0] = 200;
    expect(coachingGrade(p)).toBe(grade);
    expect(managerialGrade(p)).toBe(management);
    for (const key of ['understanding', 'teaching', 'judgement'] as const)
      for (const invalid of [0, 6, 2.5]) {
        const bad = structuredClone(w);
        bad.players[0].qualities![key] = invalid as Grade;
        expect(() => validateWorld(bad)).toThrow();
      }
  });
});
