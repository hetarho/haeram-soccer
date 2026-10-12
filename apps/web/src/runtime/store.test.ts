import { describe, expect, it } from 'vitest';
import { clubMilestones, createWorld } from '../../../../packages/engine/src/index';
import type { StoragePort } from '../adapters/repository';
import type { ClientState } from './client';
import type { View } from './protocol';
import { NOTIFICATIONS_KEY, createGameStore, createNotificationStore, shareView } from './store';

function view(): View {
  const world = createWorld({
    country: 'ENG',
    name: 'Stable Athletic',
    color: '#223344',
    seed: 'stable-store',
    difficulty: 1,
  });
  return {
    world,
    milestones: clubMilestones(world),
    totalMatches: 0,
    supportUsed: 0,
    managers: [],
    transfers: [],
    sponsors: [],
    campaigns: [],
    annualCost: '0',
    coefficient: 0,
    news: [],
  };
}

const state = (v: View): ClientState => ({
  view: v,
  busy: false,
  processing: false,
  activity: 'idle',
  readonly: false,
  savedRevision: v.world.revision,
  progress: 0,
});

describe('selective simulation snapshots', () => {
  it('suppresses cloned equal publications and preserves table/chart records on off days', () => {
    const initial = view(),
      store = createGameStore(state(initial));
    let publications = 0,
      tableChanges = 0,
      rankChanges = 0,
      dayChanges = 0;
    store.subscribe((next, previous) => {
      publications++;
      if (next.view?.world.tables !== previous.view?.world.tables) tableChanges++;
      if (next.view?.world.rankHistory !== previous.view?.world.rankHistory) rankChanges++;
      if (next.view?.world.calendar !== previous.view?.world.calendar) dayChanges++;
    });
    store.publish(structuredClone(state(initial)));
    expect(publications).toBe(0);
    for (let day = 1; day <= 6; day++) {
      const next = structuredClone(initial);
      next.world.calendar = { day };
      next.world.revision = day;
      store.publish(state(next));
    }
    const current = store.getSnapshot().view!;
    expect(publications).toBe(6);
    expect(dayChanges).toBe(6);
    expect(tableChanges).toBe(0);
    expect(rankChanges).toBe(0);
    for (const key of ['clubs', 'players', 'manager', 'fixtures', 'history', 'events'] as const)
      expect(current.world[key]).toBe(initial.world[key]);
    expect(current.world.calendar?.day).toBe(6);
  });

  it('updates changed records while preserving siblings, appended history and removed properties', () => {
    const initial = view(),
      next = structuredClone(initial),
      own = next.world.playerClub,
      other = next.world.clubs.find((club) => club.id !== own)!.id;
    initial.world.critical = 'Previous alert';
    next.world.tables[own].points = 3;
    next.world.rankHistory!.push({ ...next.world.rankHistory![0], round: 1, day: 7 });
    next.world.players[1].fatigue = 8;
    const current = shareView(initial, next)!;
    expect(current.world.tables).not.toBe(initial.world.tables);
    expect(current.world.tables[own].points).toBe(3);
    expect(current.world.tables[other]).toBe(initial.world.tables[other]);
    expect(current.world.players[0]).toBe(initial.world.players[0]);
    expect(current.world.players[1]).not.toBe(initial.world.players[1]);
    expect(current.world.rankHistory![0]).toBe(initial.world.rankHistory![0]);
    expect(current.world.rankHistory).toHaveLength(2);
    expect(current.world.critical).toBeUndefined();
    expect(Object.hasOwn(current.world, 'critical')).toBe(false);
  });

  it('does not reuse records from another world even when their values match', () => {
    const initial = view(),
      replacement = structuredClone(initial);
    replacement.world.id = 'replacement-world';
    const current = shareView(initial, replacement)!;
    expect(current).toBe(replacement);
    expect(current.world.tables).not.toBe(initial.world.tables);
  });
});

describe('system notifications (→WEB-66)', () => {
  class MemoryStorage implements StoragePort {
    data = new Map<string, string>();
    fail = false;
    getItem(key: string) {
      return this.data.get(key) ?? null;
    }
    setItem(key: string, value: string) {
      if (this.fail) throw new Error('QuotaExceededError');
      this.data.set(key, value);
    }
    removeItem(key: string) {
      this.data.delete(key);
    }
  }

  it('marks a read notification read and keeps that in this browser', () => {
    const storage = new MemoryStorage(),
      store = createNotificationStore(() => storage);
    store.add('기존 기록을 보존하고 새 게임 규칙으로 저장했습니다.');
    store.add('이전의 정상 체크포인트로 복구했습니다.');
    const [upgrade, recovery] = store.getState();
    expect([upgrade.read, recovery.read]).toEqual([false, false]);
    store.read(upgrade.id);
    expect(store.getState().map((item) => item.read)).toEqual([true, false]);
    // Another store over the same storage, as after a reload or in another tab.
    const reopened = createNotificationStore(() => storage);
    reopened.sync();
    expect(reopened.getState()).toEqual(store.getState());
    expect(JSON.parse(storage.getItem(NOTIFICATIONS_KEY)!).items[0]).toEqual({
      ...upgrade,
      read: true,
    });
    reopened.read();
    store.sync();
    expect(store.getState().every((item) => item.read)).toBe(true);
  });

  it('keeps unread notices until read, a few read ones, and memory when storage fails', () => {
    const storage = new MemoryStorage(),
      store = createNotificationStore(() => storage);
    storage.data.set(NOTIFICATIONS_KEY, JSON.stringify({ v: 1, items: [{ id: 'bad' }] }));
    store.sync();
    expect(store.getState()).toEqual([]);
    for (let n = 0; n < 8; n++) store.add(`읽은 알림 ${n}`);
    store.read();
    for (let n = 0; n < 8; n++) store.add(`새 알림 ${n}`);
    const kept = store.getState();
    expect(kept.filter((item) => !item.read)).toHaveLength(8);
    expect(kept.filter((item) => item.read).map((item) => item.text)).toEqual(
      [3, 4, 5, 6, 7].map((n) => `읽은 알림 ${n}`),
    );
    storage.fail = true;
    store.add('다른 탭이 닫혀 이 탭에서 이어서 플레이합니다.');
    expect(store.getState()).toHaveLength(14);
    expect(JSON.parse(storage.getItem(NOTIFICATIONS_KEY)!).items).toHaveLength(13);
    storage.fail = false;
    store.read(store.getState().at(-1)!.id);
    expect(JSON.parse(storage.getItem(NOTIFICATIONS_KEY)!).items).toEqual(store.getState());
  });
});
