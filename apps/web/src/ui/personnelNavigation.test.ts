import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  developmentDestination,
  personnelAddress,
  personnelHome,
  personnelRoute,
} from './personnelNavigation';
import {
  beginTaskDetour,
  openPeople,
  openTraining,
  openStaff,
  openCoachSheet,
  returnToTask,
  useNavigation,
  useStaffRequest,
  useCoachRequest,
  usePeopleView,
  useContractTalk,
  openContractTalk,
  activateTaskWorld,
  openPrimary,
  leaveOffice,
  openOfficeLobby,
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
  useCoachRequest.getState().take();
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
    openCoachSheet('assistant', 'recovery', 'player-1');
    expect(location.pathname + location.search).toBe('/training');
    expect(useTaskMemory.getState().returning).toMatchObject({
      address: '/first-team?view=players',
      label: '선수 목록',
      target: 'training',
    });
    expect(useCoachRequest.getState().request).toEqual({
      coach: 'assistant',
      focus: 'recovery',
      player: 'player-1',
    });
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
    expect(useCoachRequest.getState().request).toBeUndefined();
    expect(useTaskMemory.getState().returning).toBeUndefined();
  });

  it('resolves every engine personnel home without a competing page', () => {
    expect(personnelAddress(personnelHome('players'))).toBe('/first-team?view=players');
    expect(personnelAddress(personnelHome('training'))).toBe('/training');
    expect(personnelAddress(personnelHome('academy'))).toBe('/academy');
    expect(personnelAddress(personnelHome('manager'))).toBe('/first-team?view=manager');
    expect(personnelAddress(personnelHome('coaches'))).toBe('/staff?view=coaches');
    expect(developmentDestination('people/manager')).toEqual({
      page: 'firstTeam',
      view: 'manager',
    });
    expect(developmentDestination('people/coaches')).toEqual({ page: 'staff', view: 'coaches' });
    expect(developmentDestination('business/facility')).toEqual({
      page: 'business',
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
        'board-draft': { youth: 2 },
      },
    });
    openTraining('academy');
    useNavigation.getState().setPage('firstTeam');
    expect(history.at(-1)).toBe('/first-team?view=market');
    openTraining('training');
    expect(history.at(-1)).toBe('/training');
    openPeople('candidates');
    expect(history.at(-1)).toBe('/first-team?view=manager&market=1');
    expect(useTaskMemory.getState().values).toMatchObject({
      'market-role': 'DF',
      'market-viewingId': 'candidate-1',
      'board-draft': { youth: 2 },
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
    openCoachSheet('youth');
    expect(location.pathname).toBe('/academy');
    expect(useCoachRequest.getState().request).toEqual({ coach: 'youth' });
    beginTaskDetour('business');
    expect(useTaskMemory.getState().returning).toMatchObject({ page: 'academy', label: '유소년' });
  });
});

describe('primary office entry', () => {
  it('returns a primary office visit to the clubhouse and a contextual visit to its place', () => {
    browser();
    openTraining('training');
    openOfficeLobby();
    leaveOffice();
    expect(useNavigation.getState().page).toBe('training');
    openPrimary('business');
    expect(location.pathname).toBe('/direction');
    leaveOffice();
    expect(useNavigation.getState().page).toBe('dashboard');
  });
});
