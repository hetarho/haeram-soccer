import { describe, expect, it } from 'vitest';
import { operate, simulateSeason } from './index';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';
import { simulatedWorld } from '../../../tests/fixtures/worlds';
import { FOUNDING, world } from './finance.testkit';

describe('earned, auditable club finances', () => {
  it('earns a larger surplus from commercial choices in a season with identical sporting results', () => {
    const unmanaged = simulatedWorld(FOUNDING, { seasons: 1 }, DISABLED_RELEASE);
    const managed = cachedWorld('commercial-season', () => {
      const w = world();
      operate(w, { type: 'sign-sponsor', slot: 'local', offer: 0 });
      operate(w, { type: 'ticket', price: 0.12 });
      simulateSeason(w);
      return w;
    });
    const before = unmanaged.history[0];
    const after = managed.history[0];
    expect([after.won, after.drawn, after.lost, after.rank]).toEqual([
      before.won,
      before.drawn,
      before.lost,
      before.rank,
    ]);
    // The same results either way: the difference is the commercial choices alone, not luck.
    const plain = BigInt(before.income) - BigInt(before.expense);
    const commercial = BigInt(after.income) - BigInt(after.expense);
    const sponsored = managed.events
      .filter((event) => event.year === after.year && event.kind === 'sponsor:local')
      .reduce((sum, event) => sum + BigInt(event.amount!), 0n);
    expect(sponsored).toBeGreaterThan(0n);
    expect(commercial).toBeGreaterThan(plain);
    expect(commercial).toBeGreaterThan(0n);
    expect(managed.events.filter((event) => event.kind === 'support')).toEqual([]);
  });
});
