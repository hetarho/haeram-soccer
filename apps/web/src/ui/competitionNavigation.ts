/** Internal competition lenses share two public navigation groups (→WEB-40). */
export const COMPETITION_PATHS = {
  league: '/season?competition=league',
  europe: '/season?competition=cup',
  history: '/history?section=club',
  leagueHistory: '/history?section=league',
  cupHistory: '/history?section=cup',
} as const;
export type CompetitionPage = keyof typeof COMPETITION_PATHS;
export const SEASON_PAGES: CompetitionPage[] = ['league', 'europe'];
export const HISTORY_PAGES: CompetitionPage[] = ['history', 'leagueHistory', 'cupHistory'];
export function selectedYear(params: URLSearchParams) {
  const value = Number(params.get('season'));
  return Number.isInteger(value) && value > 0 ? value : undefined;
}
/** Canonicalise only the grouping keys; all subordinate selectors retain their meaning. */
export function competitionRoute(pathname: string, search: string) {
  const at = (path: string) => pathname === path || pathname.startsWith(path + '/');
  const params = new URLSearchParams(search);
  let page: CompetitionPage;
  if (at('/leagues')) page = selectedYear(params) ? 'leagueHistory' : 'league';
  else if (at('/europe')) {
    page = params.get('period') === 'history' ? 'cupHistory' : 'europe';
    if (params.has('competition')) params.set('cup', params.get('competition')!);
    params.delete('competition');
    params.delete('period');
  } else if (at('/season')) page = params.get('competition') === 'cup' ? 'europe' : 'league';
  else if (at('/history'))
    page =
      params.get('section') === 'league'
        ? 'leagueHistory'
        : params.get('section') === 'cup'
          ? 'cupHistory'
          : 'history';
  else return undefined;
  const canonical = new URLSearchParams(COMPETITION_PATHS[page].split('?')[1]);
  params.delete('section');
  if (page !== 'history') params.delete('competition');
  params.forEach((value, key) => {
    if (!canonical.has(key)) canonical.append(key, value);
  });
  const address = COMPETITION_PATHS[page].split('?')[0] + '?' + canonical.toString();
  return { page, ...(address === pathname + search ? {} : { address }) };
}
