import { describe, expect, it } from 'vitest';
import { NAV, TABS } from './navigationTabs';

describe('navigation destinations (→WEB-10)', () => {
  it('groups competitions into Season and History, keeping the raised home before personnel', () => {
    expect(TABS.map(([page]) => page)).toEqual([
      'league',
      'history',
      'dashboard',
      'firstTeam',
      'academy',
      'staff',
    ]);
  });

  it('selects each primary group for all of its local lenses', () => {
    expect(TABS.find(([id]) => id === 'league')?.[3]).toEqual(['league', 'europe']);
    expect(TABS.find(([id]) => id === 'history')?.[3]).toEqual([
      'history',
      'leagueHistory',
      'cupHistory',
    ]);
    expect(NAV.map(([page]) => page)).toEqual(TABS.map(([page]) => page));
    expect(NAV.filter(([, key]) => key === 'navigation.season')).toHaveLength(1);
  });

  it('lists the owner office in neither bar: it opens from home (→WEB-39)', () => {
    expect(TABS.some(([page]) => page === 'business')).toBe(false);
    expect(NAV.some(([page]) => page === 'business')).toBe(false);
    expect(NAV.map(([page]) => page)).toEqual([
      'league',
      'history',
      'dashboard',
      'firstTeam',
      'academy',
      'staff',
    ]);
  });
});
