import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  developmentDestination,
  personnelAddress,
  personnelHome,
  personnelRoute,
  WORK_RESPONSIBILITIES,
} from './personnelNavigation';
import { DESK_RESPONSIBILITIES } from './officeDesks';
import {
  beginTaskDetour,
  openPeople,
  openTraining,
  openStaff,
  returnToTask,
  useNavigation,
  useStaffRequest,
  usePeopleView,
  useContractTalk,
  openContractTalk,
  activateTaskWorld,
  openPrimary,
  openBusiness,
  openOperations,
  openFacility,
  leaveDesk,
  useFacilityRequest,
  HOME_AREA_ORIGIN,
  openInvestment,
  openControl,
  useControlRequest,
} from './state';
import { useTaskMemory } from './taskMemory';

/** A synthetic browser address/history; no engine, storage, workers or real DOM. */
function browser() {
  let current = new URL('https://game.test/journal');
  const history: string[] = [];
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
  vi.stubGlobal('document', { querySelector: () => ({ scrollTop: 76 }) });
  vi.stubGlobal('history', {
    pushState: (_state: unknown, _title: string, address: string) => {
      current = new URL(address, current);
      history.push(address);
    },
    replaceState: (_state: unknown, _title: string, address: string) => {
      current = new URL(address, current);
    },
  });
  useTaskMemory.getState().activate('personnel-test');
  useNavigation.setState({ page: 'dashboard' });
  return history;
}
afterEach(() => {
  vi.unstubAllGlobals();
  useTaskMemory.getState().activate('clean');
  usePeopleView.getState().take();
  useStaffRequest.getState().take();
});
describe('personnel actions and task continuity', () => {
  it("opens the first team's door on the team after the market entry (→WEB-10)", () => {
    browser();
    openPrimary('market');
    expect(location.pathname + location.search).toBe('/first-team?view=market');
    openPrimary('dashboard');
    openPrimary('firstTeam');
    expect(location.pathname + location.search).toBe('/first-team?view=players');
    expect(useNavigation.getState().page).toBe('firstTeam');
  });
  it('returns between subviews of one hub and clears one-shot actions for another game', () => {
    browser();
    openPeople('players');
    openStaff('assistant');
    expect(location.pathname + location.search).toBe('/staff?view=coaches');
    expect(useTaskMemory.getState().returning).toMatchObject({
      address: '/first-team?view=players',
      label: '선수 목록',
      target: 'staff',
    });
    expect(useStaffRequest.getState().request).toBe('assistant');
    returnToTask();
    expect(location.pathname + location.search).toBe('/first-team?view=players');
    openTraining('training');
    openContractTalk('player-1');
    expect(useTaskMemory.getState().returning).toMatchObject({
      address: '/training',
      label: '훈련장',
    });
    expect(useContractTalk.getState().id).toBe('player-1');
    activateTaskWorld('new-game');
    expect(useContractTalk.getState().id).toBeUndefined();
    expect(useStaffRequest.getState().request).toBeUndefined();
    expect(useTaskMemory.getState().returning).toBeUndefined();
  });

  it('resolves every engine personnel home without a competing page', () => {
    expect(personnelAddress(personnelHome('players'))).toBe('/first-team?view=players');
    expect(personnelAddress(personnelHome('training'))).toBe('/training');
    expect(personnelAddress(personnelHome('academy'))).toBe('/academy');
    // The manager is found with his staff in 코치진, never as a hidden first-team default.
    expect(personnelAddress(personnelHome('manager'))).toBe('/staff?view=coaches');
    expect(personnelAddress(personnelHome('candidates'), true)).toBe(
      '/staff?view=coaches&market=1',
    );
    expect(personnelAddress(personnelHome('coaches'))).toBe('/staff?view=coaches');
    // A first-team address never carries the manager's market flag.
    expect(personnelAddress(personnelHome('players'), true)).toBe('/first-team?view=players');
    expect(developmentDestination('people/manager')).toEqual({ page: 'staff', view: 'coaches' });
    expect(developmentDestination('people/coaches')).toEqual({ page: 'staff', view: 'coaches' });
    expect(developmentDestination('business/facility')).toEqual({
      page: 'operations',
      view: 'investment',
    });
    expect(personnelRoute('/staff', '?view=manager&market=1')).toMatchObject({ market: true });
  });
  it('opens explicit actions while primary entries resume their retained subview', () => {
    const history = browser();
    openPeople('market');
    useTaskMemory.setState({
      values: {
        'market-role': 'DF',
        'market-viewingId': 'candidate-1',
      },
    });
    openTraining('academy');
    useNavigation.getState().setPage('firstTeam');
    expect(history.at(-1)).toBe('/first-team?view=market');
    openTraining('training');
    expect(history.at(-1)).toBe('/training');
    openPeople('candidates');
    expect(history.at(-1)).toBe('/staff?view=coaches&market=1');
    expect(useNavigation.getState().page).toBe('staff');
    expect(useTaskMemory.getState().values).toMatchObject({
      'market-role': 'DF',
      'market-viewingId': 'candidate-1',
    });
    expect(useTaskMemory.getState().scrolls['/first-team?view=market']).toBe(76);
    useTaskMemory.getState().activate('another-game');
    expect(useTaskMemory.getState().addresses).toEqual({});
    expect(useTaskMemory.getState().values).toEqual({});
  });
  it('opens the actual responsible post or coach action and retains a named return', () => {
    browser();
    openTraining('training');
    openStaff('assistant');
    expect(location.pathname + location.search).toBe('/staff?view=coaches');
    expect(useStaffRequest.getState().request).toBe('assistant');
    expect(useTaskMemory.getState().returning).toMatchObject({
      page: 'training',
      label: '훈련장',
      target: 'staff',
    });
    returnToTask();
    expect(location.pathname + location.search).toBe('/training');
    openTraining('academy');
    expect(location.pathname).toBe('/academy');
    beginTaskDetour('business');
    expect(useTaskMemory.getState().returning).toMatchObject({ page: 'academy', label: '유소년' });
  });
});

describe('responsibilities in their owning workflows (→WEB-43/79)', () => {
  it('gives every responsibility of the former player and staff desks exactly one workflow home', () => {
    const homes = Object.values(WORK_RESPONSIBILITIES).flat();
    expect(new Set(homes).size).toBe(homes.length);
    expect([...homes].sort()).toEqual(
      [...DESK_RESPONSIBILITIES.players, ...DESK_RESPONSIBILITIES.staff].sort(),
    );
    // Sponsorship stays with 구단 운영's 후원 section.
    expect(homes).not.toContain('sponsors');
    expect(DESK_RESPONSIBILITIES.sponsor).toEqual(['sponsors']);
  });
});

describe('club sections and 구단 운영 (→WEB-10/39/110)', () => {
  const at = () => location.pathname + location.search;
  it('opens each section on its default when fresh and on its retained work after', () => {
    browser();
    for (const [section, address] of [
      ['firstTeam', '/first-team?view=players'],
      ['staff', '/staff?view=coaches'],
      ['training', '/training'],
      ['academy', '/academy'],
      ['operations', '/club-operations?view=investment'],
      ['dashboard', '/journal'],
    ] as const) {
      openPrimary(section);
      expect(at(), section).toBe(address);
      expect(useNavigation.getState().page).toBe(section);
    }
    openOperations('sponsor');
    openPrimary('dashboard');
    openPrimary('operations');
    expect(at()).toBe('/club-operations?view=sponsor');
  });
  it('opens an unselected desk as the work it stands for, never as an office place', () => {
    browser();
    for (const [desk, address, page] of [
      ['investment', '/club-operations?view=investment', 'operations'],
      ['sponsor', '/club-operations?view=sponsor', 'operations'],
      ['identity', '/club-operations?view=identity', 'operations'],
      ['finance', '/club-operations?view=investment', 'operations'],
      ['players', '/first-team?view=players', 'firstTeam'],
      ['staff', '/staff?view=coaches', 'staff'],
    ] as const) {
      openBusiness(desk);
      expect(at(), desk).toBe(address);
      expect(useNavigation.getState().page).toBe(page);
    }
    openPrimary('business');
    expect(at()).toBe('/club-operations?view=investment');
    expect(useNavigation.getState().page).toBe('operations');
  });
  it('replaces a stale desk address in place without making it the office entry', () => {
    const entries = browser();
    openPrimary('business');
    entries.length = 0;
    // Back/forward or an old bookmark can still show a desk address on the office page.
    history.replaceState(null, '', '/direction?view=sponsor&work=x');
    leaveDesk();
    expect(at()).toBe('/club-operations?view=sponsor');
    expect(useNavigation.getState().page).toBe('operations');
    expect(entries).toEqual([]);
    openPrimary('business');
    expect(at()).toBe('/club-operations?view=investment');
  });
  it('opens a facility in 재정·투자 with a named return, all scoped to one game', () => {
    browser();
    openTraining('academy');
    openFacility('academy');
    expect(at()).toBe('/club-operations?view=investment&area=youth');
    expect(useFacilityRequest.getState().request).toBe('academy');
    expect(useTaskMemory.getState().returning).toMatchObject({
      page: 'academy',
      address: '/academy',
      label: '유소년',
      target: 'operations',
    });
    returnToTask();
    expect(at()).toBe('/academy');
    openFacility('stadium');
    openOperations('identity');
    openPrimary('dashboard');
    activateTaskWorld('another-game');
    expect(useFacilityRequest.getState().request).toBeUndefined();
    expect(useTaskMemory.getState().addresses).toEqual({});
    expect(useTaskMemory.getState().returning).toBeUndefined();
    // Another game opens 구단 운영 fresh, not on the previous game's design section.
    useNavigation.setState({ page: 'dashboard' });
    openPrimary('operations');
    expect(at()).toBe('/club-operations?view=investment');
  });
});

describe("a home area card's way back (→WEB-10/11)", () => {
  const origin = () => useTaskMemory.getState().values[HOME_AREA_ORIGIN];
  it('a home area card marks its detail; every other opener clears it', () => {
    browser();
    const openers = [
      () => openInvestment(),
      () => openControl('youth', 'academy'),
      () => openFacility('academy'),
    ];
    for (const open of openers) {
      openInvestment('youth', 'home');
      expect(origin()).toBe('youth');
      expect(location.pathname + location.search).toBe(
        '/club-operations?view=investment&area=youth',
      );
      open();
      expect(origin(), open.toString()).toBeUndefined();
    }
    useControlRequest.getState().take();
    useFacilityRequest.getState().take();
    openInvestment('youth', 'home');
    activateTaskWorld('another-game');
    expect(origin()).toBeUndefined();
  });
});

describe('primary office entry', () => {
  it('opens the investment directory and leaves an earlier detour behind', () => {
    browser();
    openTraining('training');
    beginTaskDetour('business');
    expect(useTaskMemory.getState().returning).toMatchObject({ page: 'training' });
    // The clubhouse entrance and the controller open the queue, never a desk or a room door.
    openPrimary('business');
    expect(location.pathname + location.search).toBe('/club-operations?view=investment');
    expect(useNavigation.getState().page).toBe('operations');
    expect(useTaskMemory.getState().returning).toBeUndefined();
  });
});
