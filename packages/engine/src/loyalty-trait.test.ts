import { describe, expect, it } from 'vitest';
import { validateWorld } from '../../contracts/src/schema';
import { generateProfile, gradeOf, LOYALTY_WEIGHT, personalityRange } from './player';
import { random } from './primitives';
import { makePlayer } from './world';
import { worldMarketFixture } from './world-market.testkit';

describe('loyalty personality (→PLAYER-7/18)', () => {
  it('draws 8/22/40/22/8 percent from its identity key with the specified weights', () => {
    const counts = [0, 0, 0, 0, 0];
    for (let i = 0; i < 20_000; i++) {
      const grade = gradeOf(random(`loyalty-unit:loyalty:p:${i}`));
      counts[grade - 1]!++;
    }
    counts.forEach((n, i) => expect(Math.abs(n / 200 - [8, 22, 40, 22, 8][i]!)).toBeLessThan(1));
    expect(LOYALTY_WEIGHT).toEqual([0, 0.5, 1, 1.5, 2]);
    const p = makePlayer('ENG', 'loyalty-unit', 'p:1', 1930, 60, 'CM', 24);
    expect(p.personality.loyalty).toBe(gradeOf(random('loyalty-unit:loyalty:p:1')));
  });

  it('leaves every earlier profile draw and its remaining stream unchanged', () => {
    const a = random('profile-continuity'),
      b = random('profile-continuity');
    const { personality: low, ...first } = generateProfile(a, 'CM', 60, undefined, 24, 1);
    const { personality: high, ...second } = generateProfile(b, 'CM', 60, undefined, 24, 5);
    expect(first).toEqual(second);
    const { loyalty: lowGrade, ...oldLow } = low;
    const { loyalty: highGrade, ...oldHigh } = high;
    expect(oldLow).toEqual(oldHigh);
    expect([lowGrade, highGrade]).toEqual([1, 5]);
    expect(a()).toBe(b());
  });

  it('round-trips the grade and preserves omitted loyalty on existing saves', () => {
    const w = worldMarketFixture();
    // Boundary-minimum synthetic world; no simulation or generated full world.
    w.catalogHash = '0'.repeat(64);
    while (w.clubs.length < 10) w.clubs.push({ ...w.clubs[2]!, id: `boundary:${w.clubs.length}` });
    w.players[0]!.personality.loyalty = 5;
    delete w.players[1]!.personality.loyalty;
    const loaded = validateWorld(JSON.parse(JSON.stringify(w)));
    expect(loaded.players[0]!.personality.loyalty).toBe(5);
    expect(Object.hasOwn(loaded.players[1]!.personality, 'loyalty')).toBe(false);
    expect(personalityRange(loaded.players[1]!.personality.loyalty, 80)).toEqual([3, 3]);
    w.players[0]!.personality.loyalty = 6 as 5;
    expect(() => validateWorld(w)).toThrow();
  });

  it('uses the same chief-scout grade ranges, including neutral missing loyalty', () => {
    expect(personalityRange(4, 80)).toEqual([4, 4]);
    expect(personalityRange(4, 60)).toEqual([3, 5]);
    expect(personalityRange(4)).toEqual([2, 5]);
    expect(personalityRange(4, 60, 0.5)).toEqual([4, 4]);
    expect(personalityRange(undefined)).toEqual([1, 5]);
  });
});
