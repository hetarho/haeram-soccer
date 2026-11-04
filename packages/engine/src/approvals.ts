import { message as sourceMessage } from '../../contracts/src/messages';
import type { World } from '../../contracts/src/types';
import { pushInbox } from './inbox';
import { RESPONSIBILITY_KEYS, isDelegated } from './responsibilities';
import { pendingDecisions } from './stopping';

/** 결재 기한: an owner-held approval unanswered through this many settled days is overdue (→STAFF-48). */
export const APPROVAL_DEADLINE_DAYS = 7;
/** Squad morale each overdue approval costs a settled round, and the most they cost together (→CLUB-19). */
export const OVERDUE_MORALE = { each: 1, most: 3 } as const;

/** Settled days an owner-held approval has waited; 0 for one that arrived today or in older saves. */
export function approvalWait(w: World, id: string) {
  return w.approvalWaits?.[id] ?? 0;
}
/** Days left to its 결재 기한, or how many days past it (negative) it is. */
export function approvalDeadline(w: World, id: string) {
  return APPROVAL_DEADLINE_DAYS - approvalWait(w, id);
}
export function isOverdue(w: World, id: string) {
  return approvalWait(w, id) >= APPROVAL_DEADLINE_DAYS;
}
/** The owner-held approvals past their 결재 기한 (→STAFF-48). */
export function overdueApprovals(w: World) {
  return w.approvalWaits ? pendingDecisions(w).filter((item) => isOverdue(w, item.id)) : [];
}
/** Morale a settled round costs for overdue approvals (→CLUB-19). */
export function overdueMoraleCost(count: number) {
  return Math.min(OVERDUE_MORALE.most, count * OVERDUE_MORALE.each);
}
/**
 * A settled day starts: every owner-held approval still unanswered waits one day more, and one
 * answered, closed by its own course or handed to the staff is forgotten (→STAFF-48). The day one
 * reaches its 결재 기한 the owner hears it once. Nothing is written while nothing waits.
 */
export function countApprovalWaits(w: World) {
  if (!w.approvalWaits && RESPONSIBILITY_KEYS.every((key) => isDelegated(w, key))) return;
  const pending = pendingDecisions(w);
  if (!pending.length) {
    delete w.approvalWaits;
    return;
  }
  const waits: Record<string, number> = {};
  for (const item of pending) {
    const days = approvalWait(w, item.id) + 1;
    waits[item.id] = days;
    if (days === APPROVAL_DEADLINE_DAYS)
      pushInbox(w, {
        kind: item.kind,
        title: sourceMessage('copy.approvals.e77356f86b', { p0: item.title }).slice(0, 160),
        detail: sourceMessage('copy.approvals.265e586af7', {
          p0: APPROVAL_DEADLINE_DAYS,
          p1: OVERDUE_MORALE.each,
          p2: OVERDUE_MORALE.most,
        }),
        attention: true,
        ...(item.ref ? { ref: item.ref } : {}),
      });
  }
  w.approvalWaits = waits;
}
