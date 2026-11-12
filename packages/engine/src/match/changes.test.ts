import { describe, expect, it } from 'vitest';
import type { Manager } from '../../../contracts/src/types';
import { subPolicyFor } from './changes';

/** Only the school, trait and interim status are read (→STAFF-45). */
const manager = (patch: Partial<Manager>) => ({ interim: false, ...patch }) as Manager;

/** The manager's substitution policy (moved from grid/changes.test.ts, T842). */
describe('substitution policy', () => {
  it('lets a gegenpress or rotation manager change tired pressers from the 55th minute', () => {
    expect(subPolicyFor(manager({ style: 'gegenpress' }))).toMatchObject({
      fatigueFrom: 55,
      earlyPress: true,
    });
    expect(subPolicyFor(manager({ trait: 'rotation' })).earlyPress).toBe(true);
    expect(subPolicyFor(manager({ style: 'gegenpress', interim: true })).earlyPress).toBe(false);
  });

  it('delays changes by ten minutes with the stable trait', () => {
    expect(subPolicyFor(manager({ trait: 'stable' })).delay).toBe(10);
  });
});
