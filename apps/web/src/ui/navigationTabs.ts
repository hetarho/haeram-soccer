import type { Page } from './state';

/**
 * The sidebar's destinations (→WEB-10). The match view has no menu entry: it opens only from a
 * watch action (→WEB-40). The owner office is entered from home, never from a menu (→WEB-39).
 */
export const NAV: [Page, string][] = [
  ['dashboard', 'navigation.dashboard'],
  ['league', 'navigation.season'],
  ['history', 'navigation.history'],
  ['people', 'navigation.people'],
  ['training', 'navigation.training'],
];
/**
 * The phone tab bar: Season and History to the left of the raised home tab,
 * the owner's squad levers to the right — 사람 (who joins and stays) and 훈련 (how players
 * develop, →WEB-10). The transfer market and the staff are tabs of 사람.
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
  ['people', 'navigation.short.people', 'navigation.people', ['people']],
  ['training', 'navigation.short.training', 'navigation.training', ['training']],
];
