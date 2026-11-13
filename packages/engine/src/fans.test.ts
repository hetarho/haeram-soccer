import { describe, expect, it } from 'vitest';
import { canonical } from '../../contracts/src/index';
import {
  BANKRUPT_MESSAGE,
  catchment,
  clubOf,
  driftFans,
  facilityBuiltUnits,
  facilityUpkeepUnits,
  fanFollowing,
  gateProjection,
  localSupporters,
  operate,
  operatingCosts,
  partCostUnits,
  settleRound,
  simulateSeason,
  STADIUM_STEPS,
  stature,
} from './index';
import { holdRows } from './testing';
import { careerWorld } from './career.testkit';

const world = (seed = 'fans-and-money') => careerWorld({ seed });

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

  it('pays nothing for the following itself', () => {
    const w = world(),
      rich = world();
    clubOf(rich).fans = 2_000_000;
    for (const club of [w, rich])
      for (let round = 1; round <= 2; round++) {
        club.round = round;
        settleRound(club);
      }
    expect(rich.income).toBe(w.income);
    expect(rich.events.some((event) => event.kind === 'fan-income')).toBe(false);
  });

  it('lets a club with 2M followers in the third tier draw no more than its catchment', () => {
    const w = world();
    const club = clubOf(w);
    club.tier = 2;
    club.fans = 2_000_000;
    // A stadium for 90,000, the cheapest tickets and every push on the town.
    w.stadium = 8;
    w.ticket = 0.02;
    holdRows(w, { policy: { localInvest: 5 } });
    w.localBase = 100;
    const limit = catchment(w);
    expect(limit).toBeLessThan(20_000);
    expect(localSupporters(w)).toBe(limit);
    const gate = gateProjection(w);
    expect(gate.supporters).toBe(limit);
    expect(gate.capacity).toBeGreaterThan(limit);
    expect(gate.attendanceHigh).toBeLessThanOrEqual(limit);
    // Followers beyond the catchment add nobody.
    const local = structuredClone(w);
    clubOf(local).fans = limit;
    expect(gateProjection(local)).toEqual(gate);
  });

  it('sizes the catchment by division, stature and country', () => {
    const w = world(),
      club = clubOf(w);
    // England's four divisions, each smaller than the one above (→ECON-9).
    const sizes = [0, 1, 2, 3].map((tier) => catchment(w, { ...club, tier }));
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeLessThan(sizes[i - 1]);
    const top = w.clubs.filter((c) => c.country === 'ENG' && c.tier === 0 && !c.representative);
    const giant = top.reduce((a, b) => (stature(w.seed, a.id) >= stature(w.seed, b.id) ? a : b));
    const small = top.reduce((a, b) => (stature(w.seed, a.id) <= stature(w.seed, b.id) ? a : b));
    expect(catchment(w, giant)).toBeGreaterThan(catchment(w, small));
    expect(catchment(w, { ...club, tier: 0, country: 'BEL' })).toBeLessThan(sizes[0]);
  });
});

describe('facility parts (→ECON-32)', () => {
  it('climbs the stadium in eight expansion and rebuild steps, each dearer and dearer to keep', () => {
    expect(STADIUM_STEPS.map((step) => step.capacity)).toEqual([
      2500, 5000, 10000, 15000, 30000, 40000, 60000, 75000, 90000,
    ]);
    expect(STADIUM_STEPS.slice(1).map((step) => step.work)).toEqual([
      'expansion',
      'rebuild',
      'expansion',
      'rebuild',
      'expansion',
      'rebuild',
      'expansion',
      'expansion',
    ]);
    const parts = { stadium: 0, trainingGround: 0, academyFacility: 0 };
    for (let step = 2; step <= 8; step++) {
      // Each step a fixed multiple of the last: no bargain early, no wall later.
      const multiple = partCostUnits('stadium', step) / partCostUnits('stadium', step - 1);
      expect(multiple).toBeGreaterThan(2.4);
      expect(multiple).toBeLessThan(2.6);
      expect(facilityUpkeepUnits({ ...parts, stadium: step })).toBeGreaterThan(
        facilityUpkeepUnits({ ...parts, stadium: step - 1 }),
      );
    }
    for (let level = 2; level <= 5; level++)
      for (const part of ['training', 'academy'] as const)
        expect(partCostUnits(part, level) / partCostUnits(part, level - 1)).toBe(4);
    // The three ladders together take a career (→ECON-29).
    const all = { stadium: 8, trainingGround: 5, academyFacility: 5 };
    expect(facilityBuiltUnits(all)).toBeGreaterThan(1_400_000);
    expect(facilityBuiltUnits(all)).toBeLessThan(1_700_000);
  });
});

describe('bankruptcy', () => {
  it('allows prolonged shallow debt, then ends the career below its debt limit, refusing every action', () => {
    const w = world('going-under');
    const annual = BigInt(operatingCosts(w).annual);
    for (let round = 1; round <= 12; round++) {
      w.round = round;
      // Force a shallow post-settlement debt without accumulating a twelve-round loss.
      w.cash = (-annual / 10n).toString();
      settleRound(w);
      expect(w.insolvent).toBe(round);
      expect(w.bankrupt).toBeUndefined();
      expect(w.critical).toBeUndefined();
    }
    expect(w.inbox?.filter((item) => item.title.startsWith('파산 위기'))).toHaveLength(1);
    w.round = 13;
    w.cash = (-annual * 2n).toString();
    settleRound(w);
    expect(w.bankrupt).toMatchObject({ year: w.year, round: 13 });
    expect(w.events.at(-1)).toMatchObject({ kind: 'bankruptcy' });
    expect(() => operate(w, { type: 'sign-sponsor', slot: 'local', offer: 0 })).toThrow(
      BANKRUPT_MESSAGE,
    );
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
