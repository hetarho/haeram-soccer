import { describe, expect, it } from 'vitest';
import type { World } from '../../contracts/src/types';
import { createWorld, advanceRound, simulateMatch, nextOwnFixture } from './index';
import {
  MORALE_START,
  moraleAfterMatch,
  moraleBaseline,
  moraleOf,
  moraleState,
  moraleStrength,
  settleMorale,
} from './morale';

const world = () =>
  createWorld({ country: 'ENG', name: 'Morale', color: '#24664f', seed: 'morale', difficulty: 2 });

describe('squad morale', () => {
  it('starts neutral for new clubs and is exactly neutral when absent', () => {
    const w = world();
    expect(w.morale).toBe(MORALE_START);
    expect(moraleStrength(w)).toBe(0);
    const legacy: World = { ...w, morale: undefined };
    expect(moraleOf(legacy)).toBe(MORALE_START);
    expect(moraleStrength(legacy)).toBe(0);
    settleMorale(legacy);
    expect(legacy.morale).toBeUndefined();
  });

  it('rises after wins, falls after defeats, more for wide margins', () => {
    const w = world();
    const record = simulateMatch(w, nextOwnFixture(w)!, false, true).record;
    const home = record.home === w.playerClub;
    const result = (own: number, other: number) => ({
      ...record,
      score: home ? { home: own, away: other } : { home: other, away: own },
    });
    w.morale = 50;
    moraleAfterMatch(w, result(1, 0));
    expect(w.morale).toBe(56);
    moraleAfterMatch(w, result(0, 3));
    expect(w.morale).toBe(48);
    moraleAfterMatch(w, result(2, 2));
    expect(w.morale).toBe(49);
  });

  it('drifts toward a baseline set by squad support and manager trust', () => {
    const w = world();
    w.morale = 20;
    const before = moraleBaseline(w);
    settleMorale(w);
    expect(w.morale).toBeGreaterThan(20);
    w.policy = { support: 5, recruitment: 3, marketing: 1 };
    expect(moraleBaseline(w)).toBeGreaterThan(before);
  });

  it('labels states and changes match strength within bounds', () => {
    expect(moraleState(80)).toBe('peak');
    expect(moraleState(50)).toBe('steady');
    expect(moraleState(10)).toBe('crisis');
    const w = world();
    w.morale = 100;
    expect(moraleStrength(w)).toBe(4);
    w.morale = 0;
    expect(moraleStrength(w)).toBe(-6);
  });

  it('settles every round deterministically', () => {
    const a = world(),
      b = world();
    for (let i = 0; i < 6; i++) {
      advanceRound(a, undefined, false);
      advanceRound(b, undefined, false);
    }
    expect(a.morale).toBe(b.morale);
    expect(a.morale).not.toBe(MORALE_START);
  });
});
