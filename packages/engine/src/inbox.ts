import type { InboxItem, World } from '../../contracts/src/types';
import { currentDay } from './calendar';

export const INBOX_LIMIT = 120;
const PREFIX = 'inbox:';
const waiting = (item: InboxItem) => item.attention && !item.read;
/** A running sequence keeps IDs unique after old items are dropped; older saves start after them. */
function nextSequence(inbox: InboxItem[]) {
  for (let i = inbox.length - 1; i >= 0; i--) {
    if (!inbox[i].id.startsWith(PREFIX)) continue;
    const seq = Number(inbox[i].id.slice(inbox[i].id.lastIndexOf(':') + 1));
    if (Number.isSafeInteger(seq)) return seq + 1;
  }
  return inbox.length;
}
/** Keeps the newest items, dropping read or informational ones before unanswered attention. */
function bounded(inbox: InboxItem[]) {
  let excess = inbox.length - INBOX_LIMIT;
  if (excess <= 0) return inbox;
  const kept = inbox.filter((item) => waiting(item) || excess-- <= 0);
  return kept.slice(-INBOX_LIMIT);
}
/** Records an event the owner should see; attention items stop automatic progression. */
export function pushInbox(
  w: World,
  item: Omit<InboxItem, 'id' | 'year' | 'day' | 'read'>,
): InboxItem {
  const day = currentDay(w),
    inbox = w.inbox || [];
  const entry: InboxItem = {
    ...item,
    id: `${PREFIX}${w.year}:${day}:${nextSequence(inbox)}`,
    year: w.year,
    day,
  };
  w.inbox = bounded([...inbox, entry]);
  return entry;
}
/** Marks one item, or every item when `id` is absent, as read; an unknown ID changes nothing. */
export function readInbox(w: World, id?: string): void {
  w.inbox = (w.inbox || []).map((item) => (!id || item.id === id ? { ...item, read: true } : item));
}
export function unreadAttention(w: World): InboxItem[] {
  return (w.inbox || []).filter(waiting);
}
/** Newest first, for the inbox view. */
export function inboxFeed(w: World): InboxItem[] {
  return [...(w.inbox || [])].reverse();
}
