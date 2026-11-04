import { create } from 'zustand';

/**
 * The clubs whose details are open, oldest first: a club named inside a detail opens on top of it
 * and closing returns to the one below (→WEB-58). Opening a club already in the stack returns to
 * its detail instead of stacking it twice.
 */
export const useClubDetail = create<{
  ids: string[];
  open: (id: string) => void;
  close: () => void;
  reset: () => void;
}>((set) => ({
  ids: [],
  open: (id) =>
    set(({ ids }) => ({
      ids: ids.includes(id) ? ids.slice(0, ids.indexOf(id) + 1) : [...ids, id],
    })),
  close: () => set(({ ids }) => ({ ids: ids.slice(0, -1) })),
  reset: () => set({ ids: [] }),
}));

/** Opens a club's detail over whatever is shown. */
export function openClub(id: string) {
  useClubDetail.getState().open(id);
}
