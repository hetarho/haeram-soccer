import { afterEach, describe, expect, it, vi } from 'vitest';
import { owningTeamView, teamAddress, teamRoute, TEAM_VIEWS } from './teamNavigation';
import {
  activateTaskWorld,
  beginTaskDetour,
  openAcademyProspect,
  openPersonnel,
  openPrimary,
  openTeam,
  routeOf,
  useAcademyReview,
  useNavigation,
} from './state';
import { useTaskMemory } from './taskMemory';

/** A synthetic browser address/history with a scroller; no engine, storage or real DOM. */
function browser(scrollTop = 0) {
  let current = new URL('https://game.test/journal');
  const pushed: string[] = [];
  const scroller = { scrollTop };
  vi.stubGlobal('location', {
    get pathname() {
      return current.pathname;
    },
    get search() {
      return current.search;
    },
    get hash() {
      return current.hash;
    },
  });
  vi.stubGlobal('document', { querySelector: () => scroller });
  vi.stubGlobal('history', {
    pushState: (_state: unknown, _title: string, address: string) => {
      current = new URL(address, current);
      pushed.push(address);
    },
    replaceState: (_state: unknown, _title: string, address: string) => {
      current = new URL(address, current);
    },
  });
  useTaskMemory.getState().activate('team-test');
  useNavigation.setState({ page: 'dashboard' });
  return { pushed, scroller, at: () => current.pathname + current.search };
}
afterEach(() => {
  vi.unstubAllGlobals();
  useTaskMemory.getState().activate('clean');
  useAcademyReview.getState().take();
});

describe('the /team address (→WEB-112)', () => {
  it('lists 1군, 유소년 and 코치 in that order, 1군 first', () => {
    expect(TEAM_VIEWS.map(([id]) => id)).toEqual(['players', 'academy', 'coaches']);
    expect(teamAddress()).toBe('/team?view=players');
  });
  it('canonicalizes a missing or unknown view and keeps other keys after it', () => {
    expect(teamRoute('/team', '')).toEqual({
      page: 'team',
      view: 'players',
      address: '/team?view=players',
    });
    expect(teamRoute('/team', '?view=academy')).toEqual({ page: 'team', view: 'academy' });
    expect(teamRoute('/team', '?view=market&x=1')).toEqual({
      page: 'team',
      view: 'players',
      address: '/team?view=players&x=1',
    });
    expect(teamRoute('/teams', '')).toBeUndefined();
    expect(teamRoute('/first-team', '?view=players')).toBeUndefined();
  });
  it('is a page of its own, loadable directly, and leaves older people addresses in place', () => {
    expect(routeOf('/team', '?view=coaches')).toEqual({ page: 'team', view: 'coaches' });
    expect(routeOf('/team', '').address).toBe('/team?view=players');
    expect(routeOf('/first-team', '?view=players').page).toBe('firstTeam');
    expect(routeOf('/staff', '?view=coaches').page).toBe('staff');
    expect(routeOf('/academy', '').page).toBe('academy');
    expect(routeOf('/first-team', '?view=market').view).toBe('market');
  });
  it('names the Team tab owning each detailed page', () => {
    expect(owningTeamView('firstTeam')).toBe('players');
    expect(owningTeamView('academy')).toBe('academy');
    expect(owningTeamView('staff')).toBe('coaches');
  });
});

describe('Team navigation and retained context (→WEB-74/112)', () => {
  it('opens fresh on 1군 and resumes its last list, address and scroll after leaving', () => {
    const browse = browser(240);
    openPrimary('team');
    expect(browse.at()).toBe('/team?view=players');
    expect(useNavigation.getState().page).toBe('team');
    // A tab change rewrites the address in place, as the directory's tab bar does.
    history.replaceState(null, '', '/team?view=coaches');
    openPrimary('league');
    expect(useTaskMemory.getState().scrolls['/team?view=coaches']).toBe(240);
    openPrimary('team');
    expect(browse.at()).toBe('/team?view=coaches');
    expect(useNavigation.getState().page).toBe('team');
  });
  it('reaches a detailed page through its management link and comes back to its own tab', () => {
    const browse = browser();
    openTeam('coaches');
    openPersonnel({ page: 'staff', view: 'coaches' });
    expect(browse.at()).toBe('/staff?view=coaches');
    expect(useNavigation.getState().page).toBe('staff');
    openTeam('coaches');
    expect(browse.at()).toBe('/team?view=coaches');
    expect(browse.pushed).toEqual([
      '/team?view=coaches',
      '/staff?view=coaches',
      '/team?view=coaches',
    ]);
  });
  it("opens a prospect's review in 유소년 without issuing anything else", () => {
    const browse = browser();
    openTeam('academy');
    openAcademyProspect('y1');
    expect(browse.at()).toBe('/academy');
    expect(useNavigation.getState().page).toBe('academy');
    expect(useAcademyReview.getState().take()).toBe('y1');
  });
  it('labels a detour started from 팀 and forgets every Team context for another game', () => {
    browser();
    openTeam('academy');
    beginTaskDetour('operations');
    expect(useTaskMemory.getState().returning).toMatchObject({
      page: 'team',
      address: '/team?view=academy',
      label: '팀',
    });
    useAcademyReview.getState().open('y1');
    activateTaskWorld('another-game');
    expect(useAcademyReview.getState().request).toBeUndefined();
    expect(useTaskMemory.getState().addresses).toEqual({});
  });
});
