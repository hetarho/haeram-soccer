import { legacySettings } from './responsibilities';
import { describe, expect, it } from 'vitest';
import type { World } from '../../contracts/src/types';
import {
  advanceDays,
  clubOf,
  financialBreakdown,
  operate,
  simulateSeason,
  SPONSOR_CONFIG,
  sponsorOffers,
  sponsorSlots,
} from './index';
import { cachedWorld } from '../../../tests/fixtures/worlds';
import { club, paidIn, squadOf, toFinalRound } from './sponsors.testkit';

const slot = (w: World, id: string) => sponsorSlots(w).find((view) => view.slot === id)!;

/** A local contract signed at founding, the club then made far bigger than it signed as. */
function localGrown() {
  const w = club();
  operate(w, { type: 'sign-sponsor', slot: 'local', offer: 0 });
  const signed = structuredClone(w.sponsors![0]);
  clubOf(w).fans *= 20;
  clubOf(w).reputation += 30;
  return { w, signed };
}
/** That club after its first and second closes, and at the third season's final round. */
const localFirst = () =>
  cachedWorld('local-first', () => {
    const { w } = localGrown();
    simulateSeason(w);
    return w;
  });
const localSecond = () =>
  cachedWorld('local-second', () => {
    const w = localFirst();
    simulateSeason(w);
    return w;
  });
const localLast = () => cachedWorld('local-last', () => toFinalRound(localSecond()));

/** A 1979 amateur club whose delegated staff have lived its first day. */
function delegatedSponsors() {
  const w = club({ year: 1979 });
  w.intervention = 4;
  w.settings = legacySettings(4);
  advanceDays(w, 1, undefined, false);
  return w;
}

/** A club under 해외 마케팅 5 signing an exclusive local contract, and the same club a plain one. */
function exclusiveAndPlain() {
  const w = club();
  w.policy = { support: 3, recruitment: 3, globalMarketing: 5 };
  const plain = structuredClone(w);
  operate(w, { type: 'sign-sponsor', slot: 'local', offer: 1 });
  operate(plain, { type: 'sign-sponsor', slot: 'local', offer: 0 });
  return { w, plain };
}

describe('sponsor contracts by slot', () => {
  it('opens the shirt-front slot in England in 1979, not 1975, and stadium naming at 30,000 seats', () => {
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
    w.stadium = 3;
    expect(slot(w, 'stadium')).toMatchObject({
      open: false,
      capacity: SPONSOR_CONFIG.stadiumCapacity,
      offers: [],
    });
    w.stadium = 4;
    expect(slot(w, 'stadium').open).toBe(true);
    expect(slot(w, 'stadium').offers).toHaveLength(3);
  });

  it('keeps an amount fixed through its term, and a renewal values it anew', () => {
    const { w: start, signed } = localGrown();
    expect(signed).toMatchObject({ kind: 'stable', from: start.year, until: start.year + 3 });
    // A bigger club is offered more, but the signed amount does not move.
    expect(BigInt(sponsorOffers(start, 'local')[0].annual)).toBeGreaterThan(BigInt(signed.annual));
    // The first two seasons are built once; the third's last round and close, which end it, here.
    for (const closed of [localFirst(), localSecond()])
      expect(paidIn(closed, 'local', closed.year - 1, '지역 후원')).toBe(BigInt(signed.annual));
    const w = localLast();
    simulateSeason(w);
    expect(paidIn(w, 'local', w.year - 1, '지역 후원')).toBe(BigInt(signed.annual));
    expect(w.sponsors).toBeUndefined();
    expect(w.events.filter((e) => e.kind === 'sponsor-end')).toHaveLength(1);
    const offer = sponsorOffers(w, 'local')[0];
    operate(w, { type: 'sign-sponsor', slot: 'local', offer: 0 });
    expect(w.sponsors![0].annual).toBe(offer.annual);
    expect(offer.annual).not.toBe(signed.annual);
  });

  it('has delegated staff fill every open slot at once, and pays the kit bonus for promotion', () => {
    const start = delegatedSponsors();
    expect(start.sponsors?.map((contract) => [contract.slot, contract.kind])).toEqual([
      ['local', 'stable'],
      ['kit', 'stable'],
      ['shirt', 'stable'],
    ]);
    expect(start.inbox?.filter((item) => item.kind === 'finance')).toEqual([
      expect.objectContaining({ title: '운영팀이 후원 계약 3건을 맺었어요', attention: false }),
    ]);
    const kit = start.sponsors![1];
    // A squad this strong wins the amateur league and goes up.
    const w = cachedWorld('promoted', () => {
      const w = delegatedSponsors();
      squadOf(w, 95);
      return toFinalRound(w);
    });
    simulateSeason(w);
    expect(w.lower).toBe(false);
    expect(paidIn(w, 'shirt', 1979, '메인 스폰서 경기 보너스')).toBeGreaterThan(0n);
    expect(paidIn(w, 'kit', 1980, '용품 후원 승격 보너스')).toBe(BigInt(kit.bonus));
  });

  it('names each slot’s ledger line and lets an exclusive contract halve 해외 마케팅’s fans', () => {
    const start = exclusiveAndPlain();
    expect(start.w.sponsors![0].kind).toBe('exclusive');
    expect(start.plain.sponsors![0].kind).not.toBe('exclusive');
    // Their first 29 days are built once; the 30th is lived here.
    const { w, plain } = cachedWorld('month', () => {
      const clubs = exclusiveAndPlain();
      advanceDays(clubs.w, 29, undefined, false);
      advanceDays(clubs.plain, 29, undefined, false);
      return clubs;
    });
    advanceDays(w, 1, undefined, false);
    advanceDays(plain, 1, undefined, false);
    expect(clubOf(w).fans).toBeLessThan(clubOf(plain).fans);
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
