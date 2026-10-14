import { describe, expect, it } from 'vitest';
import type { Club, Fixture } from '../../contracts/src/types';
import {
  createWorld,
  effectiveGap,
  matchForm,
  MATCH_DUEL_CONFIG,
  rating,
  simulateMatch,
} from './index';

// Coarse guards on the calibrated strength curve (docs/CALIBRATION.md, scripts/calibrate.ts):
// one rating point ≈ 16 Elo, draws and upsets as in long-run European top-flight football.
const w = createWorld({
  country: 'ENG',
  name: 'Calibration Guard',
  color: '#335577',
  seed: 'calibration-guard',
  level: 'normal' as const,
});
let serial = 0;
/** Eight clubs per strength, so tactics and generated squads vary across the sample. */
function clubs(strength: number) {
  return Array.from({ length: 8 }, (): Club => {
    const club: Club = {
      id: `GUARD:0:0:${serial++}`,
      name: `Guard ${serial}`,
      short: 'GRD',
      country: 'ENG',
      tier: 0,
      group: 0,
      strength,
      reputation: 50,
      fans: 10000,
      color: '#335577',
    };
    w.clubs.push(club);
    return club;
  });
}

/** Home and away pools play `count` fixtures on one path; gap is home strength minus away. */
function sample(home: Club[], away: Club[], duel: boolean, count: number) {
  const t = { w: 0, d: 0, l: 0, goals: 0, gap: 0, shots: 0 };
  for (let i = 0; i < count; i++) {
    const h = home[i % home.length],
      a = away[Math.floor(i / home.length) % away.length];
    if (h === a) continue;
    const f: Fixture = {
      id: `guard:${h.id}:${a.id}:${i}`,
      year: w.year,
      round: 1,
      kind: 'league',
      home: h.id,
      away: a.id,
      country: 'ENG',
      groupKey: 'ENG:0:0',
    };
    const { score, metrics } = simulateMatch(w, f, false, duel).record;
    t.gap += rating(w, h) + 3 - rating(w, a);
    t.goals += score.home + score.away;
    t.shots += metrics[0][4] + metrics[1][4];
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

const level = clubs(77),
  rival = clubs(77),
  favourite = clubs(86),
  underdog = clubs(69),
  giant = clubs(95),
  minnow = clubs(58);

describe.each([
  ['duel chain', true],
  ['team-level summary', false],
])('calibrated outcomes on the %s', (_, duel) => {
  it('lets a +20 favourite win most matches but still lose some', () => {
    const s = sample(favourite, underdog, duel, 1600);
    expect(s.gap).toBeGreaterThan(17);
    expect(s.gap).toBeLessThan(23);
    expect(s.win).toBeGreaterThan(0.7);
    expect(s.win).toBeLessThan(0.85);
    expect(s.loss).toBeGreaterThan(0.03);
    expect(s.loss).toBeLessThan(0.1);
  });

  it('keeps equal sides close, with real football’s share of draws and goals', () => {
    const s = sample(level, rival, duel, 1600);
    expect(s.draw).toBeGreaterThan(0.22);
    expect(s.draw).toBeLessThan(0.32);
    expect(s.win).toBeGreaterThan(s.loss);
    expect(s.goals).toBeGreaterThan(2.4);
    expect(s.goals).toBeLessThan(3.1);
    expect(s.shots).toBeGreaterThan(10);
    expect(s.shots).toBeLessThan(16);
  });

  it('never makes a massive favourite unbeatable', () => {
    const s = sample(giant, minnow, duel, 1600);
    expect(s.gap).toBeGreaterThan(30);
    expect(s.win).toBeLessThan(0.96);
    expect(s.loss).toBeGreaterThan(0.01);
    expect(s.goals).toBeLessThan(4);
  });
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
