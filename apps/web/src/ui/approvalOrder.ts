import type { ResponsibilityKey, World } from '../../../../packages/contracts/src/types';
import type { StopReason } from '../../../../packages/engine/src/stopping';
import { RESPONSIBILITY_KEYS } from '../../../../packages/engine/src/responsibilities';
import { RESPONSIBILITY_LABELS } from './intervention';
import { bidPlayer } from './bidFacts';

/** The 결재함's views (→WEB-100): every waiting request, the overdue ones, or one responsibility. */
export type QueueFilter = 'all' | 'overdue' | ResponsibilityKey;
/** Task-memory keys of the queue's own context, scoped to the world like every task (→WEB-74). */
export const QUEUE_FILTER = 'approval-queue-filter';
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
export function matchesFilter(
  overdue: (id: string) => boolean,
  item: StopReason,
  filter: QueueFilter,
) {
  if (filter === 'all') return true;
  if (filter === 'overdue') return overdue(item.id);
  return requestKeys(item).includes(filter);
}
/**
 * The filters worth offering: all, overdue while any is, and each responsibility with actual
 * requests, in the responsibility order; the selected one stays so its empty state can clear it.
 */
export function queueFilters(
  overdue: (id: string) => boolean,
  items: readonly StopReason[],
  selected: QueueFilter,
): (readonly [QueueFilter, string])[] {
  const count = (filter: QueueFilter) =>
    items.filter((item) => matchesFilter(overdue, item, filter)).length;
  const shown: QueueFilter[] = [
    'all',
    'overdue',
    ...RESPONSIBILITY_KEYS.filter((key) => items.some((item) => requestKeys(item).includes(key))),
  ];
  if (!shown.includes(selected)) shown.push(selected);
  return shown
    .filter((filter) => filter === 'all' || filter === selected || count(filter) > 0)
    .map(
      (filter) =>
        [
          filter,
          `${filter === 'all' ? '전체' : filter === 'overdue' ? '지연' : RESPONSIBILITY_LABELS[filter]} ${count(filter)}`,
        ] as const,
    );
}
/** A stored filter that is no longer a view of the queue reads as all. */
export function queueFilter(value: unknown): QueueFilter {
  return value === 'overdue' || RESPONSIBILITY_KEYS.some((key) => key === value)
    ? (value as QueueFilter)
    : 'all';
}
/**
 * Where focus lands back in the queue: on the request itself while it still waits, else on the
 * one that took its place, else on the last; none when nothing is left (the empty heading).
 */
export function returnFocus(rows: readonly { id: string }[], from: QueueReturn) {
  if (rows.some((row) => row.id === from.id)) return from.id;
  return rows[Math.min(Math.max(from.index, 0), rows.length - 1)]?.id;
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
