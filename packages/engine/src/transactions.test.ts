import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { canonical } from '../../contracts/src/index';
import { createWorld } from './index';
import { credit, debit } from './transactions';

function world() {
  const w = createWorld({
    country: 'ENG',
    name: 'Ledger Town',
    color: '#334455',
    seed: 'transactions',
    level: 'normal',
  });
  w.cash = '1000';
  w.income = '0';
  w.expense = '0';
  return w;
}

describe('credit and debit', () => {
  it('credit and debit reject negative amounts and leave the world unchanged', () => {
    const w = world(),
      before = canonical(w);
    expect(() => credit(w, '-1')).toThrow('음수 수입');
    expect(() => debit(w, '-1')).toThrow('음수 지출');
    expect(() => debit(w, '-1', true)).toThrow('음수 지출');
    expect(canonical(w)).toBe(before);
  });
  it('a non-mandatory debit beyond cash throws 보유 자금이 부족합니다. and changes nothing', () => {
    const w = world(),
      before = canonical(w);
    expect(() => debit(w, '1001')).toThrow('보유 자금이 부족합니다.');
    expect(canonical(w)).toBe(before);
    debit(w, '1000');
    expect([w.cash, w.expense]).toEqual(['0', '1000']);
  });
  it('a mandatory debit may take cash below zero', () => {
    const w = world();
    debit(w, '1500', true);
    expect([w.cash, w.income, w.expense]).toEqual(['-500', '0', '1500']);
    debit(w, '250', true);
    expect([w.cash, w.expense]).toEqual(['-750', '1750']);
  });
  it('after any sequence of credits and debits, cash = start + Σcredits − Σapplied debits, income = Σcredits, expense = Σapplied debits', () => {
    const w = world();
    const amount = fc.bigInt({ min: 0n, max: 10n ** 15n });
    const move = fc.oneof(
      fc.record({ kind: fc.constant('credit' as const), amount }),
      fc.record({ kind: fc.constant('debit' as const), amount, mandatory: fc.boolean() }),
    );
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(10n ** 15n), max: 10n ** 15n }),
        fc.array(move, { maxLength: 40 }),
        (start, moves) => {
          w.cash = start.toString();
          w.income = w.expense = '0';
          let credits = 0n,
            debits = 0n;
          for (const m of moves) {
            if (m.kind === 'credit') {
              credit(w, m.amount.toString());
              credits += m.amount;
            } else if (m.mandatory || BigInt(w.cash) >= m.amount) {
              debit(w, m.amount.toString(), m.mandatory);
              debits += m.amount;
            } else {
              expect(() => debit(w, m.amount.toString())).toThrow('보유 자금이 부족합니다.');
            }
            expect(w.cash).toBe((start + credits - debits).toString());
          }
          expect(w.income).toBe(credits.toString());
          expect(w.expense).toBe(debits.toString());
        },
      ),
      { numRuns: 200 },
    );
  });
});
