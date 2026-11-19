import { describe, expect, it } from 'vitest';
import { canonical } from '../../contracts/src/index';
import { driftFans, fanFollowing, fanMoodFollowing, FAN_CONFIG } from './fans';
import { gateProjection } from './finance';
import { bookIncomeLines } from './books';
import { settleRound } from './settlement';
import { withOwner } from './testing';
import { worldMarketFixture } from './world-market.testkit';

function fixture(mood?: number) {
  const w = worldMarketFixture();
  w.clubs[0]!.reputation = 50;
  w.clubs[0]!.fans = fanFollowing(50);
  w.stadium = 8;
  if (mood !== undefined) withOwner(w, { fanMood: mood });
  return w;
}

describe('the owned club’s supporters follow fan mood (→ECON-23/9)', () => {
  it.each([
    [60, 1],
    [15, 0.4375],
    [100, 1.5],
  ] as const)(
    'at mood %s, drifts gradually toward the scaled following and scales home demand',
    (mood, factor) => {
      const w = fixture(mood),
        neutral = fixture(60),
        club = w.clubs[0]!;
      expect(fanMoodFollowing(w)).toBe(factor);
      const target = fanFollowing(club.reputation) * factor,
        before = club.fans;
      settleRound(w);
      expect(club.fans).toBe(Math.round(before + (target - before) * FAN_CONFIG.drift));
      let fans = before;
      for (let i = 0; i < 400; i++) fans = driftFans(fans, club.reputation, factor);
      expect(Math.abs(fans - target) / target).toBeLessThan(0.002);
      // Read demand at the same following, before its gradual drift affects the local base.
      const gateWorld = fixture(mood),
        unchanged = canonical(gateWorld);
      expect(gateProjection(gateWorld).wanted).toBeCloseTo(
        gateProjection(neutral).wanted * factor,
        -1,
      );
      expect(canonical(gateWorld)).toBe(unchanged);
    },
  );

  it('keeps neutral and ownerless demand equal, and enforces the bounds', () => {
    expect(gateProjection(fixture(60))).toEqual(gateProjection(fixture()));
    expect(fanMoodFollowing(fixture(0))).toBe(0.4);
    expect(fanMoodFollowing(fixture(100))).toBe(1.5);
    expect(fanMoodFollowing(fixture())).toBe(1);
  });

  it('leaves another club’s book gates unchanged even when its view carries our owner', () => {
    const w = fixture(15),
      npc = w.clubs[1]!;
    const before = bookIncomeLines(w, npc);
    expect(fanMoodFollowing({ ...w, playerClub: npc.id })).toBe(1);
    w.owner!.fanMood = 100;
    expect(bookIncomeLines(w, npc)).toEqual(before);
  });
});
