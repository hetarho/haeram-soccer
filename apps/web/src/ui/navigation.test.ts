import { describe, expect, it } from 'vitest';
import { routeOf } from './state';

describe('addresses (→WEB-39, WEB-43, WEB-70)', () => {
  it("routeOf maps /squad, /transfers and /manager with each view to 사람's tabs", () => {
    expect(routeOf('/squad', '')).toEqual({ page: 'people', view: 'players', address: '/people' });
    expect(routeOf('/transfers', '')).toEqual({
      page: 'people',
      view: 'market',
      address: '/people?view=market',
    });
    expect(routeOf('/manager', '')).toEqual({
      page: 'people',
      view: 'manager',
      address: '/people?view=manager',
    });
    expect(routeOf('/manager', '?view=coaches')).toEqual({
      page: 'people',
      view: 'coaches',
      address: '/people?view=coaches',
    });
    expect(routeOf('/manager', '?view=delegation')).toEqual({
      page: 'people',
      view: 'manager',
      address: '/people?view=manager',
    });
    // The candidates view opens 감독 with the manager market, from either address.
    for (const pathname of ['/manager', '/people'])
      expect(routeOf(pathname, '?view=candidates')).toEqual({
        page: 'people',
        view: 'manager',
        market: true,
        address: '/people?view=manager',
      });
  });

  it('routeOf keeps /people and /training views', () => {
    expect(routeOf('/people', '')).toEqual({ page: 'people', view: 'players' });
    for (const view of ['market', 'manager', 'coaches'])
      expect(routeOf('/people', `?view=${view}`)).toEqual({ page: 'people', view });
    expect(routeOf('/training', '')).toEqual({ page: 'training', view: 'training' });
    expect(routeOf('/training', '?view=academy')).toEqual({ page: 'training', view: 'academy' });
    // The first tab keeps no ?view=; an unknown view opens the first tab.
    expect(routeOf('/people', '?view=players')).toEqual({
      page: 'people',
      view: 'players',
      address: '/people',
    });
    expect(routeOf('/training', '?view=gym')).toEqual({
      page: 'training',
      view: 'training',
      address: '/training',
    });
    // Other pages keep their addresses as they are.
    expect(routeOf('/leagues', '?view=table')).toEqual({ page: 'league' });
    expect(routeOf('/history/1951', '')).toEqual({ page: 'history' });
    expect(routeOf('/', '')).toEqual({ page: 'dashboard' });
  });

  it('routeOf opens 방향 at /direction and every older /business address on its tab', () => {
    expect(routeOf('/direction', '')).toEqual({ page: 'business', view: 'strategy' });
    for (const view of ['build', 'finance', 'sponsor'])
      expect(routeOf('/direction', `?view=${view}`)).toEqual({ page: 'business', view });
    // The first tab keeps no ?view=; an unknown view opens the first tab.
    expect(routeOf('/direction', '?view=strategy')).toEqual({
      page: 'business',
      view: 'strategy',
      address: '/direction',
    });
    expect(routeOf('/direction', '?view=campaigns')).toEqual({
      page: 'business',
      view: 'strategy',
      address: '/direction',
    });
    for (const [search, view, address] of [
      ['', 'strategy', '/direction'],
      ['?view=strategy', 'strategy', '/direction'],
      ['?view=build', 'build', '/direction?view=build'],
      ['?view=finance', 'finance', '/direction?view=finance'],
      ['?view=sponsor', 'sponsor', '/direction?view=sponsor'],
      // Views from before 방향: 시설 is 증축 now, 마케팅 and its campaigns sit under 자금.
      ['?view=facility', 'build', '/direction?view=build'],
      ['?view=marketing', 'finance', '/direction?view=finance'],
    ] as const)
      expect(routeOf('/business', search)).toEqual({ page: 'business', view, address });
  });
});
