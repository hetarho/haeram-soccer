import { describe, expect, it } from 'vitest';
import { validateWorld } from '../../contracts/src/index';
import {
  academyIntakeSize,
  developmentBase,
  facilityPartUpkeep,
  facilityWork,
  gateProjection,
  nextWork,
  operate,
  partTop,
  progressFacilityWorks,
  stadiumCapacity,
  trainingGroundTerms,
  workDays,
} from './index';
import { startWork } from './testing';
import { careerWorld } from './career.testkit';
import { clubDay } from './season';
import { settingsOf } from './responsibilities';

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

  it('rebuilds a 90,000 ground to 105,000, adds a third tier to 120,000 and ends the ladder', () => {
    const w = world('facility-elite-grounds');
    w.stadium = 8;
    const upkeep = facilityPartUpkeep(w, 'stadium');
    expect(nextWork(w, 'stadium')).toMatchObject({
      to: 9,
      kind: 'rebuild',
      capacity: 105000,
      days: 540,
      units: 915000,
    });
    startWork(w, 'stadium');
    expect(gateProjection(w).capacity).toBe(90000);
    pass(w, 'stadium', 539);
    expect(w.stadium).toBe(8);
    expect(facilityPartUpkeep(w, 'stadium')).toBe(upkeep);
    pass(w, 'stadium', 1);
    expect(w.stadium).toBe(9);
    expect(gateProjection(w).capacity).toBe(105000);
    expect(BigInt(facilityPartUpkeep(w, 'stadium'))).toBeGreaterThan(BigInt(upkeep));
    expect(w.events.at(-1)).toMatchObject({
      kind: 'facility-open',
      title: '경기장 완공 · 초대형 구장',
    });
    validateWorld(w);

    expect(nextWork(w, 'stadium')).toMatchObject({
      to: 10,
      kind: 'expansion',
      capacity: 120000,
      days: 180,
      units: 2287500,
    });
    startWork(w, 'stadium');
    expect(stadiumCapacity(w)).toBe(94500);
    validateWorld(w);
    pass(w, 'stadium', 180);
    expect(w.stadium).toBe(10);
    expect(gateProjection(w).capacity).toBe(120000);
    expect(w.events.at(-1)).toMatchObject({
      kind: 'facility-open',
      title: '경기장 완공 · 3층 스탠드',
    });
    expect(nextWork(w, 'stadium')).toBeUndefined();
    expect(() => startWork(w, 'stadium')).toThrow('최고');
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

describe('daily facility continuation (→ECON-43)', () => {
  const completionDay = 205;
  function dailyWorld() {
    const w = world();
    // Leave ordinary staff hiring and sponsor decisions to the owner in these balance fixtures.
    w.settings = settingsOf({});
    return w;
  }
  const constructionSince = (w: ReturnType<typeof world>, from: number) =>
    w.events.slice(from).filter((event) => event.kind === 'facility');

  it.each(['ended', 'bankrupt'] as const)(
    'leaves funded pending work untouched on the opening club day when %s',
    (ending) => {
      const w = dailyWorld();
      w.calendar = { day: 0 };
      startWork(w, 'training');
      w.academyFacility = 1;
      w.facilityAutoUpgrade = { academy: 'awaiting-funds' };
      w.cash = nextWork(w, 'academy')!.cost;
      if (ending === 'ended') w.ended = 'owner';
      else w.bankrupt = { year: w.year, round: 0, day: 0 };
      const { cash, expense } = w;
      const works = structuredClone(w.facilityWorks);
      const count = w.events.length;

      clubDay(w, false);

      expect(w).toMatchObject({ cash, expense });
      expect(w.facilityWorks).toEqual(works);
      expect(w.facilityAutoUpgrade).toEqual({ academy: 'awaiting-funds' });
      expect(constructionSince(w, count)).toEqual([]);
    },
  );

  it('opens the next stadium stage as a rebuild while the other parts stay independent', () => {
    const w = dailyWorld();
    w.stadium = 0;
    w.calendar = { day: completionDay - workDays('stadium', 1) };
    startWork(w, 'stadium');
    w.calendar = { day: completionDay - workDays('training', 1) };
    startWork(w, 'training');
    operate(w, { type: 'facility-auto-upgrade', part: 'stadium', enabled: true });
    operate(w, { type: 'facility-auto-upgrade', part: 'academy', enabled: true });
    const quote = nextWork({ ...w, stadium: 1 }, 'stadium')!;
    expect(quote).toMatchObject({ kind: 'rebuild', to: 2 });
    const { cash, expense } = w;
    const count = w.events.length;

    w.calendar = { day: completionDay };
    clubDay(w, false);

    expect(w.stadium).toBe(1);
    expect(w.trainingGround).toBe(1);
    expect(w.academyFacility).toBe(0);
    expect(w.facilityWorks).toEqual({ stadium: { to: 2, year: w.year, day: completionDay } });
    expect(w.facilityAutoUpgrade).toEqual({ stadium: 'armed', academy: 'armed' });
    expect(stadiumCapacity(w)).toBe(5000);
    expect(w.cash).toBe((BigInt(cash) - BigInt(quote.cost)).toString());
    expect(w.expense).toBe((BigInt(expense) + BigInt(quote.cost)).toString());
    expect(constructionSince(w, count)).toMatchObject([{ amount: quote.cost }]);
  });

  it('continues the 105,000 rebuild into the third tier and ends the chain at 120,000', () => {
    const w = dailyWorld();
    w.stadium = 8;
    w.facilityWorks = {
      stadium: { to: 9, year: w.year, day: completionDay - workDays('stadium', 9) },
    };
    w.facilityAutoUpgrade = { stadium: 'armed' };
    const quote = nextWork({ ...w, stadium: 9 }, 'stadium')!;
    expect(quote).toMatchObject({ to: 10, kind: 'expansion' });
    const { cash } = w;

    w.calendar = { day: completionDay };
    clubDay(w, false);
    expect(w.stadium).toBe(9);
    expect(w.facilityWorks).toEqual({ stadium: { to: 10, year: w.year, day: completionDay } });
    expect(w.facilityAutoUpgrade).toEqual({ stadium: 'armed' });
    expect(stadiumCapacity(w)).toBe(94500);
    expect(w.cash).toBe((BigInt(cash) - BigInt(quote.cost)).toString());

    w.facilityWorks!.stadium!.day = completionDay + 1 - workDays('stadium', 10);
    w.calendar = { day: completionDay + 1 };
    clubDay(w, false);
    expect(w.stadium).toBe(10);
    expect(w.facilityWorks).toBeUndefined();
    expect(w.facilityAutoUpgrade).toBeUndefined();
  });

  it('spends by part order and retries an unfunded completion once at exact cost', () => {
    const w = dailyWorld();
    w.stadium = w.trainingGround = w.academyFacility = 0;
    w.calendar = { day: completionDay };
    w.facilityWorks = {
      stadium: { to: 1, year: w.year, day: completionDay - workDays('stadium', 1) },
      training: { to: 1, year: w.year, day: completionDay - workDays('training', 1) },
      academy: { to: 1, year: w.year, day: completionDay - workDays('academy', 1) },
    };
    w.facilityAutoUpgrade = { academy: 'armed', training: 'armed', stadium: 'armed' };
    const stadium = nextWork({ ...w, stadium: 1 }, 'stadium')!.cost;
    const training = nextWork({ ...w, trainingGround: 1 }, 'training')!.cost;
    const academy = nextWork({ ...w, academyFacility: 1 }, 'academy')!.cost;
    const funds = BigInt(stadium) + BigInt(training);
    const expense = BigInt(w.expense);
    const count = w.events.length;
    w.cash = funds.toString();

    clubDay(w, false);

    expect(w.cash).toBe('0');
    expect(w.expense).toBe((expense + funds).toString());
    expect(constructionSince(w, count).map(({ amount }) => amount)).toEqual([stadium, training]);
    expect(w.academyFacility).toBe(1);
    expect(w.facilityWorks?.academy).toBeUndefined();
    expect(w.facilityAutoUpgrade?.academy).toBe('awaiting-funds');

    w.calendar = { day: completionDay + 1 };
    w.cash = academy;
    clubDay(w, false);
    expect(w.cash).toBe('0');
    expect(w.expense).toBe((expense + funds + BigInt(academy)).toString());
    expect(w.facilityWorks?.academy).toEqual({ to: 2, year: w.year, day: completionDay + 1 });
    expect(w.facilityAutoUpgrade?.academy).toBe('armed');
    w.calendar = { day: completionDay + 2 };
    w.cash = academy;
    clubDay(w, false);
    expect(w.cash).toBe(academy);
    expect(constructionSince(w, count).map(({ amount }) => amount)).toEqual([
      stadium,
      training,
      academy,
    ]);
  });

  it('stops at the maximum and does not restore cancelled authorization when re-enabled', () => {
    const w = dailyWorld();
    const top = partTop('training');
    w.trainingGround = top - 1;
    w.academyFacility = 1;
    w.facilityWorks = {
      training: { to: top, year: w.year, day: completionDay - workDays('training', top) },
    };
    w.facilityAutoUpgrade = { training: 'armed', academy: 'awaiting-funds' };
    const enable = { type: 'facility-auto-upgrade', part: 'academy', enabled: true } as const;
    operate(w, { ...enable, enabled: false });
    const { cash, expense } = w;
    const count = w.events.length;

    w.calendar = { day: completionDay };
    clubDay(w, false);
    expect(w.trainingGround).toBe(top);
    expect(w.facilityWorks).toBeUndefined();
    expect(w.facilityAutoUpgrade).toBeUndefined();
    expect(w).toMatchObject({ cash, expense });

    operate(w, enable);
    w.calendar = { day: completionDay + 1 };
    clubDay(w, false);
    expect(w.facilityWorks).toBeUndefined();
    expect(w.facilityAutoUpgrade).toEqual({ academy: 'armed' });
    expect(w).toMatchObject({ cash, expense });
    expect(constructionSince(w, count)).toEqual([]);
  });
});
