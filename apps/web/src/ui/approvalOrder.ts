import type { ResponsibilityKey, World } from '../../../../packages/contracts/src/types';
import type { StopReason } from '../../../../packages/engine/src/stopping';
import { RESPONSIBILITY_KEYS } from '../../../../packages/engine/src/responsibilities';
import { bidPlayer } from './bidFacts';

export const QUEUE_RETURN = 'approval-queue-return';
/** The request a review left from and its place in the list, for focus on the way back. */
export interface QueueReturn {
  id: string;
  index: number;
  /** Set once a named return or a completed review leads back to the queue. */
  back?: boolean;
}

/**
 * Settled days a request has waited, as the world records them for its 결재 기한 (→STAFF-48);
 * one without a record — arrived today, or an older save — has waited none.
 */
function waited(w: Pick<World, 'approvalWaits'>, id: string) {
  return w.approvalWaits?.[id] ?? 0;
}
/** The responsibilities a request belongs to; a joint approval belongs to each. */
export function requestKeys(item: StopReason): ResponsibilityKey[] {
  return item.responsibilities ?? (item.responsibility ? [item.responsibility] : []);
}
/**
 * The queue's order: the longest waiting first, which puts overdue requests first and then the
 * nearest 결재 기한, then the stable request ID. Requests without waiting records keep ID order.
 */
export function orderApprovals<T extends StopReason>(
  w: Pick<World, 'approvalWaits'>,
  items: readonly T[],
): T[] {
  return [...items].sort(
    (a, b) => waited(w, b.id) - waited(w, a.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
/**
 * Where focus lands back in the queue: on the request itself while it still waits, else on the
 * one that took its place, else on the last; none when nothing is left (the empty heading).
 */
export function returnFocus(rows: readonly { id: string }[], from: QueueReturn) {
  if (rows.some((row) => row.id === from.id)) return from.id;
  return rows[Math.min(Math.max(from.index, 0), rows.length - 1)]?.id;
}
/**
 * The 결재함's titles (→WEB-100): each responsibility, then the club's own 재정 and anything else;
 * a request sits under its first responsibility, or the work its kind belongs to.
 */
export type ApprovalTitle = ResponsibilityKey | 'finance' | 'other';
export const APPROVAL_TITLES: readonly ApprovalTitle[] = [
  ...RESPONSIBILITY_KEYS,
  'finance',
  'other',
];
const KIND_TITLES: Partial<Record<StopReason['kind'], ResponsibilityKey>> = {
  'contract-talk': 'contracts',
  unhappy: 'contracts',
  'transfer-request': 'sales',
  'incoming-bid': 'sales',
  'bid-response': 'recruitment',
  'youth-intake': 'academy',
  'staff-renewal': 'staff',
  'sponsor-ending': 'sponsors',
};
export function requestTitle(item: StopReason): ApprovalTitle {
  const key = requestKeys(item)[0] ?? KIND_TITLES[item.kind];
  if (key) return key;
  if (item.kind === 'finance') return item.title.includes('후원') ? 'sponsors' : 'finance';
  return 'other';
}
/**
 * Every title with its requests in queue order: titles with waiting requests first, by their
 * longest-waiting request, then the quiet ones in responsibility order. 재정 and the rest appear
 * only while something waits there.
 */
export function approvalGroups<T extends StopReason>(
  w: Pick<World, 'approvalWaits'>,
  items: readonly T[],
) {
  const ordered = orderApprovals(w, items);
  const groups = APPROVAL_TITLES.map((title) => ({
    title,
    items: ordered.filter((item) => requestTitle(item) === title),
  })).filter(
    (group) => group.items.length || (group.title !== 'finance' && group.title !== 'other'),
  );
  const first = (group: (typeof groups)[number]) =>
    group.items.length ? ordered.indexOf(group.items[0]) : ordered.length;
  return groups.sort((a, b) => first(a) - first(b));
}
/** Who or what a request concerns, where its title does not already name it. */
export function requestSubject(w: World, item: StopReason) {
  if (item.kind === 'incoming-bid' || item.kind === 'bid-response') {
    const bid = w.bids?.find((candidate) => candidate.id === item.ref);
    if (!bid) return;
    const player = bidPlayer(w, bid)?.player.name;
    const club = w.clubs.find((candidate) => candidate.id === bid.club)?.name;
    return [player, club].filter(Boolean).join(' · ') || undefined;
  }
  if (requestKeys(item).includes('academy'))
    return w.academy?.players.find((candidate) => candidate.id === item.ref)?.name;
}
