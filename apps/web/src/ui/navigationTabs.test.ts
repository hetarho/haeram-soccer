import { describe, expect, it } from 'vitest';
import { NAV, TABS } from './navigationTabs';

describe('navigation destinations (→WEB-10)', () => {
  it('puts six tabs on the phone bar, records left of the raised home and the squad levers right', () => {
    expect(TABS.map(([page]) => page)).toEqual([
      'league',
      'europe',
      'history',
      'dashboard',
      'people',
      'training',
    ]);
  });

  it('lists the owner office in neither bar: it opens from home (→WEB-39)', () => {
    expect(TABS.some(([page]) => page === 'business')).toBe(false);
    expect(NAV.some(([page]) => page === 'business')).toBe(false);
    expect(NAV.map(([page]) => page)).toEqual([
      'dashboard',
      'league',
      'europe',
      'history',
      'people',
      'training',
    ]);
  });
});
