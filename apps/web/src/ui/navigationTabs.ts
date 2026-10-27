import type { Page } from './state';

/**
 * The sidebar's destinations (→WEB-10). The match view has no menu entry: it opens only from a
 * watch action (→WEB-40). The owner office is entered from home, never from a menu (→WEB-39).
 */
export const TABS: [Page, string, string, Page[]][] = [
  ['league', 'navigation.short.season', 'navigation.season', ['league', 'europe']],
  [
    'history',
    'navigation.short.history',
    'navigation.history',
    ['history', 'leagueHistory', 'cupHistory'],
  ],
  ['dashboard', 'navigation.short.dashboard', 'navigation.dashboard', ['dashboard']],
  ['firstTeam', 'navigation.short.firstTeam', 'navigation.firstTeam', ['firstTeam']],
  ['academy', 'navigation.short.academy', 'navigation.academy', ['academy']],
  ['staff', 'navigation.short.staff', 'navigation.staff', ['staff']],
];
/** Desktop and phone entries share their hierarchy and order. */
export const NAV: [Page, string][] = TABS.map(([page, , label]) => [page, label]);
