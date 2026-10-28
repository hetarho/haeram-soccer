import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { competitionRoute, selectedYear, currentCupBriefings } from './competitionNavigation';
import {
  beginTaskDetour,
  useCupRequest,
  activateTaskWorld,
  openClubSeason,
  openCupSeason,
  openLeagueSeason,
  useLeagueSeason,
  openPrimary,
  returnToTask,
  routeOf,
  useNavigation,
} from './state';
import type { World } from '../../../../packages/contracts/src/types';
import { useTaskMemory } from './taskMemory';

const paramsOf = (address: string) => new URL(address, 'https://example.test').searchParams;
describe('competition addresses and contexts (→WEB-40/54/65/74)', () => {
  it.each([
    ['/season', '?competition=league', 'league'],
    ['/season', '?competition=cup', 'europe'],
    ['/history', '?section=club', 'history'],
    ['/history', '?section=league', 'leagueHistory'],
    ['/history', '?section=cup', 'cupHistory'],
  ])('keeps canonical %s%s', (path, search, page) => {
    expect(routeOf(path, search)).toEqual({ page });
  });
  it('defaults missing group selectors without losing club review filters', () => {
    const route = routeOf('/history', '?view=seasons&season=1951&part=matches&competition=cup');
    expect(route.page).toBe('history');
    expect(Object.fromEntries(paramsOf(route.address!))).toEqual({
      section: 'club',
      view: 'seasons',
      season: '1951',
      part: 'matches',
      competition: 'cup',
    });
    expect(routeOf('/season', '')).toEqual({
      page: 'league',
      address: '/season?competition=league',
    });
    expect(routeOf('/history', '?view=managers')).toEqual({
      page: 'history',
      address: '/history?section=club&view=managers',
    });
  });
  it('moves old league season, competition and lens selectors intact into the correct group', () => {
    const old = routeOf(
      '/leagues',
      '?season=1950&league=GER.1.0&view=players&detail=trend&tab=scorers',
    );
    expect(old.page).toBe('leagueHistory');
    expect(Object.fromEntries(paramsOf(old.address!))).toEqual({
      section: 'league',
      season: '1950',
      league: 'GER.1.0',
      view: 'players',
      detail: 'trend',
      tab: 'scorers',
    });
    expect(routeOf('/leagues', '?league=ENG.0.0&view=teams').page).toBe('league');
  });
  it('separates the cup lineage selector from the hub selector on old and current URLs', () => {
    const old = routeOf('/europe', '?competition=ucl&period=history&season=1990&country=GER');
    expect(old.page).toBe('cupHistory');
    expect(Object.fromEntries(paramsOf(old.address!))).toEqual({
      section: 'cup',
      cup: 'ucl',
      season: '1990',
      country: 'GER',
    });
    const current = routeOf('/europe', '?competition=cup&period=current&country=POR');
    expect(current.page).toBe('europe');
    expect(Object.fromEntries(paramsOf(current.address!))).toEqual({
      competition: 'cup',
      cup: 'cup',
      country: 'POR',
    });
    expect(competitionRoute('/journal', '?competition=cup')).toBeUndefined();
  });
  it('treats invalid years as absent and keeps unavailable positive archive years explicit', () => {
    for (const raw of ['', '0', '-1', 'oops', '1950.5'])
      expect(selectedYear(new URLSearchParams({ season: raw }))).toBeUndefined();
    expect(selectedYear(new URLSearchParams('season=1940'))).toBe(1940);
    expect(routeOf('/europe', '?competition=cup&period=history&season=1940').address).toContain(
      'season=1940',
    );
  });
});
let serial = 0;
beforeEach(() => {
  vi.stubGlobal('location', new URL('https://example.test/journal'));
  const navigate = (_state: unknown, _unused: string, url: string) =>
    vi.stubGlobal('location', new URL(url, location.href));
  vi.stubGlobal('history', { pushState: vi.fn(navigate), replaceState: vi.fn(navigate) });
  vi.stubGlobal('document', { querySelector: () => undefined });
  useTaskMemory.getState().activate(`competition-world-${++serial}`);
  useNavigation.setState({ page: 'dashboard' });
});
afterEach(() => vi.unstubAllGlobals());
describe('competition session continuity', () => {
  it('resumes the league notebook without issuing a fresh own-season request', () => {
    useLeagueSeason.getState().take();
    useNavigation.getState().setPage('league');
    history.replaceState(null, '', '/season?competition=league&view=players&league=FRA.0.0');
    const address = location.href;
    useNavigation.getState().setPage('dashboard');
    // The season briefing's full-league link resumes this saved address.
    useNavigation.getState().setPage('league');
    expect(location.href).toBe(address);
    expect(useLeagueSeason.getState().request).toBeUndefined();
    // The explicit current-league shortcut intentionally asks for our current competition.
    openLeagueSeason(1956, 1956);
    expect(useLeagueSeason.getState().request).toBe(1956);
    useLeagueSeason.getState().take();
  });
  it('restores the complete club review after a same-group archive detour', () => {
    history.pushState(null, '', '/history?section=club&season=1950&part=matches&competition=cup');
    useNavigation.setState({ page: 'history' });
    const original = location.href;
    openLeagueSeason(1950, 1952);
    expect(useNavigation.getState().page).toBe('leagueHistory');
    expect(useTaskMemory.getState().returning?.address).toContain('part=matches&competition=cup');
    returnToTask();
    expect(location.href).toBe(original);
    expect(useNavigation.getState().page).toBe('history');
  });
  it('distinguishes current facts from closed cup and league requests', () => {
    openLeagueSeason(1952, 1952);
    expect(location.pathname).toBe('/season');
    openCupSeason(1950, 'ucl', 1952);
    expect(useNavigation.getState().page).toBe('cupHistory');
    openClubSeason(1950);
    expect(useNavigation.getState().page).toBe('history');
  });
  it('opens the exact current cup from home, keeps a named return and clears stale requests for a new world', () => {
    openCupSeason(1952, 'ucl', 1952);
    expect(useNavigation.getState().page).toBe('europe');
    expect(useCupRequest.getState().request).toEqual({ year: 1952, competition: 'ucl' });
    expect(useTaskMemory.getState().returning).toMatchObject({
      page: 'dashboard',
      target: 'europe',
      address: '/journal',
    });
    returnToTask();
    expect(location.pathname).toBe('/journal');
    activateTaskWorld('different-cup-world');
    expect(useCupRequest.getState().request).toBeUndefined();
  });
  it('resumes group lenses and complete addresses, then clears them on a world change', () => {
    useNavigation.getState().setPage('cupHistory');
    history.replaceState(null, '', '/history?section=cup&cup=cup&country=GER&season=1950');
    useNavigation.getState().setPage('dashboard');
    openPrimary('history');
    expect(location.search).toBe('?section=cup&cup=cup&country=GER&season=1950');
    useNavigation.getState().setPage('europe');
    useNavigation.getState().setPage('dashboard');
    openPrimary('league');
    expect(useNavigation.getState().page).toBe('europe');
    useTaskMemory.getState().activate('another-world');
    useNavigation.getState().setPage('dashboard');
    openPrimary('history');
    expect(location.search).toBe('?section=club');
    beginTaskDetour('leagueHistory');
    expect(useTaskMemory.getState().returning?.target).toBe('leagueHistory');
  });
});

describe('clubhouse cup facts', () => {
  const world = () =>
    ({
      year: 1956,
      playerClub: 'own',
      clubs: [
        { id: 'own', country: 'ENG', name: 'Own FC' },
        { id: 'rival', name: 'Rival FC' },
      ],
      cups: [],
      europe: [],
    }) as unknown as World;
  const cup = () =>
    ({
      country: 'ENG',
      name: 'Synthetic Cup',
      clubs: ['own', 'rival'],
      rounds: [{ label: '결승', round: 8, legs: 1, ties: [{ home: 'own', away: 'rival' }] }],
      fixtures: [{ id: 'final', year: 1956, round: 8, kind: 'cup', home: 'own', away: 'rival' }],
    }) as NonNullable<World['cups']>[number];

  it('does not invent entry or results before a domestic draw', () => {
    expect(currentCupBriefings(world())).toEqual([
      { key: 'cup', name: '잉글랜드 컵', status: '대진 정보 없음', detail: '', winner: '' },
    ]);
  });
  it('labels a retained field without our club as not entered', () => {
    const w = world();
    const c = cup();
    c.clubs = ['rival'];
    w.cups = [c];
    expect(currentCupBriefings(w)[0].status).toBe('미참가');
  });
  it('reports the next retained tie with its actual opponent and home orientation', () => {
    const w = world();
    w.cups = [cup()];
    const before = JSON.stringify(w);
    expect(currentCupBriefings(w)[0]).toMatchObject({
      key: 'cup',
      status: '결승',
      detail: expect.stringContaining('홈 Rival FC'),
    });
    expect(JSON.stringify(w)).toBe(before);
  });
  it.each(['own', 'rival'])('reports a settled final and current winner %s', (winner) => {
    const w = world();
    const c = cup();
    w.cups = [c];
    c.winner = winner;
    c.rounds[0].ties[0].winner = winner;
    c.fixtures[0].score = { home: winner === 'own' ? 2 : 0, away: 1 };
    expect(currentCupBriefings(w)[0]).toMatchObject({
      status: winner === 'own' ? '우승' : '결승 탈락',
      winner: `대회 우승 · ${winner === 'own' ? 'Own FC' : 'Rival FC'}`,
      detail: expect.stringContaining('최근 Own FC'),
    });
  });
  it('keeps continental stage, recorded exit and nonparticipation separate', () => {
    const w = world();
    w.europe = [
      {
        key: 'ucl',
        name: 'European Cup',
        clubs: ['own'],
        rounds: [],
        fixtures: [],
        stage: '조별 리그',
      },
      {
        key: 'uel',
        name: 'UEFA Cup',
        clubs: ['own'],
        rounds: [],
        fixtures: [],
        stage: '16강',
        ownExit: '조별 리그 탈락',
      },
      {
        key: 'uecl',
        name: 'Conference',
        clubs: ['rival'],
        rounds: [],
        fixtures: [],
        stage: '결승',
        winner: 'rival',
      },
    ] as unknown as World['europe'];
    expect(
      currentCupBriefings(w)
        .slice(1)
        .map(({ key, status }) => [key, status]),
    ).toEqual([
      ['ucl', '조별 리그'],
      ['uel', '조별 리그 탈락'],
      ['uecl', '미참가'],
    ]);
  });
  it.each([1991, 1992, 1993])(
    'shows the current group phase after retained qualifiers in %s',
    (year) => {
      const w = world();
      w.year = year;
      w.europe = [
        {
          key: 'ucl',
          name: 'Synthetic Champions Cup',
          format: 'groups',
          field: 32,
          games: 6,
          clubs: ['own', 'rival'],
          standings: {},
          stage: '조별 리그',
          rounds: [
            {
              label: '예선 2라운드',
              round: 12,
              legs: 2,
              ties: [{ home: 'own', away: 'rival', winner: 'own' }],
            },
          ],
          fixtures: [
            {
              id: 'ucl:knockout:1',
              year,
              round: 12,
              kind: 'europe',
              country: 'UEFA',
              groupKey: 'ucl',
              home: 'own',
              away: 'rival',
              score: { home: 2, away: 0 },
            },
            {
              id: 'ucl:phase:1',
              year,
              round: 14,
              kind: 'europe',
              country: 'UEFA',
              groupKey: 'ucl',
              home: 'rival',
              away: 'own',
            },
          ],
        },
      ];
      const before = JSON.stringify(w);
      expect(currentCupBriefings(w)[1]).toMatchObject({
        key: 'ucl',
        status: '조별 리그',
        detail: expect.stringContaining('원정 Rival FC'),
      });
      expect(JSON.stringify(w)).toBe(before);
      // Clubs that exited in qualifying still show their own exit when the competition advances.
      w.europe[0].rounds![0].ties[0].winner = 'rival';
      w.europe[0].fixtures.pop();
      expect(currentCupBriefings(w)[1]).toMatchObject({
        status: '예선 2라운드 탈락',
        detail: expect.stringContaining('최근 Own FC'),
      });
    },
  );
});
