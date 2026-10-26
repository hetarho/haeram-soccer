import { describe, expect, it } from 'vitest';
import type { World } from '../../contracts/src/types';
import { advanceRound, simulateSeason } from './index';
import { legacySettings } from './responsibilities';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import { finance, world } from './business.testkit';

/** A world after its season's league rounds, played unobserved: the close is left to the test. */
function beforeClose(id: string, setup: (w: World) => void) {
  return cachedWorld(id, () => {
    const w = world();
    setup(w);
    while (w.round < 46 && !w.bankrupt) advanceRound(w, undefined, false);
    return w;
  });
}

describe('business delegation and cash warnings', () => {
  it('reminds an owner of empty open slots when a season starts, but not a delegating one', () => {
    const owner = beforeClose('owner-before-close', () => {});
    simulateSeason(owner);
    // Other season-start notices (a promotion clause's wage change) never ask for attention.
    const reminders = finance(owner).filter((item) => item.year === owner.year && item.attention);
    expect(reminders).toEqual([expect.objectContaining({ title: '후원 계약이 비어 있어요' })]);
    expect(reminders[0]!.detail).toMatch(/^지역 후원 자리가 비어 있어요/);
    const delegated = beforeClose('delegated-before-close', (w) => {
      w.intervention = 4;
      w.settings = legacySettings(4);
    });
    simulateSeason(delegated);
    expect(finance(delegated).every((item) => !item.attention)).toBe(true);
  });
});
