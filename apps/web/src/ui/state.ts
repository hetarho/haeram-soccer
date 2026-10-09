import { create } from 'zustand';
export type Page =
  | 'dashboard'
  | 'match'
  | 'league'
  | 'europe'
  | 'squad'
  | 'transfers'
  | 'manager'
  | 'business'
  | 'history'
  | 'season';
const paths: Record<Page, string> = {
  dashboard: '/journal',
  match: '/matches',
  league: '/leagues',
  europe: '/europe',
  squad: '/squad',
  transfers: '/transfers',
  manager: '/manager',
  business: '/business',
  history: '/history',
  season: '/season',
};
const current = (): Page =>
  (Object.entries(paths).find(
    ([, path]) => location.pathname === path || location.pathname.startsWith(path + '/'),
  )?.[0] as Page) || 'dashboard';
export const useNavigation = create<{
  page: Page;
  setPage: (page: Page) => void;
  /** Redirects without a history entry (e.g. a match address without a live match). */
  replacePage: (page: Page) => void;
}>((set) => ({
  page: typeof location === 'undefined' ? 'dashboard' : current(),
  setPage: (page) => {
    if (location.pathname !== paths[page]) history.pushState(null, '', paths[page]);
    set({ page });
  },
  replacePage: (page) => {
    if (location.pathname !== paths[page]) history.replaceState(null, '', paths[page]);
    set({ page });
  },
}));

/**
 * Where live match presentation stands, so home can offer a way back to an unfinished match
 * instead of starting another one (the match view has no tab).
 */
export const useMatchView = create<{
  matchId?: string;
  finished: boolean;
  set: (state: { matchId?: string; finished: boolean }) => void;
}>((set) => ({
  finished: false,
  set: ({ matchId, finished }) => set({ matchId, finished }),
}));
if (typeof window !== 'undefined')
  window.addEventListener('popstate', () => useNavigation.setState({ page: current() }));

/** The squad group keeps its sub-view while the manager office is open. */
export type SquadTab = 'roster' | 'academy';
export const useSquadView = create<{
  tab: SquadTab;
  setTab: (tab: SquadTab) => void;
}>((set) => ({ tab: 'roster', setTab: (tab) => set({ tab }) }));
