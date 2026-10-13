import { create } from 'zustand';
import type { PlayerScope } from './playerAnalysis';
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

/**
 * The player of ours whose sheet is open: one at a time, from any view and over any dialog, the
 * way team sheets open. `scope` is the record it starts on; players who left only have their club
 * career.
 */
export const usePlayerSheet = create<{
  id?: string;
  scope: PlayerScope;
  open: (id: string, scope?: PlayerScope) => void;
  close: () => void;
}>((set) => ({
  scope: 'career',
  open: (id, scope = 'career') => set({ id, scope }),
  close: () => set({ id: undefined }),
}));

/**
 * A season asked for on the league page from elsewhere, such as a records-room season row. The
 * league page takes it once: a closed season opens on its final table in our league that season.
 */
export const useLeagueSeason = create<{ request?: number; take: () => void }>((set) => ({
  take: () => set({ request: undefined }),
}));
/** Opens the league page on a season (→WEB-54). */
export function openLeagueSeason(year: number) {
  useLeagueSeason.setState({ request: year });
  useNavigation.getState().setPage('league');
}

/** A closed season's tabs on the league page, in tab-bar order; the review comes first. */
export const PAST_TABS = [
  ['review', '결산'],
  ['table', '순위표'],
  ['matches', '우리 경기'],
  ['rank', '순위 추이'],
  ['scorers', '득점 순위'],
] as const;
export type PastTab = (typeof PAST_TABS)[number][0];

/** The records room's tabs, in tab-bar order; the first one keeps no ?view= in the address. */
export const RECORD_TABS = [
  ['summary', '요약'],
  ['trends', '추이'],
  ['players', '선수'],
  ['season', '시즌 기록'],
  ['managers', '감독'],
] as const;
export type RecordTab = (typeof RECORD_TABS)[number][0];

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
