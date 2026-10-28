import type { World } from '../../../../packages/contracts/src/types';
import { fixtureDate, fixtureDay } from '../../../../packages/engine/src/calendar';
import { domesticCupName } from '../../../../packages/engine/src/competition-keys';

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

/** A bounded clubhouse read of the retained current cups; no simulation or archive reads. */
export function currentCupBriefings(w: World) {
  const own = w.clubs.find((club) => club.id === w.playerClub)!;
  const domestic = w.cups?.find((cup) => cup.country === own.country);
  const competitions = [
    {
      key: 'cup',
      name: domestic?.name ?? domesticCupName(own.country),
      clubs: domestic?.clubs ?? [],
      fixtures: domestic?.fixtures ?? [],
      rounds: domestic?.rounds ?? [],
      winner: domestic?.winner,
      stage: '',
      ownExit: undefined,
    },
    ...w.europe.map((cup) => ({ ...cup, rounds: cup.rounds ?? [] })),
  ];
  const clubName = (id: string) => w.clubs.find((club) => club.id === id)?.name ?? id;
  return competitions.map((cup) => {
    const entered = cup.clubs.includes(w.playerClub);
    const round = cup.rounds.findLast(
      (round) =>
        round.byes?.includes(w.playerClub) ||
        round.ties.some((tie) => tie.home === w.playerClub || tie.away === w.playerClub),
    );
    const tie = round?.ties.find((tie) => tie.home === w.playerClub || tie.away === w.playerClub);
    const ownFixtures = cup.fixtures
      .filter((fixture) => fixture.home === w.playerClub || fixture.away === w.playerClub)
      .sort((a, b) => fixtureDay(a) - fixtureDay(b) || a.id.localeCompare(b.id));
    const next = ownFixtures.find((fixture) => !fixture.score);
    const last = ownFixtures.findLast((fixture) => fixture.score);
    const eliminated = !!tie?.winner && tie.winner !== w.playerClub;
    const status =
      cup.key === 'cup' && !domestic
        ? '대진 정보 없음'
        : !entered
          ? '미참가'
          : cup.winner === w.playerClub
            ? '우승'
            : cup.ownExit ||
              (eliminated
                ? `${round!.label} 탈락`
                : (round?.label ?? cup.stage) || '대진 추첨 대기');
    const detail =
      entered && next && !eliminated && !cup.ownExit && !cup.winner
        ? `다음 ${fixtureDate(w, next)} · ${next.home === w.playerClub ? '홈' : '원정'} ${clubName(next.home === w.playerClub ? next.away : next.home)}`
        : entered && last?.score
          ? `최근 ${clubName(last.home)} ${last.score.home}–${last.score.away} ${clubName(last.away)}`
          : '';
    return {
      key: cup.key,
      name: cup.name,
      status,
      detail,
      winner: cup.winner ? `대회 우승 · ${clubName(cup.winner)}` : '',
    };
  });
}
