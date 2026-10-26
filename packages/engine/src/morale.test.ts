import { describe, expect, it } from 'vitest';
import type { World } from '../../contracts/src/types';
import { createWorld, advanceRound, simulateMatch, nextOwnFixture, settleTraining } from './index';
import {
  HARD_STREAK,
  LEADER_MORALE,
  MORALE_START,
  moraleAfterMatch,
  moraleBaseline,
  moraleOf,
  moraleState,
  moraleStrength,
  settleMorale,
} from './morale';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';

/** The club on the pre-feature path: morale, not the match model, is the subject. */
const world = () =>
  createWorld(
    {
      country: 'ENG',
      name: 'Morale',
      color: '#24664f',
      seed: 'morale',
      level: 'easy' as const,
    },
    DISABLED_RELEASE,
  );

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
    w.policy = { support: 5, recruitment: 3 };
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

  it('hard streak costs morale', () => {
    const w = world(),
      twin = world();
    for (const one of [w, twin]) {
      for (const p of one.players) p.fatigue = 0;
      one.morale = 50;
    }
    w.trainingOrders = { hardStreak: HARD_STREAK.from - 1 };
    settleMorale(w);
    settleMorale(twin);
    expect(w.morale).toBe(twin.morale);
    w.morale = twin.morale = 50;
    w.trainingOrders = { hardStreak: HARD_STREAK.from };
    settleMorale(w);
    settleMorale(twin);
    expect(w.morale).toBe(twin.morale! - HARD_STREAK.cost);
    // The streak counts the squad's settled 하드 rounds and ends with any other focus.
    const run = world();
    for (let round = 1; round <= 3; round++) {
      run.trainingOrders = {
        ...run.trainingOrders,
        assistant: { focus: 'hard', rounds: 4, forced: true },
      };
      run.round = round;
      settleTraining(run);
    }
    expect(run.trainingOrders?.hardStreak).toBe(3);
    run.trainingOrders = {
      ...run.trainingOrders,
      assistant: { focus: 'balanced', rounds: 4, forced: true },
    };
    run.round = 4;
    settleTraining(run);
    expect(run.trainingOrders?.hardStreak).toBeUndefined();
  });

  it('leaders lift the baseline', () => {
    const w = world();
    advanceRound(w, undefined, false);
    for (const p of w.players) p.traits = p.traits.filter((trait) => trait !== 'leader');
    const plain = moraleBaseline(w);
    const xi = w.ownMatches.at(-1)!.players.map((line) => w.players.find((p) => p.id === line.id)!);
    for (const p of xi.slice(0, 2)) p.traits = ['leader'];
    expect(moraleBaseline(w)).toBe(plain + 2 * LEADER_MORALE.each);
    for (const p of xi.slice(0, 5)) p.traits = ['leader'];
    expect(moraleBaseline(w)).toBe(plain + LEADER_MORALE.most);
    // A 리더 on the bench lifts nobody.
    for (const p of xi) p.traits = [];
    const bench = w.players.find((p) => !xi.includes(p))!;
    bench.traits = ['leader'];
    expect(moraleBaseline(w)).toBe(plain);
  });
});
