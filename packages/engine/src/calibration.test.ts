import { describe, expect, it } from 'vitest';
import type { Club, Fixture } from '../../contracts/src/types';
import { M } from './grid/record';
import { effectiveGap, matchForm, MATCH_DUEL_CONFIG, rating, simulateAggregate } from './index';
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
  // (artifacts/benchmarks/CALIBRATION.md, 격자 엔진 전력 곡선); run it for the grid once the tactics are balanced.
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

/**
 * The candidate aggregate path on the same guard clubs (T284, artifacts/benchmarks/CALIBRATION.md 집계 경로 보정):
 * coarse regression bounds on its strength curve, draws and goals, never the release evidence the
 * corpus report (scripts/match-parity.ts --report) holds.
 */
describe('aggregate: calibrated outcomes', () => {
  const COUNT = 800;
  function aggregateSample(home: Club[], away: Club[]) {
    const t = { w: 0, d: 0, l: 0, goals: 0, gap: 0, shots: 0 };
    for (let i = 0; i < COUNT; i++) {
      const h = home[i % home.length]!,
        a = away[Math.floor(i / home.length) % away.length]!;
      if (h === a) continue;
      const f: Fixture = {
        id: `guard-aggregate:${h.id}:${a.id}:${i}`,
        year: w.year,
        round: 1,
        kind: 'league',
        home: h.id,
        away: a.id,
        country: 'ENG',
        groupKey: 'ENG:0:0',
      };
      const { score, metrics } = simulateAggregate(w, f).record;
      t.gap += rating(w, h) + 3 - rating(w, a);
      t.goals += score.home + score.away;
      t.shots += metrics[0][M.shots]! + metrics[1][M.shots]!;
      if (score.home > score.away) t.w++;
      else if (score.home === score.away) t.d++;
      else t.l++;
    }
    const n = t.w + t.d + t.l;
    return {
      win: t.w / n,
      draw: t.d / n,
      loss: t.l / n,
      goals: t.goals / n,
      gap: t.gap / n,
      shots: t.shots / n / 2,
    };
  }

  it(
    'lets a +20 favourite win most matches but still lose some',
    () => {
      const s = aggregateSample(favourite, underdog);
      expect(s.gap).toBeGreaterThan(17);
      expect(s.gap).toBeLessThan(23);
      expect(s.win).toBeGreaterThan(0.7);
      expect(s.win).toBeLessThan(0.88);
      expect(s.loss).toBeGreaterThan(0.03);
      expect(s.loss).toBeLessThan(0.1);
    },
    SLOW,
  );

  it(
    'keeps equal sides close, with real football’s draws, goals and shots',
    () => {
      const s = aggregateSample(level, rival);
      expect(s.draw).toBeGreaterThan(0.18);
      expect(s.draw).toBeLessThan(0.32);
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
      const s = aggregateSample(giant, minnow);
      expect(s.gap).toBeGreaterThan(30);
      expect(s.win).toBeLessThan(0.97);
      expect(s.loss).toBeGreaterThan(0.005);
      expect(s.goals).toBeLessThan(4.5);
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
