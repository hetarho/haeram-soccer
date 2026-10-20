import { describe, expect, it } from 'vitest';
import { cachedWorld } from '../../../tests/fixtures/worlds';
import { simulateSeason } from './index';
import { lastRound, world } from './staff.testkit';

describe('coach and manager careers', () => {
  it('retires a manager at 70 and keeps older saves without ages in place', () => {
    const w = cachedWorld('manager-retire', () => {
      const w = world('manager-retire');
      w.manager = { ...w.manager, born: w.year - 69, potential: w.manager.ability };
      return lastRound(w);
    });
    simulateSeason(w);
    expect(w.critical).toBeDefined();
    expect(w.manager.interim).toBe(true);
    const { w: old, ability } = cachedWorld('manager-no-age', () => {
      const old = world('manager-no-age');
      const { born: _born, potential: _potential, ...rest } = old.manager;
      void _born;
      void _potential;
      old.manager = { ...rest, since: old.year };
      const ability = old.manager.ability;
      return { w: lastRound(old), ability };
    });
    simulateSeason(old);
    expect(old.manager.ability).toBe(ability);
  });
});
