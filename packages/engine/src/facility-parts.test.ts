import { describe, expect, it } from 'vitest';
import { validateWorld } from '../../contracts/src/index';
import {
  academyIntakeSize,
  createWorld,
  developmentBase,
  facilityWork,
  gateProjection,
  nextWork,
  progressFacilityWorks,
  stadiumCapacity,
} from './index';
import { startWork } from './testing';

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
  it('finishes a work already under way', () => {
    // A career saved as its season starts, 65 days into an academy work it began the season
    // before: no career starts a work now, but this one opens on its day (→ECON-32).
    const w = world('facility-under-way');
    w.facilityWorks = { academy: { to: 1, year: w.year - 1, day: 300 } };
    const loaded = validateWorld(structuredClone(w));
    expect(facilityWork(loaded, 'academy')).toMatchObject({ to: 1, days: 90, left: 25 });
    loaded.calendar = { day: 24 };
    progressFacilityWorks(loaded);
    expect(loaded.academyFacility).toBe(0);
    loaded.calendar = { day: 25 };
    progressFacilityWorks(loaded);
    expect(loaded.academyFacility).toBe(1);
    expect(loaded.facilityWorks).toBeUndefined();
    expect(loaded.events.at(-1)).toMatchObject({
      kind: 'facility-open',
      title: '유소년 시설 완공 · 1단계',
    });
  });

  it('a rebuild keeps the old ground in full use for 540 days, then opens the new one', () => {
    const w = world();
    w.stadium = 1;
    expect(nextWork(w, 'stadium')).toMatchObject({
      to: 2,
      kind: 'rebuild',
      capacity: 10000,
      days: 540,
    });
    startWork(w, 'stadium');
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
    startWork(w, 'training');
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
    for (const part of ['stadium', 'training', 'academy'] as const) startWork(w, part);
    expect(Object.keys(w.facilityWorks!)).toEqual(['stadium', 'training', 'academy']);
    for (const part of ['training', 'academy'] as const) pass(w, part, 90);
    startWork(w, 'academy');
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
