import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { competitionRoute, selectedYear } from './competitionNavigation';
import {
  beginTaskDetour,
  openClubSeason,
  openCupSeason,
  openLeagueSeason,
  openPrimary,
  returnToTask,
  routeOf,
  useNavigation,
} from './state';
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
