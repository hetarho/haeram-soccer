import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { StoragePort } from '../adapters/repository';
import type { ClientState } from './client';
import type { View } from './protocol';

/** Worker messages are cloned, so equal branches must regain their previous references. */
function shareValue(previous: unknown, next: unknown): unknown {
  if (Object.is(previous, next)) return previous;
  if (!previous || !next || typeof previous !== 'object' || typeof next !== 'object') return next;
  if (Array.isArray(previous) && Array.isArray(next)) {
    let shared: unknown[] | undefined;
    if (previous.length !== next.length) shared = next.slice();
    for (let i = 0; i < next.length; i++) {
      const value = shareValue(previous[i], next[i]);
      if (!Object.is(value, previous[i])) shared ||= previous.slice();
      if (shared) shared[i] = value;
    }
    return shared || previous;
  }
  if (Array.isArray(previous) || Array.isArray(next)) return next;
  const before = previous as Record<string, unknown>,
    after = next as Record<string, unknown>,
    keys = Object.keys(after),
    previousKeys = Object.keys(before);
  let shared: Record<string, unknown> | undefined;
  if (previousKeys.length !== keys.length) shared = { ...after };
  for (const key of keys) {
    const value = shareValue(before[key], after[key]);
    if (!Object.hasOwn(before, key) || !Object.is(value, before[key])) shared ||= { ...before };
    if (shared) shared[key] = value;
  }
  if (shared) for (const key of previousKeys) if (!Object.hasOwn(after, key)) delete shared[key];
  return shared || previous;
}

export function shareView(previous: View | undefined, next: View | undefined): View | undefined {
  if (!previous || !next || previous.world.id !== next.world.id) return next;
  return shareValue(previous, next) as View;
}

export const initialClientState: ClientState = {
  busy: true,
  processing: true,
  activity: 'foreground',
  readonly: true,
  savedRevision: -1,
  progress: 0,
};

/** Publish once centrally; components select only the records they actually display. */
export function createGameStore(initial: ClientState = initialClientState) {
  const store = createStore<ClientState>(() => initial);
  return {
    ...store,
    getSnapshot: store.getState,
    publish(state: ClientState) {
      const previous = store.getState(),
        next = { ...state, view: shareView(previous.view, state.view) };
      const keys = Object.keys(next) as (keyof ClientState)[];
      if (
        keys.length === Object.keys(previous).length &&
        keys.every((key) => Object.is(previous[key], next[key]))
      )
        return;
      store.setState(next, true);
    },
  };
}

export const gameStore = createGameStore();

/** Editing unlocks only after the clock stops and its last admitted operation settles. */
export function gameActionsBlocked(
  state: ClientState,
  options?: { recovery?: boolean; preview?: boolean },
): boolean {
  return !!(
    (!options?.preview && (state.clockRunning || state.processing)) ||
    state.busy ||
    state.pendingActions ||
    state.readonly ||
    (state.error && !options?.recovery)
  );
}

export function useGameState<T>(selector: (state: ClientState) => T): T {
  return useStore(gameStore, selector);
}

/** App notices belong to this browser, beside the device profile's keys (→WEB-66, →ARCH-29). */
export const NOTIFICATIONS_KEY = 'haeram-soccor:notifications';
/** Read notices beyond this many are dropped, oldest first; unread ones stay until read. */
const READ_KEPT = 5;
export interface SystemNotification {
  id: string;
  text: string;
  /** When it arrived (epoch ms). */
  at: number;
  read: boolean;
}
function notificationOf(value: unknown): SystemNotification | undefined {
  const item = value as Partial<SystemNotification> | null;
  return item &&
    typeof item === 'object' &&
    typeof item.id === 'string' &&
    typeof item.text === 'string' &&
    Number.isFinite(item.at) &&
    typeof item.read === 'boolean'
    ? { id: item.id, text: item.text, at: item.at!, read: item.read }
    : undefined;
}
function browserStorage(): StoragePort | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * System notifications, oldest first: kept in this browser's storage, never in the world or its
 * saves. Storage is first read on `sync`; every change rereads it, so other tabs' notices survive
 * it, and without storage they last for this session. Malformed entries are skipped.
 */
export function createNotificationStore(storage: () => StoragePort | undefined = browserStorage) {
  // Until a write reaches storage again, memory holds notices storage does not.
  let durable = true;
  const stored = (): SystemNotification[] | undefined => {
    try {
      const port = storage();
      if (!port) return undefined;
      const items = JSON.parse(port.getItem(NOTIFICATIONS_KEY) || 'null')?.items;
      return Array.isArray(items) ? items.flatMap((item) => notificationOf(item) ?? []) : [];
    } catch {
      return undefined;
    }
  };
  const store = createStore<SystemNotification[]>(() => []);
  const current = () => (durable && stored()) || store.getState();
  const put = (items: SystemNotification[]) => {
    let read = 0;
    const kept = [...items]
      .reverse()
      .filter((item) => !item.read || ++read <= READ_KEPT)
      .reverse();
    try {
      const port = storage();
      port?.setItem(NOTIFICATIONS_KEY, JSON.stringify({ v: 1, items: kept }));
      durable = !!port;
    } catch {
      durable = false;
    }
    store.setState(kept, true);
  };
  return {
    ...store,
    /** Tells once: the same notice still unread is not added again, as on reloading a recovery. */
    add(text: string) {
      const items = current();
      if (items.some((item) => !item.read && item.text === text)) return;
      put([...items, { id: crypto.randomUUID(), text, at: Date.now(), read: false }]);
    },
    /** Marks one notice read, or every notice without an ID. */
    read(id?: string) {
      const items = current();
      if (items.some((item) => !item.read && (id === undefined || item.id === id)))
        put(
          items.map((item) =>
            id === undefined || item.id === id ? { ...item, read: true } : item,
          ),
        );
    },
    /** Reads what storage holds: on start and after another tab's change. */
    sync() {
      if (durable) store.setState(stored() ?? store.getState(), true);
    },
  };
}

export const notificationStore = createNotificationStore();

export function useNotifications<T>(selector: (items: SystemNotification[]) => T): T {
  return useStore(notificationStore, selector);
}
