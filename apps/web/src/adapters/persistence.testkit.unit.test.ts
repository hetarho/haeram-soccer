import { describe, expect, it } from 'vitest';
import { canonical } from '../../../../packages/contracts/src/index';
import type { SeasonArchive, World } from '../../../../packages/contracts/src/types';
import { operate } from '../../../../packages/engine/src/operations';
import { seasonTurnover } from '../../../../packages/engine/src/finance-read';
import { supportCodecOwner } from './persistence.testkit';

/** Minimal state read by the real public injection command; no world/season generation. */
function ownerState(): World {
  return {
    year: 1950,
    round: 0,
    revision: 7,
    playerClub: 'ENG:3:0:0',
    currency: 'GBP-LSD',
    cash: '10000',
    income: '0',
    expense: '0',
    events: [],
    history: [],
    ownMatches: [],
    manager: { trust: 40 },
    owner: {
      tier: 'oil',
      traits: [],
      fortune: '100000000',
      stake: 0,
      dividendShare: 0,
      fanMood: 60,
      fanCrisis: { rounds: 3 },
      ffpInjections: [],
      seasonRecords: [],
      takeover: {
        year: 1950,
        clubId: 'ENG:3:0:0',
        price: '3667343',
        debt: '0',
        fortune: '103667343',
        currency: 'GBP-LSD',
      },
    },
  } as unknown as World;
}

describe('explicit long-codec owner support', () => {
  it('uses meaningful takeover capital through real commands with exact accounting', () => {
    const w = ownerState();
    const receipts = supportCodecOwner(w);
    expect(receipts).toHaveLength(4);
    expect(receipts.map((r) => [r.amount, r.source, r.before.mood, r.after.mood])).toEqual([
      ['366735', 'takeover-price', 60, 70],
      ['366735', 'takeover-price', 70, 80],
      ['366735', 'takeover-price', 80, 90],
      ['366735', 'takeover-price', 90, 100],
    ]);
    for (const r of receipts) {
      expect(BigInt(r.before.fortune) - BigInt(r.after.fortune)).toBe(BigInt(r.amount));
      expect(BigInt(r.after.cash) - BigInt(r.before.cash)).toBe(BigInt(r.amount));
      expect(BigInt(r.after.income) - BigInt(r.before.income)).toBe(BigInt(r.amount));
      expect(r.after.revision).toBe(r.before.revision + 1);
    }
    expect(w.owner!.fortune).toBe('98533060');
    expect(w.cash).toBe('1476940');
    expect(w.income).toBe('1466940');
    expect(w.revision).toBe(11);
    expect(w.events.filter((e) => e.kind === 'owner-injection').map((e) => e.amount)).toEqual(
      Array(4).fill('366735'),
    );
    expect(w.events.filter((e) => e.kind === 'fan-mood')).toHaveLength(4);
    expect(seasonTurnover(w)).toBe(0n);
    expect(w.owner!.fanCrisis).toEqual({ rounds: 3 });
    expect(w.manager.trust).toBe(40);
    expect([w.owner!.stake, w.owner!.dividendShare]).toEqual([0, 0]);
    expect([w.ended, w.bankrupt]).toEqual([undefined, undefined]);
  });

  it('budgets enough genuine capital for the fans’ actual injection response', () => {
    const w = ownerState();
    w.owner!.fanDisposition = { results: 30, identity: 30, finance: 30, stars: 10 };
    w.owner!.fortune = '2200409';
    const before = canonical(w);
    expect(() => supportCodecOwner(w)).toThrow();
    expect(canonical(w)).toBe(before);

    w.owner!.fortune = '2200410';
    const receipts = supportCodecOwner(w);
    expect(receipts.map((receipt) => receipt.after.mood)).toEqual([67, 74, 81, 88, 95, 100]);
    expect(w.owner!.fortune).toBe('0');
  });

  it('ceil-rounds a genuine turnover budget excluding earlier owner capital', () => {
    const w = ownerState();
    w.year = 1951;
    w.owner!.fanMood = 95.5;
    w.history = [{ year: 1950, currency: w.currency, income: '1000003' } as SeasonArchive];
    w.events.push({
      year: 1950,
      round: 0,
      kind: 'owner-injection',
      title: 'Earlier capital',
      detail: '',
      amount: '200000',
      currency: w.currency,
    });
    const [receipt] = supportCodecOwner(w);
    expect(receipt).toMatchObject({ source: 'turnover', basis: '800003', amount: '80001' });
    expect(receipt.after.mood).toBe(100);
    expect(BigInt(w.owner!.fortune)).toBe(100000000n - 80001n);
    expect(w.events.at(-2)).toMatchObject({ kind: 'owner-injection', amount: '80001', year: 1951 });
  });

  it('retains current takeover turnover before the first owned season closes', () => {
    const w = ownerState();
    w.owner!.takeover.lastIncome = '1234567';
    const receipts = supportCodecOwner(w);
    expect(receipts.every((r) => r.source === 'turnover' && r.amount === '123457')).toBe(true);
    expect(w.owner!.fanMood).toBe(100);
  });

  it('checks the whole capital budget before spending anything unaffordable', () => {
    const w = ownerState();
    w.owner!.fortune = '1466939';
    const before = canonical(w);
    expect(() => supportCodecOwner(w)).toThrow();
    expect(canonical(w)).toBe(before);
  });

  it('makes no command when a live owner is already fully supported', () => {
    const w = ownerState();
    w.owner!.fanMood = 100;
    const before = canonical(w);
    expect(supportCodecOwner(w)).toEqual([]);
    expect(canonical(w)).toBe(before);
  });

  it.each(['fans', 'owner', 'club'] as const)(
    'never funds a career already ended by %s',
    (ended) => {
      const w = ownerState();
      w.ended = ended;
      const before = canonical(w);
      expect(() => supportCodecOwner(w)).toThrow();
      expect(() => operate(w, { type: 'owner-inject', amount: '366735' })).toThrow();
      expect(canonical(w)).toBe(before);
    },
  );
});
