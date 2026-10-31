import type { ResponsibilityKey } from '../../../../packages/contracts/src/types';

/**
 * Personnel destinations and compatibility addresses (→WEB-43/70/74). 1군 is the roster; the
 * market is the primary 이적시장 entry. The manager stands with his staff in 코치진, so every
 * older manager address lands there, with the replacement market open when it asked for it.
 */
export const FIRST_TEAM_TABS = [
  ['players', '선수 목록'],
  ['market', '이적시장'],
] as const;
export const STAFF_TABS = [['coaches', '코치진']] as const;
/**
 * The saved responsibilities each personnel workflow edits in place (→WEB-79/43), each in one
 * home: the office's player and staff desks used to compose them; the shared component and its
 * confirmation stay the same. Sponsorship is 구단 운영's (→WEB-110).
 */
export const WORK_RESPONSIBILITIES = {
  players: ['contracts', 'sales'],
  market: ['recruitment'],
  coaches: ['manager', 'staff'],
  academy: ['academy'],
} as const satisfies Record<string, readonly ResponsibilityKey[]>;
export type FirstTeamView = (typeof FIRST_TEAM_TABS)[number][0];
export type StaffView = (typeof STAFF_TABS)[number][0];
export type PersonnelHome =
  | { page: 'firstTeam'; view: FirstTeamView }
  | { page: 'academy'; view?: 'academy' }
  | { page: 'training'; view?: 'training' }
  | { page: 'staff'; view: StaffView };
/** A fresh 1군 entry opens the roster (→WEB-43). */
export const PERSONNEL_PATHS = {
  firstTeam: '/first-team?view=players',
  training: '/training',
  academy: '/academy',
  staff: '/staff?view=coaches',
} as const;
export function personnelAddress(home: PersonnelHome, market = false) {
  return home.page === 'academy' || home.page === 'training'
    ? `/${home.page}`
    : `${home.page === 'firstTeam' ? '/first-team' : '/staff'}?view=${home.view}${market && home.page === 'staff' ? '&market=1' : ''}`;
}
/** Keep legacy engine read-model homes behind the same canonical navigation boundary. */
export function personnelHome(view: string): PersonnelHome {
  if (view === 'academy') return { page: 'academy' };
  if (view === 'training') return { page: 'training' };
  if (view === 'coaches' || view === 'manager' || view === 'candidates')
    return { page: 'staff', view: 'coaches' };
  return { page: 'firstTeam', view: view === 'market' ? 'market' : 'players' };
}
export function personnelRoute(pathname: string, search: string) {
  const at = (path: string) => pathname === path || pathname.startsWith(path + '/');
  const params = new URLSearchParams(search);
  const asked = params.get('view');
  let home: PersonnelHome;
  if (at('/squad')) home = personnelHome('players');
  else if (at('/transfers')) home = personnelHome('market');
  else if (at('/manager')) home = personnelHome(asked === 'coaches' ? 'coaches' : 'manager');
  else if (at('/people')) home = personnelHome(asked ?? 'players');
  else if (at('/training')) home = personnelHome(asked === 'academy' ? 'academy' : 'training');
  else if (at('/first-team'))
    home = personnelHome(
      asked === 'training' || asked === 'manager' || asked === 'candidates'
        ? asked
        : (FIRST_TEAM_TABS.find(([id]) => id === asked)?.[0] ?? 'players'),
    );
  else if (at('/academy')) home = personnelHome('academy');
  else if (at('/staff')) home = personnelHome('coaches');
  else return undefined;
  // The manager's replacement market opens over 코치진, for its own flag or an older candidates view.
  const market = home.page === 'staff' && (asked === 'candidates' || params.get('market') === '1');
  // Keep task-specific filters/selection keys while replacing the grouping keys.
  params.delete('view');
  params.delete('market');
  const canonical = new URLSearchParams(personnelAddress(home, market).split('?')[1]);
  for (const [key, value] of params) canonical.append(key, value);
  const path =
    home.page === 'firstTeam' ? '/first-team' : home.page === 'staff' ? '/staff' : `/${home.page}`;
  const address = path + (canonical.size ? `?${canonical}` : '');
  return {
    ...home,
    ...(market ? { market: true as const } : {}),
    ...(address === pathname + search ? {} : { address }),
  };
}

/** Legacy development read-model links resolve to the final authoritative work. */
export function developmentDestination(
  home: string,
): PersonnelHome | { page: 'operations'; view: 'investment' } {
  return home.startsWith('business/')
    ? { page: 'operations', view: 'investment' }
    : personnelHome(home.split('/')[1]);
}
