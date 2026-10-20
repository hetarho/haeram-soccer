import { describe, expect, it } from 'vitest';
import { advanceDays, advanceRound, operate } from './index';
import { professionalStart } from './testing';
import { cachedWorld } from '../../../tests/fixtures/worlds';
import { world } from './finance.testkit';

describe('earned, auditable club finances', () => {
  it('earns sponsor money once per played league match instead of receiving a full annual grant', () => {
    const start = () => {
      const w = professionalStart(world());
      operate(w, { type: 'sign-sponsor', slot: 'local', offer: 0 });
      return w;
    };
    const signed = start();
    const annual = signed.sponsors![0].annual;
    const paid = (world: typeof signed) =>
      world.events.filter((event) => event.kind === 'sponsor:local').map((event) => event.amount);
    expect(signed.income).toBe('0');
    advanceDays(signed, 6, undefined, false);
    expect(paid(signed)).toEqual([]);
    // The same start, its first league round and then the whole season played.
    const { first, w } = cachedWorld('sponsored-season', () => {
      const w = start();
      advanceDays(w, 6, undefined, false);
      advanceRound(w, undefined, false);
      const first = structuredClone(w);
      while (w.round < 46) advanceRound(w, undefined, false);
      return { first, w };
    });
    expect(paid(first)).toHaveLength(1);
    expect(BigInt(paid(first)[0]!)).toBeLessThan(BigInt(annual) / 40n);
    // One ledger entry of the season holds every installment, adding up to the annual amount.
    expect(paid(w)).toEqual([annual]);
    expect(w.sponsors![0].lastPaid).toBe(w.year);
    const oldSave = world();
    operate(oldSave, { type: 'sign-sponsor', slot: 'local', offer: 0 });
    oldSave.sponsors![0].lastPaid = oldSave.year;
    advanceRound(oldSave, undefined, false);
    expect(paid(oldSave)).toEqual([]);
  });
});
