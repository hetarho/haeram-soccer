import type { Page } from './state';

/** Shared place order; competition details and records belong to the clubhouse (→WEB-10). */
export const TABS: [Page, string, string, Page[]][] = [
  [
    'dashboard',
    'navigation.dashboard',
    'navigation.dashboard',
    ['dashboard', 'league', 'europe', 'history', 'leagueHistory', 'cupHistory', 'match'],
  ],
  ['business', 'navigation.business', 'navigation.business', ['business']],
  ['firstTeam', 'navigation.firstTeam', 'navigation.firstTeam', ['firstTeam']],
  ['staff', 'navigation.staff', 'navigation.staff', ['staff']],
  ['training', 'navigation.training', 'navigation.training', ['training']],
  ['academy', 'navigation.academy', 'navigation.academy', ['academy']],
];
/** Desktop and phone entries share their hierarchy and order. */
export const NAV: [Page, string][] = TABS.map(([page, , label]) => [page, label]);
