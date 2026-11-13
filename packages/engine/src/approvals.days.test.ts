import { describe, expect, it } from 'vitest';
import { activePlayers, advanceDays, completeRound, contractTalks, prepareRound } from './index';
import { approvalWait } from './approvals';
import { pendingDecisions } from './stopping';
import { careerWorld } from './career.testkit';
import { staffAuthority } from './testing';

const world = () => careerWorld({ seed: 'approval-waits' });

describe('approval waiting days on the calendar (→STAFF-48)', () => {
  it('counts on every settled day, on both day paths', () => {
    const w = world();
    w.settings = staffAuthority(1);
    const player = activePlayers(w).find(
      (p) => !p.loanUntil && p.retiring === undefined && !p.unhappy,
    )!;
    player.until = w.year + 1;
    contractTalks(w);
    const decision = pendingDecisions(w).find((item) => item.ref === player.id)!;
    expect(decision.kind).toBe('contract-talk');
    expect(decision.responsibility).toBe('contracts');
    let prepared = 0,
      advanced = 0,
      carried = 0;
    for (let day = 0; day < 16; day++) {
      const before = new Map(
        pendingDecisions(w).map((item) => [item.id, approvalWait(w, item.id)]),
      );
      if (prepareRound(w, () => undefined, false)) {
        prepared++;
        completeRound(w, undefined);
      } else {
        advanced++;
        advanceDays(w, 1, undefined, false);
      }
      expect(pendingDecisions(w).some((item) => item.id === decision.id)).toBe(true);
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
    expect(advanced).toBeGreaterThan(0);
    expect(carried).toBeGreaterThan(0);
  });
});
