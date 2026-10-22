import { describe, expect, it, vi } from 'vitest';
import type { World } from '../../contracts/src/types';
import { defaultSettings } from './responsibilities';
import { advanceToNextEvent } from './next-event';
const stop = vi.hoisted(() => ({ day: Infinity, critical: Infinity }));
vi.mock('./stopping', () => ({
  pendingDecisions: () => [],
  stoppingReasons: (w: World) => (w.calendar!.day >= stop.day ? [{ kind: 'window-open' }] : []),
}));
vi.mock('./season', () => ({
  advanceDays: (w: World) => {
    w.calendar!.day++;
    if (!w.fixtures.length)
      w.fixtures.push({
        id: 'new',
        year: w.year,
        round: 1,
        kind: 'league',
        home: 'own',
        away: 'other',
      } as World['fixtures'][number]);
    if (w.calendar!.day === 7) w.fixtures[0].score = { home: 1, away: 0 };
    if (w.calendar!.day === stop.critical) w.critical = 'blocked';
  },
}));
const world = () =>
  ({
    id: 'manual',
    year: 1950,
    playerClub: 'own',
    calendar: { day: 0 },
    settings: {
      ...defaultSettings(),
      mode: 'manual',
      observations: { matchEve: false, windowOpen: false },
    },
    fixtures: [{ id: 'next', year: 1950, round: 1, kind: 'league', home: 'own', away: 'other' }],
    europe: [],
    cups: [],
  }) as unknown as World;
describe('manual optional observation bound', () => {
  it('settles through the next fixture result with no observation enabled', () => {
    stop.day = stop.critical = Infinity;
    const w = world();
    advanceToNextEvent(w);
    expect(w.calendar!.day).toBe(7);
    expect(w.fixtures[0].score).toEqual({ home: 1, away: 0 });
  });
  it('uses the first generated fixture for an empty summer schedule', () => {
    stop.day = stop.critical = Infinity;
    const w = world();
    w.fixtures = [];
    advanceToNextEvent(w);
    expect(w.calendar!.day).toBe(7);
  });
  it.each(['event', 'critical'])('respects an earlier %s', (reason) => {
    stop.day = reason === 'event' ? 3 : Infinity;
    stop.critical = reason === 'critical' ? 2 : Infinity;
    const w = world();
    advanceToNextEvent(w);
    expect(w.calendar!.day).toBe(reason === 'event' ? 3 : 2);
    expect(w.fixtures[0].score).toBeUndefined();
  });
});
