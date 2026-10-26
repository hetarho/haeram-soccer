import { legacySettings } from './responsibilities';
import { describe, expect, it } from 'vitest';
import { validateWorld } from '../../contracts/src/index';
import type { Founding, ManagerStyle, World } from '../../contracts/src/types';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';
import { simulatedWorld } from '../../../tests/fixtures/worlds';
import {
  advanceRound,
  coachProspect,
  createWorld,
  dailyStaff,
  financialBreakdown,
  makeManager,
  MANAGER_CAREER,
  MANAGER_GONE,
  MANAGER_STYLES,
  managerOffers,
  managerRenewal,
  managerTrait,
  MARKET_BANDS,
  type MatchModelRelease,
  operate,
  quote,
  ratio,
  renewalDay,
  simulateSeason,
  STYLE_INFO,
} from './index';

/**
 * The test club, on the pre-feature path: managers, not the match model, are the subject. `found`
 * is `createWorld` for a world only searched through, so it is not kept on disk.
 */
function world(
  seed = 'manager-schools',
  found: (input: Founding, release: MatchModelRelease) => World = (input, release) =>
    simulatedWorld(input, {}, release),
) {
  const w = found(
    {
      country: 'ENG',
      name: 'Dugout Athletic',
      color: '#224466',
      seed,
      level: 'easy' as const,
    },
    DISABLED_RELEASE,
  );
  w.cash = '999999999';
  return w;
}

/** Every season's offers for a handful of seeds, on one world so only the draws differ. */
function market(seeds = 12, seasons = 30) {
  const w = world();
  return Array.from({ length: seeds }, (_, n) =>
    Array.from({ length: seasons }, (_, s) => {
      const draw = { ...w, seed: `school-${n}`, year: 1950 + s * 3 };
      return managerOffers(draw).map((offer, i) => ({ draw, offer, index: i + 1 }));
    }),
  ).flat(2);
}

/** A new club whose first season offers a firefighter, with him hired. */
function withFirefighter(seed: string) {
  return cachedWorld(`firefighter:${seed}`, () => {
    for (let n = 0; ; n++) {
      const w = world(`${seed}-${n}`, createWorld),
        candidate = managerOffers(w).findIndex((offer) => offer.style === 'firefighter');
      if (candidate < 0) continue;
      operate(w, { type: 'hire', id: managerOffers(w)[candidate].id });
      return w;
    }
  });
}

/** Plays the season up to its last round as `simulateSeason` does, which then plays that round and closes. */
function lastRound(w: World) {
  while (w.round < 45 && !w.bankrupt) advanceRound(w, undefined, false);
  return w;
}

/** Moves the clock to this season's 1 April and runs that day's staff business. */
function april(w: World) {
  w.calendar = { day: renewalDay(w.year) };
  dailyStaff(w);
}

const ownReminder = (w: World) =>
  (w.inbox || []).filter((item) => item.kind === 'staff-renewal' && item.ref === w.manager.id);

/** Level 4 with every coaching department kept by volunteers: only the manager post moves money. */
function managerToStaff(w: World) {
  w.intervention = 4;
  w.settings = legacySettings(4);
  w.direction = { coaches: 'volunteer' };
}

describe('manager schools', () => {
  it('draws every candidate within the bands of his school', () => {
    const seen = new Set<ManagerStyle>();
    for (const { draw, offer, index } of market()) {
      const bands = { ...MARKET_BANDS, ...STYLE_INFO[offer.style].bands },
        age = draw.year - offer.born!,
        within = (value: number, [low, high]: readonly [number, number]) =>
          value >= low && value <= high;
      seen.add(offer.style);
      expect(within(offer.youth, bands.youth), `${offer.style} youth ${offer.youth}`).toBe(true);
      expect(within(offer.flexibility, bands.flexibility), offer.style).toBe(true);
      expect(within(offer.pride, bands.pride), offer.style).toBe(true);
      expect(within(age, bands.ages), `${offer.style} age ${age}`).toBe(true);
      expect(offer.trust).toBe(65);
      // His peak is the level he reaches (→STAFF-16): a peak in the band, run through his own
      // career stream, gives exactly the ability, ceiling and age he shows.
      const key = `${draw.seed}:manager-age:${draw.year}:${index}`,
        [low, high] = bands.peak;
      const peak = Array.from({ length: high - low + 1 }, (_, k) => low + k).find((value) => {
        const career = coachProspect(key, value, bands.ages, MANAGER_CAREER.prime);
        return (
          career.ability === offer.ability &&
          career.potential === offer.potential &&
          career.age === age
        );
      });
      expect(peak, `${offer.style} ${offer.ability}/${offer.potential} at ${age}`).toBeDefined();
      if (age >= MANAGER_CAREER.prime) expect(offer.potential).toBe(offer.ability);
    }
    expect(seen).toEqual(new Set(MANAGER_STYLES));
  });

  it('keeps the id, name and philosophy of the school-free draw', () => {
    for (const { draw, offer, index } of market(4, 12)) {
      const plain = makeManager('ENG', draw.seed, draw.year, index),
        banded = makeManager('ENG', draw.seed, draw.year, index, offer.style);
      expect([banded.id, banded.name, banded.philosophy]).toEqual([
        plain.id,
        plain.name,
        plain.philosophy,
      ]);
      expect([offer.id, offer.name]).toEqual([plain.id, plain.name]);
    }
  });

  it('sends veteran firefighters at their peak and young head coaches', () => {
    const offers = market().map(({ draw, offer }) => ({ ...offer, age: draw.year - offer.born! }));
    const firefighters = offers.filter((offer) => offer.style === 'firefighter');
    expect(firefighters.length).toBeGreaterThan(20);
    for (const offer of firefighters) {
      expect(offer.age).toBeGreaterThanOrEqual(50);
      expect(offer.potential).toBe(offer.ability);
      expect(offer.ability).toBeGreaterThanOrEqual(55);
    }
    for (const offer of offers.filter((offer) => offer.style === 'headcoach'))
      expect(offer.age).toBeLessThanOrEqual(48);
  });

  it('never gives developers or firefighters the youth habit, nor pressers the stable one', () => {
    const habits = new Map<ManagerStyle, Set<string>>();
    for (const { offer } of market()) {
      const seen = habits.get(offer.style) ?? new Set<string>();
      habits.set(offer.style, seen.add(offer.trait ?? 'none'));
    }
    expect(habits.get('developer')!.has('youth')).toBe(false);
    expect(habits.get('firefighter')!.has('youth')).toBe(false);
    expect(habits.get('gegenpress')!.has('stable')).toBe(false);
    expect(habits.get('positional')).toEqual(new Set(['youth', 'rotation', 'stable', 'none']));
    // The same draw is remapped, not redrawn, and only where the school maps it.
    const w = world();
    let remapped = 0;
    for (let year = 1950; year < 2050; year++)
      for (let index = 1; index <= 4; index++) {
        const season = { ...w, year },
          drawn = managerTrait(season, index);
        if (drawn === 'youth') {
          remapped++;
          expect(managerTrait(season, index, 'firefighter')).toBe('stable');
          expect(managerTrait(season, index, 'developer')).toBeUndefined();
        }
        if (drawn === 'stable') expect(managerTrait(season, index, 'gegenpress')).toBe('rotation');
        expect(managerTrait(season, index, 'counter')).toBe(drawn);
      }
    expect(remapped).toBeGreaterThan(0);
  });
});

describe('the firefighter contract', () => {
  it('lets an unrenewed firefighter go at the close after a 1 April reminder', () => {
    const start = withFirefighter('firefighter-leaves'),
      hired = start.manager,
      year = start.year;
    expect(hired.until).toBe(year + 1);
    const w = cachedWorld('firefighter-leaves', () =>
      lastRound(withFirefighter('firefighter-leaves')),
    );
    simulateSeason(w);
    const reminder = w.inbox!.find(
      (item) => item.kind === 'staff-renewal' && item.ref === hired.id,
    );
    expect(reminder).toMatchObject({
      year,
      day: renewalDay(year),
      attention: true,
      title: `소방수 ${hired.name} 감독 계약이 이번 시즌 끝에 끝나요`,
    });
    expect(reminder!.detail).toMatch(
      /^재계약하지 않으면 시즌이 끝날 때 떠나고 임시 감독이 팀을 맡아요 \(연봉 .+ · 계약금 .+ · 1시즌\)$/,
    );
    // Once he has gone the reminder is settled, so it no longer waits for an answer.
    expect(reminder!.read).toBe(true);
    expect(w.year).toBe(year + 1);
    expect(w.manager.interim).toBe(true);
    expect(w.critical).toBe(MANAGER_GONE);
    const departure = w.events.find(
      (event) => event.kind === 'manager-departure' && event.title.startsWith(hired.name),
    );
    expect(departure?.detail).toBe(
      `${year}–${year + 1} · 시즌 종료까지의 단기 계약을 마치고 떠났습니다.`,
    );
    // An interim is never kept on.
    expect(managerRenewal(w)).toBeUndefined();
    expect(() => operate(w, { type: 'renew-manager' })).toThrow(
      '재계약할 수 있는 감독이 아닙니다.',
    );
    validateWorld(w);
  });

  it('keeps a renewed firefighter one more season at the going wage for a 10% fee', () => {
    const w = withFirefighter('firefighter-stays'),
      { id, name, ability } = w.manager,
      year = w.year,
      cash = BigInt(w.cash),
      wage = quote('ENG', year, 120 + ability),
      fee = ratio(wage, 1n, 10n);
    // A firefighter signs one season at a time.
    expect(managerRenewal(w)).toEqual({ wage, fee, until: year + 2, limit: 1 });
    operate(w, { type: 'renew-manager' });
    expect(w.manager).toMatchObject({ id, wage, until: year + 2 });
    expect(BigInt(w.cash)).toBe(cash - BigInt(fee));
    expect(w.events.at(-1)).toMatchObject({
      kind: 'manager-renew',
      title: '감독 재계약',
      detail: `${name} 재계약 · ${year + 1}/${String(year + 2).slice(2)} 시즌 끝까지`,
      amount: fee,
    });
    // The fee has its own line in the season's books.
    const books = financialBreakdown(w).expense;
    expect(books.find((row) => row.key === 'manager-renew')?.amount).toBe(fee);
    expect(books.some((row) => row.key === 'older-ledger')).toBe(false);
    // Extended past this season's close: nothing to renew until the next one.
    expect(managerRenewal(w)).toBeUndefined();
    expect(() => operate(w, { type: 'renew-manager' })).toThrow('재계약');
    // The same renewal played on to the season's last round.
    const season = cachedWorld('firefighter-stays', () => {
      const w = withFirefighter('firefighter-stays');
      operate(w, { type: 'renew-manager' });
      return lastRound(w);
    });
    simulateSeason(season);
    expect(season.manager.id).toBe(id);
    expect(season.manager.interim).toBe(false);
    expect(season.critical).toBeUndefined();
    expect(season.inbox!.some((item) => item.ref === id && item.kind === 'staff-renewal')).toBe(
      false,
    );
    // One season at a time: his deal now ends at this season's close and can be renewed again.
    expect(managerRenewal(season)?.until).toBe(season.year + 2);
    validateWorld(season);
  });

  it('refuses an unaffordable renewal without touching the club', () => {
    const w = withFirefighter('firefighter-broke');
    w.cash = '0';
    const before = JSON.stringify(w);
    expect(() => operate(w, { type: 'renew-manager' })).toThrow('보유 자금이 부족합니다.');
    expect(JSON.stringify(w)).toBe(before);
  });

  it('reminds the owner on 1 April even without coaching staff', () => {
    const w = withFirefighter('firefighter-april');
    delete w.staff;
    w.calendar = { day: renewalDay(w.year) - 1 };
    dailyStaff(w);
    expect(ownReminder(w)).toHaveLength(0);
    april(w);
    expect(ownReminder(w)).toHaveLength(1);
    expect(ownReminder(w)[0].attention).toBe(true);
    expect(ownReminder(w)[0].read).toBeUndefined();
    expect(ownReminder(w)[0].detail).toContain('· 1시즌)');
    // Renewing answers the reminder.
    operate(w, { type: 'renew-manager' });
    expect(ownReminder(w)[0].read).toBe(true);
    expect(w.manager.until).toBe(w.year + 2);
    // A founding manager mid-contract hears nothing.
    const plain = world('three-seasons-april');
    april(plain);
    expect((plain.inbox || []).filter((item) => item.kind === 'staff-renewal')).toHaveLength(0);
  });

  it('lets delegated staff renew him on 1 April when the club can afford it', () => {
    const w = withFirefighter('firefighter-delegated');
    // No free agent is 3 better, so the staff keep him (→STAFF-18).
    w.manager.ability = 90;
    const { id, ability } = w.manager;
    managerToStaff(w);
    const cash = BigInt(w.cash),
      wage = quote('ENG', w.year, 120 + ability);
    april(w);
    expect(w.manager).toMatchObject({ id, wage, until: w.year + 2 });
    expect(BigInt(w.cash)).toBe(cash - BigInt(ratio(wage, 1n, 10n)));
    expect(ownReminder(w)).toHaveLength(0);
    expect(w.inbox!.at(-1)).toMatchObject({
      kind: 'staff-report',
      attention: false,
      title: `소방수 ${w.manager.name} 감독 재계약`,
    });
    // Without the money the owner is told instead, and why the staff held back.
    const broke = withFirefighter('firefighter-delegated-broke');
    managerToStaff(broke);
    broke.cash = '0';
    april(broke);
    expect(broke.manager.until).toBe(broke.year + 1);
    expect(ownReminder(broke)[0]).toMatchObject({ attention: true });
    expect(ownReminder(broke)[0].detail).toContain('자금 여력이 부족해 단장이 재계약하지 않았어요');
  });
});
