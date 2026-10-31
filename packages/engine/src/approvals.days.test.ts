import { describe, expect, it } from 'vitest';
import { advanceDays, completeRound, createWorld, prepareRound } from './index';
import { approvalWait } from './approvals';
import { pendingDecisions } from './stopping';

const world = () =>
  createWorld({
    country: 'ENG',
    name: 'Waits',
    color: '#224466',
    seed: 'approval-waits',
    level: 'normal',
  });

describe('approval waiting days on the calendar (→STAFF-48)', () => {
  it('counts on every settled day, on both day paths', () => {
    const w = world();
    let prepared = 0,
      carried = 0;
    for (let day = 0; day < 16; day++) {
      const before = new Map(
        pendingDecisions(w).map((item) => [item.id, approvalWait(w, item.id)]),
      );
      if (prepareRound(w, () => undefined, false)) {
        prepared++;
        completeRound(w, undefined);
      } else advanceDays(w, 1, undefined, false);
      for (const item of pendingDecisions(w)) {
        const waited = before.get(item.id);
        // Still waiting from yesterday: one day more. Arrived today: none yet, or one when it came
        // before the day's club business counted.
        if (waited === undefined) expect(approvalWait(w, item.id)).toBeLessThanOrEqual(1);
        else expect(approvalWait(w, item.id)).toBe(waited + 1);
        if (waited !== undefined) carried++;
      }
    }
    expect(prepared).toBeGreaterThan(0);
    expect(carried).toBeGreaterThan(0);
  });
});
