import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import {
  BANKRUPTCY_ROUNDS,
  BANKRUPT_MESSAGE,
  clubOf,
  createWorld,
  driftFans,
  facilityCostUnits,
  facilityUpkeepUnits,
  fanFollowing,
  fanIncomeUnits,
  MAX_FACILITIES,
  operate,
  operatingCosts,
  settleRound,
  simulateSeason,
} from './index';

const world = (seed = 'fans-and-money') =>
  createWorld({ country: 'ENG', name: 'Gate Town', color: '#224433', seed, difficulty: 2 });

describe('supporters follow reputation, not the stadium', () => {
  it('drifts toward a following that grows with reputation and has no ceiling', () => {
    expect(fanFollowing(12)).toBeLessThan(fanFollowing(50));
    expect(fanFollowing(90)).toBeGreaterThan(1_000_000);
    expect(fanFollowing(100)).toBeGreaterThan(fanFollowing(90));
    let fans = 1_000;
    for (let round = 0; round < 200; round++) fans = driftFans(fans, 75);
    expect(Math.abs(fans - fanFollowing(75)) / fanFollowing(75)).toBeLessThan(0.01);
    // Past five million a following keeps its supporters.
    expect(driftFans(9_000_000, 100)).toBeGreaterThan(5_000_000);
  });

  it('pays a global fan income every round, more for more supporters but less per head', () => {
    expect(fanIncomeUnits(1_000_000)).toBeGreaterThan(fanIncomeUnits(100_000));
    expect(fanIncomeUnits(1_000_000) / 1_000_000).toBeLessThan(fanIncomeUnits(100_000) / 100_000);
    const w = world();
    w.round = 1;
    settleRound(w);
    w.round = 2;
    settleRound(w);
    // One ledger line a season, however many rounds it pays.
    const entries = w.events.filter((event) => event.kind === 'fan-income');
    expect(entries).toHaveLength(1);
    expect(BigInt(entries[0].amount!)).toBe(BigInt(w.income));
  });
});

describe('facility levels', () => {
  it('has twenty levels, each dearer than the last and dearer to keep', () => {
    expect(MAX_FACILITIES).toBe(20);
    for (let level = 2; level <= MAX_FACILITIES; level++) {
      expect(facilityCostUnits(level)).toBeGreaterThan(facilityCostUnits(level - 1) * 1.3);
      expect(facilityUpkeepUnits(level)).toBeGreaterThan(facilityUpkeepUnits(level - 1));
    }
    expect(facilityCostUnits(1)).toBe(250);
    expect(facilityCostUnits(20)).toBeGreaterThan(100_000);
  });

  it('reads a club built to level 30 by older rules as level 20', () => {
    const saved = JSON.parse(canonical(world('tall-stadium')));
    saved.facilities = 30;
    expect(validateWorld(saved).facilities).toBe(20);
  });
});

describe('bankruptcy', () => {
  it('counts rounds in debt and ends the career after eight, refusing every action', () => {
    const w = world('going-under');
    const perRound = BigInt(operatingCosts(w).annual) / 46n;
    // Shallow debt: under half a season's costs, so only the count can end it.
    w.cash = (-perRound).toString();
    for (let round = 1; round < BANKRUPTCY_ROUNDS; round++) {
      w.round = round;
      settleRound(w);
      expect(w.insolvent).toBe(round);
      expect(w.bankrupt).toBeUndefined();
      expect(w.critical).toBeUndefined();
    }
    expect(w.inbox?.filter((item) => item.title.startsWith('파산 위기'))).toHaveLength(1);
    w.round = BANKRUPTCY_ROUNDS;
    settleRound(w);
    expect(w.bankrupt).toMatchObject({ year: w.year, round: BANKRUPTCY_ROUNDS });
    expect(w.events.at(-1)).toMatchObject({ kind: 'bankruptcy' });
    expect(() => operate(w, { type: 'facility' })).toThrow(BANKRUPT_MESSAGE);
    const before = canonical(w);
    simulateSeason(w);
    expect(canonical(w)).toBe(before);
  });

  it('forgives the count once cash is back above zero', () => {
    const w = world('back-from-the-brink');
    w.cash = '-1';
    w.round = 1;
    settleRound(w);
    expect(w.insolvent).toBe(1);
    w.cash = '999999999';
    w.round = 2;
    settleRound(w);
    expect(w.insolvent).toBeUndefined();
    expect(clubOf(w).fans).toBeGreaterThan(0);
  });
});
