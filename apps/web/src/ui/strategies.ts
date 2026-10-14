import { create } from 'zustand';
import type { ClubBuild } from '../../../../packages/contracts/src/build';
import type { ClubPolicy, Direction } from '../../../../packages/contracts/src/types';
import { BUILD_PRESETS, buildLabel, sameBuild } from '../../../../packages/engine/src/build';
import {
  presetBoard,
  sameBoard,
  type DirectionBoard,
} from '../../../../packages/engine/src/presets';
import {
  StrategyLibrary,
  STRATEGIES_KEY,
  type SavedRows,
  type SavedStrategy,
} from '../adapters/profile';

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
  save: (input: { id?: string; name: string; build: ClubBuild; rows?: SavedRows }) => SavedStrategy;
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

/** A saved direction's rows as the engine's preset rows (→SAVE-15). */
export const savedRows = (rows: SavedRows) => ({
  policy: rows.policy as Partial<ClubPolicy> | undefined,
  ticket: rows.ticket,
  direction: rows.direction as Direction | undefined,
});
/**
 * Whether a saved direction is the board: its whole board when it kept rows, else its cards
 * (an entry saved before directions kept rows).
 */
export function savedMatches(item: SavedStrategy, board: DirectionBoard) {
  return item.rows
    ? sameBoard(presetBoard({ build: item.build, rows: savedRows(item.rows) }), board)
    : sameBuild(item.build, board.build);
}
/**
 * A direction's name for the owner (→WEB-60): the preset whose whole board it is, then a saved
 * direction that matches, else 기본 방향 or 맞춤 방향 by its cards.
 */
export function strategyName(board: DirectionBoard, saved: SavedStrategy[]) {
  return (
    BUILD_PRESETS.find((preset) => sameBoard(presetBoard(preset), board))?.label ??
    saved.find((item) => savedMatches(item, board))?.name ??
    buildLabel(board.build)
  );
}
/** A board's rows as a saved direction keeps them (→SAVE-15): every dial, the ticket, the rows set. */
export function boardRows(board: DirectionBoard): SavedRows {
  return {
    policy: { ...board.policy },
    ticket: board.ticket,
    direction: { ...board.direction },
  };
}
