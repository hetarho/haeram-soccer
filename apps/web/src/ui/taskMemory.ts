import { useCallback, useState, type SetStateAction } from 'react';
import { create } from 'zustand';
import type { Page } from './state';

export interface TaskReturn {
  page: Page;
  address: string;
  label: string;
  target: Page;
}
/** Transient work belongs to one career, never to an engine save or another game slot. */
export const useTaskMemory = create<{
  world?: string;
  values: Record<string, unknown>;
  addresses: Partial<Record<Page, string>>;
  scrolls: Record<string, number>;
  returning?: TaskReturn;
  parents: TaskReturn[];
  activate: (world: string) => void;
}>((set, get) => ({
  values: {},
  parents: [],
  addresses: {},
  scrolls: {},
  activate: (world) => {
    if (get().world !== world)
      set({ world, values: {}, parents: [], addresses: {}, scrolls: {}, returning: undefined });
  },
}));

export function taskAddress() {
  return location.pathname + location.search + location.hash;
}
export function rememberTask(page: Page) {
  const address = taskAddress();
  const { addresses, scrolls } = useTaskMemory.getState();
  useTaskMemory.setState({
    addresses: { ...addresses, [page]: address },
    scrolls: {
      ...scrolls,
      [address]:
        document.querySelector<HTMLElement>('[data-testid="view-scroller"]')?.scrollTop ?? 0,
    },
  });
}
const ABSENT = Symbol('absent-task-value');

export function useTaskState<T>(world: string, key: string, initial: T | (() => T)) {
  const [fallback] = useState(initial);
  const stored = useTaskMemory((state) =>
    state.world === world && Object.hasOwn(state.values, key) ? state.values[key] : ABSENT,
  );
  const value = (stored === ABSENT ? fallback : stored) as T;
  const setValue = useCallback(
    (update: SetStateAction<T>) => {
      useTaskMemory.getState().activate(world);
      const state = useTaskMemory.getState();
      const previous = (Object.hasOwn(state.values, key) ? state.values[key] : fallback) as T;
      const next = typeof update === 'function' ? (update as (value: T) => T)(previous) : update;
      useTaskMemory.setState({ values: { ...state.values, [key]: next } });
    },
    [world, key, fallback],
  );
  return [value, setValue] as const;
}
