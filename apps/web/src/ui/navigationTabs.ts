import type { Page } from './state';

/** A navigation entry: a page, or the transfer market, which is a view of the first team. */
export type NavEntry = Page | 'market';
/** The five entries: the clubhouse holds every room of the club; league, cups, the transfer market
 * and records sit beside it. The market owns no page: it is current while the first team shows it. */
export const TABS: [NavEntry, string, string, Page[]][] = [
  [
    'dashboard',
    'navigation.dashboard',
    'navigation.dashboard',
    ['dashboard', 'match', 'business', 'firstTeam', 'staff', 'training', 'academy'],
  ],
  ['league', 'navigation.short.league', 'navigation.league', ['league', 'leagueHistory']],
  ['europe', 'navigation.short.europe', 'navigation.short.europe', ['europe', 'cupHistory']],
  ['market', 'personnel.market', 'personnel.market', []],
  ['history', 'navigation.short.history', 'navigation.history', ['history']],
];
/** The bottom bar keeps the clubhouse in the middle: league and cups left, market and records right. */
export const BOTTOM_ORDER: NavEntry[] = ['league', 'europe', 'dashboard', 'market', 'history'];
/** The clubhouse's rooms, whose doors stand in the owner's office lobby (→WEB-10/39). */
export const ROOMS: [Page, string][] = [
  ['firstTeam', 'navigation.firstTeam'],
  ['staff', 'navigation.staff'],
  ['training', 'navigation.training'],
  ['academy', 'navigation.academy'],
];
/** The sidebar's entries in their order. */
export const NAV: [NavEntry, string][] = TABS.map(([page, , label]) => [page, label]);
