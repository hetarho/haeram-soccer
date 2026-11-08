import { create } from 'zustand';

/**
 * Football metrics as the trade defines them, and exactly how this game counts them (→WEB-53).
 * `standard` is the industry definition (Opta, StatsBomb, FBref); `here` is this engine's count.
 * The entries themselves live in `glossaryEntries.ts`, which only lazily loaded screens import, so
 * the app's first load carries the sheet's state and not its text (→ARCH-28).
 */
export interface GlossaryEntry {
  id: string;
  term: string;
  abbr?: string;
  standard: string;
  here: string;
  /** How to read it, with typical ranges. */
  read: string;
  /** A small reference table, such as the pitch's named cells. */
  table?: { caption: string; head: readonly string[]; rows: readonly (readonly string[])[] };
}

/** Which glossary sheet is open: one entry, all entries, or none. */
export const useGlossary = create<{ open?: string; show: (id?: string) => void; hide: () => void }>(
  (set) => ({
    show: (id = 'all') => set({ open: id }),
    hide: () => set({ open: undefined }),
  }),
);
