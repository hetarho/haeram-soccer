/**
 * 팀, the primary directory of our club's people (→WEB-112): 1군, 유소년 and 코치, in that order,
 * each a ?view= of /team, the first its default. The detailed working pages (/first-team,
 * /academy, /staff) keep their own addresses; this is their compact list, not another editor.
 */
export const TEAM_VIEWS = [
  ['players', 'team.view.players'],
  ['academy', 'team.view.academy'],
  ['coaches', 'team.view.coaches'],
] as const;
export type TeamView = (typeof TEAM_VIEWS)[number][0];
export const TEAM_PATH = '/team';

export function teamView(value: string | null | undefined): TeamView {
  return TEAM_VIEWS.find(([id]) => id === value)?.[0] ?? 'players';
}
/** The canonical address keeps the view, the default included, so a reload lands on it. */
export function teamAddress(view: TeamView = 'players') {
  return `${TEAM_PATH}?view=${view}`;
}
/** Resolves /team: an unknown or missing view opens 1군; other keys stay after it. */
export function teamRoute(pathname: string, search: string) {
  if (pathname !== TEAM_PATH && !pathname.startsWith(TEAM_PATH + '/')) return undefined;
  const params = new URLSearchParams(search);
  const view = teamView(params.get('view'));
  params.delete('view');
  const canonical = new URLSearchParams({ view });
  for (const [key, value] of params) canonical.append(key, value);
  const address = `${TEAM_PATH}?${canonical}`;
  return {
    page: 'team' as const,
    view,
    ...(address === pathname + search ? {} : { address }),
  };
}
/** The Team tab that owns a detailed management page, for its way back (→WEB-112). */
export function owningTeamView(page: 'firstTeam' | 'staff' | 'academy'): TeamView {
  return page === 'firstTeam' ? 'players' : page === 'staff' ? 'coaches' : 'academy';
}
