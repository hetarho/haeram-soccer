import { describe, expect, it } from 'vitest';
import { validateWorld } from '../../contracts/src/index';
import {
  academyIntakeSize,
  developmentBase,
  facilityWork,
  gateProjection,
  nextWork,
  operate,
  partTop,
  progressFacilityWorks,
  stadiumCapacity,
  trainingGroundTerms,
} from './index';
import { startWork } from './testing';
import { careerWorld } from './career.testkit';

const world = (seed = 'facility-parts') => {
  const w = careerWorld({ seed });
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
    // The founding ground, whose next step is an expansion (a takeover in the lowest professional
    // division stands one step up, CLUB-1).
    w.stadium = 0;
    const base = developmentBase(w),
      intake = academyIntakeSize(w);
    for (const part of ['stadium', 'training', 'academy'] as const) startWork(w, part);
    expect(Object.keys(w.facilityWorks!)).toEqual(['stadium', 'training', 'academy']);
    for (const part of ['training', 'academy'] as const) pass(w, part, 90);
    startWork(w, 'academy');
    pass(w, 'academy', 90);
    expect(w.trainingGround).toBe(1);
    expect(w.academyFacility).toBe(2);
    expect(developmentBase(w)).toBe(base);
    expect(trainingGroundTerms(w)).toMatchObject({ growth: 1.06, recoveryBonus: 1, goodwill: 1 });
    expect(academyIntakeSize(w)).toBe(intake + 1);
    // The stand is still being built.
    expect(w.stadium).toBe(0);
    expect(stadiumCapacity(w)).toBe(2250);
  });
});

describe('owner facility continuation settings (→ECON-43)', () => {
  it('arms only the selected part, records changes once and leaves active work alone', () => {
    const w = world();
    startWork(w, 'stadium');
    const works = w.facilityWorks;
    const balance = { cash: w.cash, expense: w.expense };
    const enable = { type: 'facility-auto-upgrade', part: 'training', enabled: true } as const;
    operate(w, enable);
    const armed = w.facilityAutoUpgrade;
    expect(armed).toEqual({ training: 'armed' });
    operate(w, enable);
    expect(w.facilityAutoUpgrade).toBe(armed);
    expect(w.events.filter((event) => event.kind === 'facility-auto-upgrade')).toHaveLength(1);
    expect(w.facilityWorks).toBe(works);
    expect(w).toMatchObject(balance);

    operate(w, { ...enable, part: 'stadium' });
    operate(w, { ...enable, part: 'stadium', enabled: false });
    expect(w.facilityAutoUpgrade).toEqual(armed);
    expect(w.facilityWorks).toBe(works);
    expect(w).toMatchObject(balance);
    operate(w, { ...enable, enabled: false });
    expect(w).not.toHaveProperty('facilityAutoUpgrade');

    w.academyFacility = partTop('academy');
    expect(() => operate(w, { ...enable, part: 'academy' })).toThrow('최고 단계');
    expect(w).not.toHaveProperty('facilityAutoUpgrade');
  });

  it('keeps a saved wait until a manual start succeeds', () => {
    const w = world();
    w.trainingGround = 1;
    w.facilityAutoUpgrade = { training: 'awaiting-funds', academy: 'armed' };
    const waiting = w.facilityAutoUpgrade;
    const { cost, to } = nextWork(w, 'training')!;
    const start = { type: 'facility-upgrade', part: 'training', from: 1, cost } as const;
    const count = w.events.length;
    operate(w, { type: 'facility-auto-upgrade', part: 'training', enabled: true });
    expect(w.events).toHaveLength(count);
    expect(w.facilityAutoUpgrade).toBe(waiting);
    expect(() => operate(w, { ...start, cost: '0' })).toThrow();
    w.cash = '0';
    expect(() => operate(w, start)).toThrow();
    expect(w.facilityAutoUpgrade).toBe(waiting);
    expect(w.facilityWorks).toBeUndefined();

    w.cash = cost;
    operate(w, start);
    expect(w.cash).toBe('0');
    expect(w.facilityWorks?.training?.to).toBe(to);
    expect(w.facilityAutoUpgrade).toEqual({ training: 'armed', academy: 'armed' });
    expect(waiting.training).toBe('awaiting-funds');
    expect(w.events.slice(count)).toMatchObject([{ kind: 'facility', amount: cost }]);
  });
});
