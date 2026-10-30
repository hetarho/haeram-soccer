import { describe, expect, it } from 'vitest';
import { BOTTOM_ORDER, NAV, ROOMS, TABS } from './navigationTabs';

describe('five navigation entries (→WEB-10)', () => {
  it('lists the clubhouse, league, cups, market and records; the bottom bar centres the clubhouse', () => {
    expect(TABS.map(([page]) => page)).toEqual([
      'dashboard',
      'league',
      'europe',
      'market',
      'history',
    ]);
    expect(NAV.map(([page]) => page)).toEqual(TABS.map(([page]) => page));
    expect(BOTTOM_ORDER).toEqual(['league', 'europe', 'dashboard', 'market', 'history']);
    expect([...BOTTOM_ORDER].sort()).toEqual(TABS.map(([page]) => page).sort());
  });
  it('keeps every room under the clubhouse and each season view under its competition', () => {
    expect(TABS[0][3]).toEqual([
      'dashboard',
      'match',
      'business',
      'firstTeam',
      'staff',
      'training',
      'academy',
    ]);
    const owns = TABS.flatMap(([, , , pages]) => pages);
    expect(new Set(owns).size).toBe(owns.length);
    expect(TABS.find(([id]) => id === 'league')?.[3]).toEqual(['league', 'leagueHistory']);
    expect(TABS.find(([id]) => id === 'europe')?.[3]).toEqual(['europe', 'cupHistory']);
    expect(TABS.find(([id]) => id === 'history')?.[3]).toEqual(['history']);
    // The market is a view of the first team: it owns no page of its own.
    expect(TABS.find(([id]) => id === 'market')?.[3]).toEqual([]);
    expect(ROOMS.map(([page]) => page).every((page) => TABS[0][3].includes(page))).toBe(true);
  });
});
