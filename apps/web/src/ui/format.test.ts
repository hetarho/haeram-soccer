import { describe, expect, it } from 'vitest';
import { compactMoney, contractLine, money } from './format';

describe('compact HUD money', () => {
  it('keeps whole units below 100,000 and drops shillings, pence and cents', () => {
    expect(money('360000', 'ENG', 1901)).toBe('£1,500 0s 0d');
    expect(compactMoney('360000', 'ENG', 1901)).toBe('£1,500');
    expect(compactMoney(String(99_999 * 240 + 239), 'ENG', 1901)).toBe('£99,999');
    expect(compactMoney('-12345', 'ENG', 1990)).toBe('−£123');
  });

  it('abbreviates larger sums at three significant figures, never rounding up', () => {
    expect(compactMoney(String(123_456 * 100), 'ENG', 1990)).toBe('£123K');
    expect(compactMoney(String(1_239_999 * 100), 'ENG', 1990)).toBe('£1.23M');
    expect(compactMoney(String(12_999_999 * 100), 'ENG', 1990)).toBe('£12.9M');
    expect(compactMoney(String(4_560_000_000n * 100n), 'ENG', 1990)).toBe('£4.56B');
  });
});

describe('contract lines', () => {
  it('names the season whose close ends a contract', () => {
    expect(contractLine(1951, 1950)).toBe('계약 이번 시즌(1950/51) 끝까지');
    expect(contractLine(1953, 1950)).toBe('계약 1952/53 시즌 끝까지');
    expect(contractLine(2000, 1998)).toBe('계약 1999/00 시즌 끝까지');
  });
});
