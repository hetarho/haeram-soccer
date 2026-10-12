import { describe, expect, it } from 'vitest';
import { compactMoney, contractLine, money } from './format';

/** The euro period: 100 minor units, so an amount is written in euros and cents. */
const eur = (euros: number, cents = 0) =>
  compactMoney(String(BigInt(euros) * 100n + BigInt(cents)), 'ESP', 2000);
/** Pounds, shillings and pence: 240 minor units to the pound. */
const lsd = (pounds: number) => compactMoney(String(BigInt(pounds) * 240n), 'ENG', 1901);

/**
 * The one money notation (→WEB-67). These are the cases the engine's `moneyLabel` answers the same
 * way, so both sides of the app write an amount identically without importing each other.
 */
describe('the money notation', () => {
  it('keeps whole units below 100,000 and drops shillings, pence and cents', () => {
    // 9,999,999 minor units: a cent short of €100,000.
    expect(eur(99_999, 99)).toBe('€99,999');
    expect(lsd(12_345)).toBe('£12,345');
    expect(compactMoney(String(99_999 * 240 + 239), 'ENG', 1901)).toBe('£99,999');
    // The exact amount, which `<Money>` opens on tap or hover, keeps the minor units.
    expect(money('360000', 'ENG', 1901)).toBe('£1,500 0s 0d');
    expect(compactMoney('360000', 'ENG', 1901)).toBe('£1,500');
  });

  it('abbreviates larger sums at three significant figures, never rounding up', () => {
    expect(eur(100_000)).toBe('€100K');
    expect(eur(123_456, 78)).toBe('€123K');
    expect(eur(1_234_567)).toBe('€1.23M');
    expect(eur(12_345_678)).toBe('€12.3M');
    expect(eur(999_999_999)).toBe('€999M');
    expect(eur(1_500_000_000)).toBe('€1.50B');
    expect(lsd(1_234_567)).toBe('£1.23M');
  });

  it('writes a loss or a debt with its sign', () => {
    expect(eur(-1_500_000)).toBe('−€1.50M');
    expect(compactMoney('-12345', 'ENG', 1990)).toBe('−£123');
  });
});

describe('contract lines', () => {
  it('names the season whose close ends a contract', () => {
    expect(contractLine(1951, 1950)).toBe('계약 이번 시즌(1950/51) 끝까지');
    expect(contractLine(1953, 1950)).toBe('계약 1952/53 시즌 끝까지');
    expect(contractLine(2000, 1998)).toBe('계약 1999/00 시즌 끝까지');
  });
});
