import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
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

export function useGameState<T>(selector: (state: ClientState) => T): T {
  return useStore(gameStore, selector);
}
