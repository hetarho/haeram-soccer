import { describe, expect, it } from 'vitest';
import { activePlayers, contractTalks, createWorld, seasonDayOf } from './index';
import {
  APPROVAL_DEADLINE_DAYS,
  approvalDeadline,
  approvalWait,
  countApprovalWaits,
  overdueApprovals,
  overdueMoraleCost,
} from './approvals';
import { settleMorale } from './morale';
import { RESPONSIBILITY_KEYS } from './responsibilities';
import { pendingDecisions } from './stopping';
import { validateWorld } from '../../contracts/src/schema';

const valid = (input: unknown) => {
  try {
    validateWorld(input);
    return true;
  } catch {
    return false;
  }
};

const world = () =>
  createWorld({
    country: 'ENG',
    name: 'Waits',
    color: '#224466',
    seed: 'approval-waits',
    level: 'normal',
  });
/** A world whose first `n` players ask to renew at the January window (→CLUB-26). */
function asking(n = 1) {
  const w = world();
  w.calendar = { day: seasonDayOf(w.year, 1, 1) };
  for (const p of activePlayers(w).slice(0, n)) p.until = w.year + 1;
  contractTalks(w);
  return w;
}

describe('approval waiting days (→STAFF-48)', () => {
  it('writes nothing while nothing waits', () => {
    const w = world();
    expect(pendingDecisions(w)).toEqual([]);
    countApprovalWaits(w);
    expect('approvalWaits' in w).toBe(false);
  });
  it('counts each owner-held approval a day per settled day and notices it once when overdue', () => {
    const w = asking();
    const [talk] = pendingDecisions(w);
    expect(approvalWait(w, talk.id)).toBe(0);
    const notices = () =>
      (w.inbox ?? []).filter((item) => item.title.startsWith('결재 지연')).length;
    for (let day = 1; day < APPROVAL_DEADLINE_DAYS; day++) countApprovalWaits(w);
    expect(approvalWait(w, talk.id)).toBe(APPROVAL_DEADLINE_DAYS - 1);
    expect(approvalDeadline(w, talk.id)).toBe(1);
    expect(overdueApprovals(w)).toEqual([]);
    expect(notices()).toBe(0);
    countApprovalWaits(w);
    expect(overdueApprovals(w).map((item) => item.id)).toEqual([talk.id]);
    expect(notices()).toBe(1);
    const notice = w.inbox!.at(-1)!;
    expect(notice).toMatchObject({ kind: talk.kind, ref: talk.ref, attention: true });
    expect(notice.title).toContain(talk.title);
    expect(notice.detail).toContain('분위기 −1');
    countApprovalWaits(w);
    countApprovalWaits(w);
    expect(approvalDeadline(w, talk.id)).toBe(-2);
    expect(notices()).toBe(1);
    // The asking world jumped its calendar; its waits and notice still fit a saved world.
    expect(valid({ ...world(), approvalWaits: w.approvalWaits, inbox: [notice] })).toBe(true);
  });
  it('forgets an approval once answered or handed to the staff', () => {
    const w = asking();
    countApprovalWaits(w);
    expect(Object.keys(w.approvalWaits!)).toHaveLength(1);
    w.settings!.responsibilities.contracts = 'delegated';
    countApprovalWaits(w);
    expect('approvalWaits' in w).toBe(false);
    w.settings!.responsibilities.contracts = 'direct';
    countApprovalWaits(w);
    expect(Object.values(w.approvalWaits!)).toEqual([1]);
    for (const p of activePlayers(w)) delete p.talk;
    countApprovalWaits(w);
    expect('approvalWaits' in w).toBe(false);
  });
  it('leaves an all-delegated world untouched', () => {
    const w = asking();
    for (const key of RESPONSIBILITY_KEYS) w.settings!.responsibilities[key] = 'delegated';
    countApprovalWaits(w);
    expect('approvalWaits' in w).toBe(false);
  });
});

describe('overdue approvals cost squad morale (→CLUB-19)', () => {
  it('costs 1 a settled round per overdue approval, at most 3', () => {
    expect([0, 1, 2, 3, 4, 9].map(overdueMoraleCost)).toEqual([0, 1, 2, 3, 3, 3]);
    const w = asking(5);
    const pending = pendingDecisions(w);
    expect(pending.length).toBeGreaterThanOrEqual(4);
    const settled = (overdue: number) => {
      const copy = structuredClone(w);
      copy.morale = 60;
      copy.approvalWaits = Object.fromEntries(
        pending.map((item, i) => [item.id, i < overdue ? APPROVAL_DEADLINE_DAYS : 1]),
      );
      settleMorale(copy);
      return copy.morale!;
    };
    const base = settled(0);
    expect(settled(1)).toBe(base - 1);
    expect(settled(2)).toBe(base - 2);
    expect(settled(4)).toBe(base - 3);
  });
  it('creates no morale for an older save without it', () => {
    const w = asking();
    countApprovalWaits(w);
    w.approvalWaits = Object.fromEntries(
      Object.keys(w.approvalWaits!).map((id) => [id, APPROVAL_DEADLINE_DAYS]),
    );
    delete w.morale;
    for (const p of activePlayers(w)) p.unhappy = undefined;
    settleMorale(w);
    expect(w.morale).toBeUndefined();
  });
});

describe('approval waits in the save (→SAVE-17)', () => {
  it('accepts a world without them and bounds their size', () => {
    const w = world();
    expect(valid(w)).toBe(true);
    const many = Object.fromEntries(
      Array.from({ length: 501 }, (_, i) => [`decision:contracts:p${i}:`, 1]),
    );
    expect(valid({ ...w, approvalWaits: many })).toBe(false);
    expect(valid({ ...w, approvalWaits: { a: 0 } })).toBe(false);
    expect(valid({ ...w, approvalWaits: { a: 3 } })).toBe(true);
  });
});
