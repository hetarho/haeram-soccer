import { create } from 'zustand';

/** The record a player's detail opens on: this season or the club career. */
export type PlayerScope = 'season' | 'career';

/** Whose detail to open: ours by id alone; another club's with the club he plays for, as a hint. */
export interface PlayerTarget {
  id: string;
  club?: string;
  scope?: PlayerScope;
}

/**
 * The player whose detail is open: one at a time, from any view and over any dialog, the way club
 * details open (→WEB-59). `scope` is the record it starts on; players who left only have their
 * club career.
 */
export const usePlayerDetail = create<{
  id?: string;
  club?: string;
  scope: PlayerScope;
  open: (target: PlayerTarget) => void;
  close: () => void;
}>((set) => ({
  scope: 'career',
  open: ({ id, club, scope = 'career' }) => set({ id, club, scope }),
  close: () => set({ id: undefined, club: undefined }),
}));

/** Opens a player's detail over whatever is shown. */
export function openPlayer(target: PlayerTarget) {
  usePlayerDetail.getState().open(target);
}
