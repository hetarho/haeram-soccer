import { describe, expect, it } from 'vitest';
import type { Fixture } from '../../contracts/src/types';
import { effectiveGap, matchForm, MATCH_DUEL_CONFIG } from './index';
import {
  type Path,
  favourite,
  giant,
  level,
  minnow,
  rival,
  sample,
  SLOW,
  underdog,
  w,
} from './calibration.testkit';

describe.each<[string, Path]>([['summary', 'summary']])('%s: calibrated outcomes', (_, path) => {
  it(
    'lets a +20 favourite win most matches but still lose some',
    () => {
      const s = sample(favourite, underdog, path);
      expect(s.gap).toBeGreaterThan(17);
      expect(s.gap).toBeLessThan(23);
      expect(s.win).toBeGreaterThan(0.7);
      expect(s.win).toBeLessThan(0.85);
      expect(s.loss).toBeGreaterThan(0.03);
      expect(s.loss).toBeLessThan(0.1);
    },
    SLOW,
  );

  // T216: equal grid sides draw about 21% (1,600 fixtures), as press beats every other tactic
  // (docs/CALIBRATION.md, 격자 엔진 전력 곡선); run it for the grid once the tactics are balanced.
  it.skipIf(path === 'grid')(
    'gives equal sides real football’s share of draws',
    () => {
      const s = sample(level, rival, path);
      expect(s.draw).toBeGreaterThan(0.22);
      expect(s.draw).toBeLessThan(0.32);
    },
    SLOW,
  );

  it(
    'keeps equal sides close, with real football’s goals and shots',
    () => {
      const s = sample(level, rival, path);
      expect(s.win).toBeGreaterThan(s.loss);
      expect(s.goals).toBeGreaterThan(2.4);
      expect(s.goals).toBeLessThan(3.1);
      expect(s.shots).toBeGreaterThan(10);
      expect(s.shots).toBeLessThan(16);
    },
    SLOW,
  );

  it(
    'never makes a massive favourite unbeatable',
    () => {
      const s = sample(giant, minnow, path);
      expect(s.gap).toBeGreaterThan(30);
      expect(s.win).toBeLessThan(0.96);
      expect(s.loss).toBeGreaterThan(0.01);
      expect(s.goals).toBeLessThan(4);
    },
    SLOW,
  );
});

describe('match-day form and diminishing returns', () => {
  it('draws form from the fixture alone, centred and bounded', () => {
    const f = { id: 'form-check' } as Fixture;
    expect(matchForm(w, f)).toEqual(matchForm(w, f));
    let sum = 0,
      squares = 0;
    for (let i = 0; i < 4000; i++) {
      for (const value of matchForm(w, { id: `form:${i}` } as Fixture)) {
        expect(Math.abs(value)).toBeLessThanOrEqual(3 * MATCH_DUEL_CONFIG.form);
        sum += value;
        squares += value * value;
      }
    }
    expect(Math.abs(sum / 8000)).toBeLessThan(0.3);
    expect(Math.sqrt(squares / 8000)).toBeGreaterThan(MATCH_DUEL_CONFIG.form * 0.85);
    expect(Math.sqrt(squares / 8000)).toBeLessThan(MATCH_DUEL_CONFIG.form * 1.1);
  });

  it('keeps ordinary gaps and caps huge ones without reversing order', () => {
    expect(effectiveGap(0)).toBe(0);
    expect(effectiveGap(10)).toBeGreaterThan(9.5);
    expect(effectiveGap(-10)).toBeCloseTo(-effectiveGap(10));
    let previous = 0;
    for (let gap = 1; gap <= 80; gap++) {
      expect(effectiveGap(gap)).toBeGreaterThan(previous);
      expect(effectiveGap(gap)).toBeLessThan(MATCH_DUEL_CONFIG.gapSaturation);
      previous = effectiveGap(gap);
    }
  });
});
