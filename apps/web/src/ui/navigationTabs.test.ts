import { describe, expect, it } from 'vitest';
import { BOTTOM_ORDER, NAV, TABS } from './navigationTabs';

describe('six navigation entries (→WEB-10)', () => {
  it('puts 팀 immediately before the market in the sidebar and the bottom bar', () => {
    expect(TABS.map(([page]) => page)).toEqual([
      'dashboard',
      'league',
      'europe',
      'team',
      'market',
      'history',
    ]);
    expect(NAV.map(([page]) => page)).toEqual(TABS.map(([page]) => page));
    expect(BOTTOM_ORDER).toEqual(['league', 'europe', 'dashboard', 'team', 'market', 'history']);
    expect([...BOTTOM_ORDER].sort()).toEqual(TABS.map(([page]) => page).sort());
    expect(TABS.find(([id]) => id === 'team')?.slice(1, 3)).toEqual([
      'navigation.team',
      'navigation.team',
    ]);
  });
  it('keeps the office under the clubhouse, our people under 팀 and seasons under competitions', () => {
    expect(TABS[0][3]).toEqual(['dashboard', 'match', 'business', 'training', 'operations']);
    // 팀 stays selected on its detailed people pages (→WEB-112).
    expect(TABS.find(([id]) => id === 'team')?.[3]).toEqual([
      'team',
      'firstTeam',
      'staff',
      'academy',
    ]);
    const owns = TABS.flatMap(([, , , pages]) => pages);
    expect(new Set(owns).size).toBe(owns.length);
    expect(TABS.find(([id]) => id === 'league')?.[3]).toEqual(['league', 'leagueHistory']);
    expect(TABS.find(([id]) => id === 'europe')?.[3]).toEqual(['europe', 'cupHistory']);
    expect(TABS.find(([id]) => id === 'history')?.[3]).toEqual(['history']);
    // The market is a view of the first team: it owns no page of its own.
    expect(TABS.find(([id]) => id === 'market')?.[3]).toEqual([]);
  });
});
