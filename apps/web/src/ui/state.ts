import { create } from 'zustand';
export type Page =
  'dashboard' | 'match' | 'league' | 'europe' | 'squad' | 'manager' | 'business' | 'history';
export const useNavigation = create<{ page: Page; setPage: (page: Page) => void }>((set) => ({
  page: 'dashboard',
  setPage: (page) => set({ page }),
}));
