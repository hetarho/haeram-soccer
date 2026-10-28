import { describe, expect, it } from 'vitest';
import { NAV, TABS } from './navigationTabs';

describe('six football places (→WEB-10)', () => {
  it('uses the same ordered, distinct destinations on desktop and mobile', () => {
    expect(TABS.map(([page]) => page)).toEqual([
      'dashboard',
      'business',
      'firstTeam',
      'staff',
      'training',
      'academy',
    ]);
    expect(NAV.map(([page]) => page)).toEqual(TABS.map(([page]) => page));
    expect(TABS.every(([, short, full]) => short === full)).toBe(true);
  });
  it('keeps competition details and records selected under the clubhouse', () => {
    expect(TABS[0][3]).toEqual([
      'dashboard',
      'league',
      'europe',
      'history',
      'leagueHistory',
      'cupHistory',
      'match',
    ]);
    const owns = TABS.flatMap(([, , , pages]) => pages);
    expect(new Set(owns).size).toBe(owns.length);
    expect(TABS.find(([id]) => id === 'firstTeam')?.[3]).toEqual(['firstTeam']);
    expect(TABS.find(([id]) => id === 'staff')?.[3]).toEqual(['staff']);
    expect(TABS.find(([id]) => id === 'training')?.[3]).toEqual(['training']);
  });
});
