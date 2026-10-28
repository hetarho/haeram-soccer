/** Personnel destinations and compatibility addresses (→WEB-43/70/74). */
export const FIRST_TEAM_TABS = [
  ['manager', '감독'],
  ['players', '선수 목록'],
  ['market', '이적시장'],
] as const;
export const STAFF_TABS = [['coaches', '스태프']] as const;
export type FirstTeamView = (typeof FIRST_TEAM_TABS)[number][0];
export type StaffView = (typeof STAFF_TABS)[number][0];
export type PersonnelHome =
  | { page: 'firstTeam'; view: FirstTeamView }
  | { page: 'academy'; view?: 'academy' }
  | { page: 'training'; view?: 'training' }
  | { page: 'staff'; view: StaffView };
export const PERSONNEL_PATHS = {
  firstTeam: '/first-team?view=manager',
  training: '/training',
  academy: '/academy',
  staff: '/staff?view=coaches',
} as const;
export function personnelAddress(home: PersonnelHome, market = false) {
  return home.page === 'academy' || home.page === 'training'
    ? `/${home.page}`
    : `${home.page === 'firstTeam' ? '/first-team' : '/staff'}?view=${home.view}${market ? '&market=1' : ''}`;
}
/** Keep legacy engine read-model homes behind the same canonical navigation boundary. */
export function personnelHome(view: string): PersonnelHome {
  if (view === 'academy') return { page: 'academy' };
  if (view === 'training') return { page: 'training' };
  if (view === 'coaches') return { page: 'staff', view: 'coaches' };
  return {
    page: 'firstTeam',
    view:
      view === 'manager' || view === 'candidates'
        ? 'manager'
        : view === 'market'
          ? 'market'
          : 'players',
  };
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
      asked === 'training'
        ? 'training'
        : (FIRST_TEAM_TABS.find(([id]) => id === asked)?.[0] ?? 'players'),
    );
  else if (at('/academy')) home = personnelHome('academy');
  else if (at('/staff'))
    home = personnelHome(asked === 'manager' || asked === 'candidates' ? asked : 'coaches');
  else return undefined;
  const market =
    home.page === 'firstTeam' &&
    home.view === 'manager' &&
    (asked === 'candidates' || params.get('market') === '1');
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
): PersonnelHome | { page: 'business'; view: 'investment' } {
  return home.startsWith('business/')
    ? { page: 'business', view: 'investment' }
    : personnelHome(home.split('/')[1]);
}
