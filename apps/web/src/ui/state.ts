import { create } from 'zustand';
export type Page =
  'dashboard' | 'match' | 'league' | 'europe' | 'squad' | 'manager' | 'business' | 'history';
const paths: Record<Page, string> = {
  dashboard: '/journal',
  match: '/matches',
  league: '/leagues',
  europe: '/europe',
  squad: '/squad',
  manager: '/manager',
  business: '/business',
  history: '/history',
};
/** The transfer market is the squad page's market segment; its own address opens it there. */
const MARKET_PATH = '/transfers';
const at = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');
const current = (): Page =>
  at(MARKET_PATH)
    ? 'squad'
    : (Object.entries(paths).find(([, path]) => at(path))?.[0] as Page) || 'dashboard';
/** The squad page's address names the market while that segment is open, so a reload keeps it. */
const address = (page: Page) =>
  page === 'squad' && useSquadView.getState().tab === 'market' ? MARKET_PATH : paths[page];
export const useNavigation = create<{
  page: Page;
  setPage: (page: Page) => void;
  /** Redirects without a history entry (e.g. a match address without a live match). */
  replacePage: (page: Page) => void;
}>((set) => ({
  page: typeof location === 'undefined' ? 'dashboard' : current(),
  setPage: (page) => {
    if (location.pathname !== address(page)) history.pushState(null, '', address(page));
    set({ page });
  },
  replacePage: (page) => {
    if (location.pathname !== address(page)) history.replaceState(null, '', address(page));
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

/**
 * The squad page's segments: roster, academy and the transfer market. The page keeps its segment
 * while the owner is elsewhere; switching segments swaps the address without a history entry.
 */
export type SquadTab = 'roster' | 'academy' | 'market';
export const useSquadView = create<{
  tab: SquadTab;
  setTab: (tab: SquadTab) => void;
}>((set) => ({
  tab: typeof location !== 'undefined' && at(MARKET_PATH) ? 'market' : 'roster',
  setTab: (tab) => {
    set({ tab });
    if (useNavigation.getState().page === 'squad' && location.pathname !== address('squad'))
      history.replaceState(history.state, '', address('squad'));
  },
}));
/** Opens the transfer market: the squad page on its market segment. */
export function openMarket() {
  useSquadView.getState().setTab('market');
  useNavigation.getState().setPage('squad');
}
if (typeof window !== 'undefined')
  window.addEventListener('popstate', () => {
    const page = current();
    // Back and forward follow the address: the market's own address opens that segment.
    if (page === 'squad' && at(MARKET_PATH) !== (useSquadView.getState().tab === 'market'))
      useSquadView.setState({ tab: at(MARKET_PATH) ? 'market' : 'roster' });
    useNavigation.setState({ page });
  });

/**
 * The clubs whose team sheets are open, oldest first: a club named inside a sheet opens on top
 * of it and closing returns to the one below (→WEB-58). Opening a club already in the stack
 * returns to its sheet instead of stacking it twice.
 */
export const useTeamSheet = create<{
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

/** The staff page's tabs, in tab-bar order. */
export const STAFF_TABS = [
  ['manager', '감독'],
  ['candidates', '감독 후보'],
  ['coaches', '코치진'],
  ['delegation', '위임'],
] as const;
export type StaffTab = (typeof STAFF_TABS)[number][0];
/**
 * A staff tab asked for from elsewhere, such as the manager-departure alert opening the
 * candidates. The staff page takes it once, even while it is showing; otherwise it opens on the
 * tab in its address or on 감독.
 */
export const useStaffView = create<{
  request?: StaffTab;
  open: (tab: StaffTab) => void;
  take: () => void;
}>((set) => ({
  open: (tab) => set({ request: tab }),
  take: () => set({ request: undefined }),
}));
