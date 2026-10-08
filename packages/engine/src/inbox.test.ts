import { describe, expect, it } from 'vitest';
import { validateWorld } from '../../contracts/src/index';
import type { InboxItem, World } from '../../contracts/src/types';
import {
  createWorld,
  INBOX_LIMIT,
  inboxFeed,
  operate,
  pushInbox,
  readInbox,
  unreadAttention,
} from './index';

function world() {
  return createWorld({
    country: 'ENG',
    name: 'Letters United',
    color: '#334455',
    seed: 'inbox',
    difficulty: 2,
  });
}
const note = (w: World, attention: boolean, title = 'note') =>
  pushInbox(w, { kind: attention ? 'incoming-bid' : 'staff-report', title, detail: '', attention });

describe('owner inbox', () => {
  it('stamps items with the season day and unique deterministic IDs', () => {
    const a = world(),
      b = world();
    a.calendar = b.calendar = { day: 5 };
    const first = note(a, true),
      second = note(a, false);
    note(b, true);
    note(b, false);
    expect(first).toMatchObject({ year: 1901, day: 5, attention: true });
    expect(first.read).toBeUndefined();
    expect(first.id).not.toBe(second.id);
    expect(a.inbox!.map((item) => item.id)).toEqual(b.inbox!.map((item) => item.id));
    expect(validateWorld(a).id).toBe(a.id);
  });

  it('marks one or all items read and reports only unread attention', () => {
    const w = world();
    const urgent = note(w, true),
      quiet = note(w, false),
      other = note(w, true);
    expect(unreadAttention(w).map((item) => item.id)).toEqual([urgent.id, other.id]);
    operate(w, { type: 'read-inbox', id: urgent.id });
    expect(unreadAttention(w).map((item) => item.id)).toEqual([other.id]);
    readInbox(w, 'missing');
    expect(unreadAttention(w)).toHaveLength(1);
    operate(w, { type: 'read-inbox' });
    expect(unreadAttention(w)).toEqual([]);
    expect(w.inbox!.find((item) => item.id === quiet.id)?.read).toBe(true);
    expect(inboxFeed(w).map((item) => item.id)).toEqual([other.id, quiet.id, urgent.id]);
  });

  it('stays bounded, keeps unanswered attention and never reuses an ID', () => {
    const w = world();
    const urgent = note(w, true, 'keep me');
    const ids = [urgent.id];
    for (let i = 0; i < INBOX_LIMIT * 2; i++) ids.push(note(w, false, `info ${i}`).id);
    expect(w.inbox).toHaveLength(INBOX_LIMIT);
    expect(w.inbox!.some((item) => item.id === urgent.id)).toBe(true);
    expect(w.inbox!.at(-1)!.title).toBe(`info ${INBOX_LIMIT * 2 - 1}`);
    expect(new Set(ids).size).toBe(ids.length);
    expect(validateWorld(w).id).toBe(w.id);
    // Once read, old attention gives way like any other item.
    readInbox(w);
    for (let i = 0; i < INBOX_LIMIT; i++) note(w, false);
    expect(w.inbox!.some((item) => item.id === urgent.id)).toBe(false);
  });

  it('accepts older saves without an inbox and with IDs from an earlier format', () => {
    const w = world();
    delete w.inbox;
    expect(unreadAttention(w)).toEqual([]);
    readInbox(w);
    const legacy: InboxItem = {
      id: '1901:3:7:0',
      year: 1901,
      day: 3,
      kind: 'staff-report',
      title: 'old',
      detail: '',
      attention: true,
    };
    w.inbox = [legacy];
    const fresh = note(w, true);
    expect(fresh.id).not.toBe(legacy.id);
    expect(unreadAttention(w).map((item) => item.id)).toEqual([legacy.id, fresh.id]);
  });
});
