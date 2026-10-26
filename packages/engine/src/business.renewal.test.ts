import { describe, expect, it } from 'vitest';
import { advanceDays, advanceRound, simulateSeason } from './index';
import { legacySettings } from './responsibilities';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import { world } from './business.testkit';

describe('business delegation and cash warnings', () => {
  it('signs again once a contract has run its term, valued anew', () => {
    const start = () => {
      const w = world();
      w.intervention = 4;
      w.settings = legacySettings(4);
      advanceDays(w, 1);
      return w;
    };
    const first = start().sponsors![0];
    // The same club two seasons and a third's league rounds on; the third close runs here.
    const w = cachedWorld('delegated-third-close', () => {
      const w = start();
      for (let season = 0; season < 2; season++) simulateSeason(w);
      while (w.round < 46 && !w.bankrupt) advanceRound(w, undefined, false);
      return w;
    });
    simulateSeason(w);
    expect(w.events.filter((e) => e.kind === 'sponsor-end')).toHaveLength(1);
    expect(w.sponsors).toEqual([
      expect.objectContaining({ slot: 'local', from: w.year, until: w.year + 3 }),
    ]);
    expect(w.sponsors![0].annual).not.toBe(first.annual);
  });
});
