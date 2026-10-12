import { describe, expect, it } from 'vitest';
import { validateWorld } from '../../contracts/src/index';
import type { World } from '../../contracts/src/types';
import { currency, LOAD_CATALOG, priceIndex } from '../../catalogs/src/index';
import {
  activePlayers,
  advanceDays,
  clubOf,
  createWorld,
  currentDay,
  financialBreakdown,
  operate,
  prepareSeason,
  quote,
  seasonDayOf,
  simulateSeason,
  SPONSOR_CONFIG,
  sponsorOffers,
  sponsorSlots,
} from './index';
import { professionalStart } from './testing';

/** A club founded in 1950, moved to `year` and to the lowest professional division if asked. */
function club({ year, professional = false }: { year?: number; professional?: boolean } = {}) {
  const w = createWorld({
    country: 'ENG',
    name: 'Slot Town',
    color: '#335544',
    seed: 'sponsors',
    difficulty: 2,
  });
  // The squad stays as founded, so results follow only what a test sets.
  w.delegation = { ...w.delegation, transfers: false };
  if (year) {
    w.year = year;
    w.currency = currency('ENG', year).code;
    w.priceIndex = priceIndex('ENG', year).value;
    w.manager.since = year;
    w.manager.until = year + 3;
    for (const p of w.players) {
      p.born = year - 24;
      p.until = year + 2;
    }
  }
  if (professional) professionalStart(w);
  else if (year) prepareSeason(w);
  return w;
}
const slot = (w: World, id: string) => sponsorSlots(w).find((view) => view.slot === id)!;
/** Base installments a slot's contract paid in a season, its bonuses apart. */
const paidIn = (w: World, id: string, year: number, title: string) =>
  w.events
    .filter((e) => e.kind === `sponsor:${id}` && e.year === year && e.title === title)
    .reduce((sum, e) => sum + BigInt(e.amount!), 0n);
/** Every player of the squad at one skill, to decide where the season ends. */
function squadOf(w: World, skill: number) {
  for (const p of activePlayers(w)) {
    p.attack = p.passing = p.defense = p.keeper = p.stamina = skill;
    p.potential = skill;
  }
}

describe('sponsor contracts by slot', () => {
  it('opens the shirt-front slot in England in 1979, not 1975, and stadium naming at facilities 10+', () => {
    const w = club();
    w.year = 1975;
    expect(slot(w, 'shirt')).toMatchObject({ open: false, opens: 1979, offers: [] });
    expect(() => operate(w, { type: 'sign-sponsor', slot: 'shirt', offer: 0 })).toThrow('열리지');
    // The kit slot has opened in 1970 and pays its bonus for a promotion or title.
    expect(slot(w, 'kit').offers.map((offer) => offer.kind)).toEqual([
      'stable',
      'performance',
      'exclusive',
      'indexed',
    ]);
    // A slot without a bonus offers no performance-linked contract.
    expect(slot(w, 'local').offers.map((offer) => offer.kind)).toEqual([
      'stable',
      'exclusive',
      'indexed',
    ]);
    w.year = 1979;
    const shirt = slot(w, 'shirt');
    expect(shirt.open).toBe(true);
    const [stable, performance] = shirt.offers;
    expect(BigInt(performance.annual)).toBeLessThan(BigInt(stable.annual));
    expect(BigInt(performance.bonus)).toBeGreaterThan(BigInt(stable.bonus));
    // Each slot offers its share of one commercial value: the shirt front 45%, local partners 10%.
    expect(Number(stable.annual) / Number(slot(w, 'local').offers[0].annual)).toBeCloseTo(4.5, 2);
    for (const offer of [...shirt.offers, ...slot(w, 'local').offers])
      expect(offer.until - w.year).toBe(offer.term);
    w.year = 1997;
    w.facilities = SPONSOR_CONFIG.stadiumFacilities - 1;
    expect(slot(w, 'stadium')).toMatchObject({ open: false, facilities: 10, offers: [] });
    w.facilities++;
    expect(slot(w, 'stadium').open).toBe(true);
    expect(slot(w, 'stadium').offers).toHaveLength(3);
  });

  it('keeps an amount fixed through its term, and a renewal values it anew', () => {
    const w = club();
    operate(w, { type: 'sign-sponsor', slot: 'local', offer: 0 });
    const signed = structuredClone(w.sponsors![0]);
    expect(signed).toMatchObject({ kind: 'stable', from: w.year, until: w.year + 3 });
    // A bigger club is offered more, but the signed amount does not move.
    clubOf(w).fans *= 20;
    clubOf(w).reputation += 30;
    expect(BigInt(sponsorOffers(w, 'local')[0].annual)).toBeGreaterThan(BigInt(signed.annual));
    for (let season = 0; season < 3; season++) {
      simulateSeason(w);
      expect(paidIn(w, 'local', w.year - 1, '지역 후원')).toBe(BigInt(signed.annual));
    }
    expect(w.sponsors).toBeUndefined();
    expect(w.events.filter((e) => e.kind === 'sponsor-end')).toHaveLength(1);
    const offer = sponsorOffers(w, 'local')[0];
    operate(w, { type: 'sign-sponsor', slot: 'local', offer: 0 });
    expect(w.sponsors![0].annual).toBe(offer.annual);
    expect(offer.annual).not.toBe(signed.annual);
  });

  it('cuts every running contract’s remaining seasons by 30% on relegation', () => {
    const w = club({ professional: true });
    operate(w, { type: 'sign-sponsor', slot: 'local', offer: 2 });
    expect(w.sponsors![0]).toMatchObject({ kind: 'indexed', until: w.year + 5 });
    // A squad this weak finishes in the last division's bottom two and drops to the amateur league.
    squadOf(w, 5);
    simulateSeason(w);
    expect(w.lower).toBe(true);
    // Four seasons were left; 70% of them, rounded, remain.
    expect(w.sponsors![0].until).toBe(w.year + 3);
    expect(w.events.findLast((e) => e.kind === 'sponsor-cut')?.detail).toContain(
      '남은 4시즌 → 3시즌',
    );
  });

  it('pays a sponsor migrated from rules 1.15 on to its end', () => {
    const w = club();
    const annual = quote('ENG', w.year, 300);
    // Rules 1.15 kept one sponsor; a load moves it into its slot (→SAVE-10).
    w.sponsor = {
      name: 'Slot Cooperative',
      kind: 'stable',
      annual,
      bonus: '0',
      until: w.year + 2,
      lastPaid: w.year - 1,
      index: w.priceIndex,
    };
    const loaded = validateWorld(structuredClone(w), LOAD_CATALOG);
    expect(loaded.sponsor).toBeUndefined();
    expect(loaded.sponsors).toEqual([
      expect.objectContaining({ slot: 'local', annual, from: w.year, until: w.year + 2 }),
    ]);
    simulateSeason(loaded);
    expect(paidIn(loaded, 'local', w.year, '지역 후원')).toBe(BigInt(annual));
    expect(loaded.sponsors).toHaveLength(1);
    simulateSeason(loaded);
    expect(paidIn(loaded, 'local', w.year + 1, '지역 후원')).toBe(BigInt(annual));
    expect(loaded.sponsors).toBeUndefined();
    expect(loaded.events.filter((e) => e.kind === 'sponsor-end')).toHaveLength(1);
  });

  it('has delegated staff fill every open slot at once, and pays the kit bonus for promotion', () => {
    const w = club({ year: 1979 });
    w.delegation = { ...w.delegation, business: true };
    advanceDays(w, 1, undefined, false);
    expect(w.sponsors?.map((contract) => [contract.slot, contract.kind])).toEqual([
      ['local', 'stable'],
      ['kit', 'stable'],
      ['shirt', 'stable'],
    ]);
    expect(w.inbox?.filter((item) => item.kind === 'finance')).toEqual([
      expect.objectContaining({ title: '운영팀이 후원 계약 3건을 맺었어요', attention: false }),
    ]);
    const kit = w.sponsors![1];
    // A squad this strong wins the amateur league and goes up.
    squadOf(w, 95);
    simulateSeason(w);
    expect(w.lower).toBe(false);
    expect(paidIn(w, 'shirt', 1979, '메인 스폰서 경기 보너스')).toBeGreaterThan(0n);
    expect(paidIn(w, 'kit', 1980, '용품 후원 승격 보너스')).toBe(BigInt(kit.bonus));
  });

  it('tells an owner on 1 April of a contract in its final season, but not a delegating one', () => {
    const owner = club();
    operate(owner, { type: 'sign-sponsor', slot: 'local', offer: 0 });
    owner.sponsors![0].until = owner.year + 1;
    const delegated = structuredClone(owner);
    delegated.delegation = { ...delegated.delegation, business: true };
    const april = seasonDayOf(owner.year, 4, 1);
    for (const w of [owner, delegated]) {
      while (currentDay(w) < april)
        advanceDays(w, Math.min(300, april - currentDay(w)), undefined, false);
      advanceDays(w, 3, undefined, false);
    }
    const ending = (w: World) => (w.inbox ?? []).filter((item) => item.kind === 'sponsor-ending');
    expect(ending(owner)).toEqual([
      expect.objectContaining({
        attention: true,
        day: april,
        ref: `sponsor:local:${owner.year + 1}`,
      }),
    ]);
    expect(ending(delegated)).toEqual([]);
  });

  it('names each slot’s ledger line and lets an exclusive contract block merchandise campaigns', () => {
    const w = club();
    operate(w, { type: 'sign-sponsor', slot: 'local', offer: 1 });
    expect(w.sponsors![0].kind).toBe('exclusive');
    expect(() => operate(w, { type: 'campaign', kind: 'merchandise' })).toThrow('독점');
    advanceDays(w, 30, undefined, false);
    const books = financialBreakdown(w);
    expect(books.income.find((row) => row.key === 'sponsor:local')).toMatchObject({
      label: '지역 후원',
    });
    expect(BigInt(books.income.find((row) => row.key === 'sponsor:local')!.amount)).toBeGreaterThan(
      0n,
    );
    for (const id of ['kit', 'shirt', 'stadium', 'sleeve'])
      expect(books.income.some((row) => row.key === `sponsor:${id}`)).toBe(true);
    expect(books.income.some((row) => row.key === 'older-ledger')).toBe(false);
  });
});
