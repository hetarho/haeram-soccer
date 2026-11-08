import type { Page } from '../../shared/routing/state';

/** A navigation entry: a page, or the transfer market, which is a view of the first team. */
export type NavEntry = Page | 'market';
/**
 * The six entries (→WEB-10): the clubhouse holds the office and its working sections; 팀 holds
 * our people, its directory and their detailed management pages, immediately before the market.
 * League, cups and records sit beside them. The market owns no page: it is current while the
 * first team shows it.
 */
export const TABS: [NavEntry, string, string, Page[]][] = [
  [
    'dashboard',
    'navigation.dashboard',
    'navigation.dashboard',
    ['dashboard', 'match', 'business', 'training', 'operations'],
  ],
  ['league', 'navigation.short.league', 'navigation.league', ['league', 'leagueHistory']],
  ['europe', 'navigation.short.europe', 'navigation.short.europe', ['europe', 'cupHistory']],
  ['team', 'navigation.team', 'navigation.team', ['team', 'firstTeam', 'staff', 'academy']],
  ['market', 'personnel.market', 'personnel.market', []],
  ['history', 'navigation.short.history', 'navigation.history', ['history']],
];
/** The bottom bar: league and cups, the clubhouse, then 팀 just before the market, and records. */
export const BOTTOM_ORDER: NavEntry[] = [
  'league',
  'europe',
  'dashboard',
  'team',
  'market',
  'history',
];
/** The sidebar's entries in their order. */
export const NAV: [NavEntry, string][] = TABS.map(([page, , label]) => [page, label]);
