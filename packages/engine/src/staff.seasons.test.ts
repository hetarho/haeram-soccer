import { describe, expect, it } from 'vitest';
import { validateWorld } from '../../contracts/src/index';
import { cachedWorld } from '../../../tests/fixtures/worlds';
import { simulateSeason, STAFF_ROLES } from './index';
import { lastRound, world } from './staff.testkit';

describe('coaching staff', () => {
  it('keeps the club staffed through simulated seasons and stays valid', () => {
    const w = cachedWorld('staff-seasons', () => lastRound(simulateSeason(world('staff-seasons'))));
    simulateSeason(w);
    expect(w.staff!.map((member) => member.role)).toEqual(STAFF_ROLES);
    expect(w.staff!.every((member) => member.until === w.year + 1)).toBe(true);
    validateWorld(w);
  });
});
