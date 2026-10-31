import { describe, expect, it } from 'vitest';
import { BUSINESS_TABS, officeAddress, officeView, routeOf } from './state';
import { useTaskMemory } from './taskMemory';

describe('addresses (→WEB-39, WEB-43, WEB-70)', () => {
  it('maps legacy personnel links to their actual canonical workflow', () => {
    for (const [path, search, page, view, address] of [
      ['/squad', '', 'firstTeam', 'players', '/first-team?view=players'],
      ['/transfers', '', 'firstTeam', 'market', '/first-team?view=market'],
      ['/people', '?view=manager', 'firstTeam', 'manager', '/first-team?view=manager'],
      ['/manager', '?view=coaches', 'staff', 'coaches', '/staff?view=coaches'],
      ['/manager', '?view=delegation', 'firstTeam', 'manager', '/first-team?view=manager'],
      ['/first-team', '?view=training', 'training', undefined, '/training'],
    ])
      expect(routeOf(path!, search!)).toEqual({ page, ...(view ? { view } : {}), address });
    expect(routeOf('/training', '?view=academy')).toEqual({ page: 'academy', address: '/academy' });
    for (const path of ['/manager', '/people'])
      expect(routeOf(path, '?view=candidates')).toEqual({
        page: 'firstTeam',
        view: 'manager',
        market: true,
        address: '/first-team?view=manager&market=1',
      });
  });

  it('retains canonical subviews, meaningful filters and direct-load defaults', () => {
    for (const view of ['manager', 'players', 'market'])
      expect(routeOf('/first-team', `?view=${view}`)).toEqual({ page: 'firstTeam', view });
    expect(routeOf('/staff', '?view=coaches')).toEqual({ page: 'staff', view: 'coaches' });
    expect(routeOf('/training', '')).toEqual({ page: 'training' });
    expect(routeOf('/staff', '?view=manager&player=p1')).toEqual({
      page: 'firstTeam',
      view: 'manager',
      address: '/first-team?view=manager&player=p1',
    });
    expect(routeOf('/academy', '')).toEqual({ page: 'academy' });
    expect(routeOf('/first-team', '')).toEqual({
      page: 'firstTeam',
      view: 'players',
      address: '/first-team?view=players',
    });
    expect(routeOf('/staff', '?view=unknown')).toEqual({
      page: 'staff',
      view: 'coaches',
      address: '/staff?view=coaches',
    });
    expect(routeOf('/people', '?view=market&player=p1&line=DF')).toEqual({
      page: 'firstTeam',
      view: 'market',
      address: '/first-team?view=market&player=p1&line=DF',
    });
    expect(routeOf('/leagues', '?view=table')).toEqual({
      page: 'league',
      address: '/season?competition=league&view=table',
    });
    expect(routeOf('/', '')).toEqual({ page: 'dashboard' });
  });

  it('routeOf opens the office lobby at /direction and every area by its ?view= (→WEB-39)', () => {
    expect(routeOf('/direction', '')).toEqual({ page: 'business', view: 'lobby' });
    for (const view of ['players', 'staff', 'investment', 'sponsor', 'identity', 'office'])
      expect(routeOf('/direction', `?view=${view}`)).toEqual({ page: 'business', view });
    // An unknown view opens the lobby.
    expect(routeOf('/direction', '?view=campaigns')).toEqual({
      page: 'business',
      view: 'lobby',
      address: '/direction',
    });
    for (const [search, view, address] of [
      ['', 'lobby', '/direction'],
      ['?view=strategy', 'investment', '/direction?view=investment'],
      ['?view=build', 'investment', '/direction?view=investment'],
      ['?view=finance', 'investment', '/direction?view=investment'],
      ['?view=sponsor', 'sponsor', '/direction?view=sponsor'],
      ['?view=office', 'office', '/direction?view=office'],
      // Views from before 방향: 시설 is 증축 now, 마케팅 and its campaigns sit under 자금.
      ['?view=facility', 'investment', '/direction?view=investment'],
      ['?view=marketing', 'investment', '/direction?view=investment'],
    ] as const)
      expect(routeOf('/business', search)).toEqual({ page: 'business', view, address });
  });

  it('names five working desks, with office reserved for the overview modal', () => {
    expect(BUSINESS_TABS.map(([id, label]) => `${id}:${label}`)).toEqual([
      'players:선수 계약',
      'staff:스태프 계약',
      'investment:재정·투자',
      'sponsor:후원',
      'identity:구단 디자인',
    ]);
    expect(officeView('identity')).toBe('identity');
    expect(officeView(null)).toBe('lobby');
    expect(officeAddress('lobby')).toBe('/direction');
    expect(officeAddress('office')).toBe('/direction?view=office');
    expect(routeOf('/business', '?view=identity')).toEqual({
      page: 'business',
      view: 'identity',
      address: '/direction?view=identity',
    });
  });
});

describe('task memory across games (→WEB-74)', () => {
  it('keeps unfinished work until another game is activated', () => {
    const work = { worldId: 'w1', step: 1 };
    const memory = useTaskMemory.getState();
    memory.activate('w1');
    useTaskMemory.setState({ values: { 'club-identity-draft': work } });
    useTaskMemory.getState().activate('w1');
    expect(useTaskMemory.getState().values['club-identity-draft']).toBe(work);
    useTaskMemory.getState().activate('w2');
    expect(useTaskMemory.getState().values).toEqual({});
  });
});
