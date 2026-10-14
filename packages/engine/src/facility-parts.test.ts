import { describe, expect, it } from 'vitest';
import { validateWorld } from '../../contracts/src/index';
import {
  academyIntakeSize,
  createWorld,
  developmentBase,
  facilityWork,
  gateProjection,
  nextWork,
  operate,
  progressFacilityWorks,
  stadiumCapacity,
} from './index';

const world = (seed = 'facility-parts') => {
  const w = createWorld({
    country: 'ENG',
    name: 'Stand Town',
    color: '#445533',
    seed,
    level: 'normal' as const,
  });
  w.cash = '999999999999';
  return w;
};
/** Moves a part's work `days` further on, as the daily club step would read it. */
function pass(w: ReturnType<typeof world>, part: 'stadium' | 'training' | 'academy', days: number) {
  w.facilityWorks![part]!.day -= days;
  progressFacilityWorks(w);
}

describe('facility works (→ECON-32)', () => {
  it('a rebuild keeps the old ground in full use for 540 days, then opens the new one', () => {
    const w = world();
    w.stadium = 1;
    expect(nextWork(w, 'stadium')).toMatchObject({
      to: 2,
      kind: 'rebuild',
      capacity: 10000,
      days: 540,
    });
    operate(w, { type: 'facility', part: 'stadium' });
    expect(stadiumCapacity(w)).toBe(5000);
    pass(w, 'stadium', 539);
    expect(w.stadium).toBe(1);
    expect(facilityWork(w, 'stadium')!.left).toBe(1);
    pass(w, 'stadium', 1);
    expect(w.stadium).toBe(2);
    expect(gateProjection(w).capacity).toBe(10000);
    expect(w.events.at(-1)).toMatchObject({
      kind: 'facility-open',
      title: '경기장 완공 · 새 구장',
    });
    validateWorld(w);
  });

  it("counts a work's days across a season's turn", () => {
    const w = world('facility-turn');
    w.calendar = { day: 300 };
    operate(w, { type: 'facility', part: 'training' });
    // The next season starts on 1 August: 65 days in, 25 to go.
    w.year += 1;
    w.calendar = { day: 0 };
    expect(facilityWork(w, 'training')!.left).toBe(25);
    w.calendar = { day: 25 };
    progressFacilityWorks(w);
    expect(w.trainingGround).toBe(1);
    expect(w.facilityWorks).toBeUndefined();
  });

  it('runs one work per part, the parts side by side, each with its own effect', () => {
    const w = world('facility-sides');
    const base = developmentBase(w),
      intake = academyIntakeSize(w);
    for (const part of ['stadium', 'training', 'academy'] as const)
      operate(w, { type: 'facility', part });
    expect(Object.keys(w.facilityWorks!)).toEqual(['stadium', 'training', 'academy']);
    for (const part of ['training', 'academy'] as const) pass(w, part, 90);
    operate(w, { type: 'facility', part: 'academy' });
    pass(w, 'academy', 90);
    expect(w.trainingGround).toBe(1);
    expect(w.academyFacility).toBe(2);
    expect(developmentBase(w)).toBeCloseTo(base + 0.06, 10);
    expect(academyIntakeSize(w)).toBe(intake + 1);
    // The stand is still being built.
    expect(w.stadium).toBe(0);
    expect(stadiumCapacity(w)).toBe(2250);
  });
});
