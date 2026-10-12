import { create } from 'zustand';
import type { ClubBuild } from '../../../../packages/contracts/src/build';
import { buildLabel, buildPreset, sameBuild } from '../../../../packages/engine/src/build';
import { StrategyLibrary, STRATEGIES_KEY, type SavedStrategy } from '../adapters/profile';

/** The device library (→WEB-61); every game slot on this browser reads the same list. */
const library = new StrategyLibrary({
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
});
function read() {
  try {
    return library.list();
  } catch {
    return [];
  }
}

export const useStrategies = create<{
  items: SavedStrategy[];
  save: (input: { id?: string; name: string; build: ClubBuild }) => SavedStrategy;
  remove: (id: string) => void;
}>((set) => ({
  items: read(),
  save: (input) => {
    const saved = library.save(input);
    set({ items: read() });
    return saved;
  },
  remove: (id) => {
    library.remove(id);
    set({ items: read() });
  },
}));

// Another tab of the same browser shares the library.
if (typeof window !== 'undefined')
  window.addEventListener('storage', (event) => {
    if (event.key === STRATEGIES_KEY) useStrategies.setState({ items: read() });
  });

/** A strategy's name for the owner: a preset's, then a saved one with the same cards. */
export function strategyName(build: ClubBuild, saved: SavedStrategy[]) {
  return (
    buildPreset(build)?.label ??
    saved.find((item) => sameBuild(item.build, build))?.name ??
    buildLabel(build)
  );
}
