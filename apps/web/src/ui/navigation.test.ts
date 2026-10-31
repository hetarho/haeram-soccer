import { describe, expect, it } from 'vitest';
import { BUSINESS_TABS, officeAddress, officeView, routeOf } from './state';
import { useTaskMemory } from './taskMemory';

describe('addresses (→WEB-39, WEB-43, WEB-70)', () => {
  it('maps legacy personnel links to their actual canonical workflow', () => {
    for (const [path, search, page, view, address] of [
      ['/squad', '', 'firstTeam', 'players', '/first-team?view=players'],
      ['/transfers', '', 'firstTeam', 'market', '/first-team?view=market'],
      // The manager stands with his staff in 코치진 (→WEB-43): every older manager address lands there.
      ['/people', '?view=manager', 'staff', 'coaches', '/staff?view=coaches'],
      ['/manager', '?view=coaches', 'staff', 'coaches', '/staff?view=coaches'],
      ['/manager', '?view=delegation', 'staff', 'coaches', '/staff?view=coaches'],
      ['/first-team', '?view=manager', 'staff', 'coaches', '/staff?view=coaches'],
      ['/first-team', '?view=training', 'training', undefined, '/training'],
    ])
      expect(routeOf(path!, search!)).toEqual({ page, ...(view ? { view } : {}), address });
    expect(routeOf('/training', '?view=academy')).toEqual({ page: 'academy', address: '/academy' });
    // The replacement market opens over the same manager workflow, however it was asked for.
    for (const [path, search] of [
      ['/manager', '?view=candidates'],
      ['/people', '?view=candidates'],
      ['/first-team', '?view=manager&market=1'],
      ['/staff', '?view=manager&market=1'],
    ])
      expect(routeOf(path, search)).toEqual({
        page: 'staff',
        view: 'coaches',
        market: true,
        address: '/staff?view=coaches&market=1',
      });
    expect(routeOf('/staff', '?view=coaches&market=1')).toEqual({
      page: 'staff',
      view: 'coaches',
      market: true,
    });
    // Only the manager's market: 이적시장 is the first team's market view, never this flag.
    expect(routeOf('/first-team', '?view=market&market=1')).toEqual({
      page: 'firstTeam',
      view: 'market',
      address: '/first-team?view=market',
    });
  });

  it('retains canonical subviews, meaningful filters and direct-load defaults', () => {
    for (const view of ['players', 'market'])
      expect(routeOf('/first-team', `?view=${view}`)).toEqual({ page: 'firstTeam', view });
    expect(routeOf('/staff', '?view=coaches')).toEqual({ page: 'staff', view: 'coaches' });
    expect(routeOf('/training', '')).toEqual({ page: 'training' });
    expect(routeOf('/staff', '?view=manager&player=p1')).toEqual({
      page: 'staff',
      view: 'coaches',
      address: '/staff?view=coaches&player=p1',
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

  it('routeOf keeps /direction for the approval lobby and its overview (→WEB-39)', () => {
    expect(routeOf('/direction', '')).toEqual({ page: 'business', view: 'lobby' });
    expect(routeOf('/direction', '?view=office')).toEqual({ page: 'business', view: 'office' });
    // An unknown view opens the lobby.
    expect(routeOf('/direction', '?view=campaigns')).toEqual({
      page: 'business',
      view: 'lobby',
      address: '/direction',
    });
    expect(routeOf('/business', '')).toEqual({
      page: 'business',
      view: 'lobby',
      address: '/direction',
    });
    expect(routeOf('/business', '?view=office')).toEqual({
      page: 'business',
      view: 'office',
      address: '/direction?view=office',
    });
  });

  it('sends older unselected money, sponsor and design desks to 구단 운영 (→WEB-110)', () => {
    for (const [search, view] of [
      ['?view=investment', 'investment'],
      ['?view=sponsor', 'sponsor'],
      ['?view=identity', 'identity'],
      // Views from before 방향: 시설 is 증축 now, 마케팅 and its campaigns sit under 자금.
      ['?view=strategy', 'investment'],
      ['?view=build', 'investment'],
      ['?view=finance', 'investment'],
      ['?view=facility', 'investment'],
      ['?view=marketing', 'investment'],
    ] as const)
      for (const path of ['/direction', '/business'])
        expect(routeOf(path, search)).toEqual({
          page: 'operations',
          view,
          address: `/club-operations?view=${view}`,
        });
  });

  it('sends older unselected personnel desks to the actual workflow their work names', () => {
    for (const [search, page, view, address] of [
      ['?view=players', 'firstTeam', 'players', '/first-team?view=players'],
      ['?view=players&work=overview', 'firstTeam', 'players', '/first-team?view=players'],
      ['?view=players&work=contracts', 'firstTeam', 'players', '/first-team?view=players'],
      ['?view=players&work=sales', 'firstTeam', 'players', '/first-team?view=players'],
      ['?view=players&work=recruitment', 'firstTeam', 'market', '/first-team?view=market'],
      ['?view=players&work=market', 'firstTeam', 'market', '/first-team?view=market'],
      ['?view=players&work=academy', 'academy', undefined, '/academy'],
      ['?view=staff', 'staff', 'coaches', '/staff?view=coaches'],
      ['?view=staff&work=manager', 'staff', 'coaches', '/staff?view=coaches'],
      ['?view=staff&work=coaches', 'staff', 'coaches', '/staff?view=coaches'],
    ] as const)
      expect(routeOf('/direction', search)).toEqual({
        page,
        ...(view ? { view } : {}),
        address,
      });
    // Task-specific selection survives the move; the desk's own keys do not.
    expect(routeOf('/direction', '?view=players&work=recruitment&player=p1&line=DF')).toEqual({
      page: 'firstTeam',
      view: 'market',
      address: '/first-team?view=market&player=p1&line=DF',
    });
  });

  it('keeps a selected request in its office review ahead of any desk move', () => {
    expect(routeOf('/direction', '?view=investment&request=r1&requestWorld=w1')).toEqual({
      page: 'business',
      view: 'investment',
    });
    expect(routeOf('/direction', '?view=players&work=sales&request=r1&requestWorld=w1')).toEqual({
      page: 'business',
      view: 'players',
    });
    expect(routeOf('/business', '?view=finance&request=r1&requestWorld=w1')).toEqual({
      page: 'business',
      view: 'investment',
      address: '/direction?view=investment&request=r1&requestWorld=w1',
    });
  });

  it('resolves /club-operations with its section, 재정·투자 by default', () => {
    expect(routeOf('/club-operations', '')).toEqual({
      page: 'operations',
      view: 'investment',
      address: '/club-operations?view=investment',
    });
    for (const view of ['investment', 'sponsor', 'identity'])
      expect(routeOf('/club-operations', `?view=${view}`)).toEqual({ page: 'operations', view });
    expect(routeOf('/club-operations', '?view=players&slot=kit')).toEqual({
      page: 'operations',
      view: 'investment',
      address: '/club-operations?view=investment&slot=kit',
    });
  });

  it('keeps desk names only for request reviews, with office reserved for the overview modal', () => {
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
