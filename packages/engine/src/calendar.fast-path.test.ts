import { describe, expect, it } from 'vitest';
import { advanceToNextMatch } from './testing';
import { canonical } from '../../contracts/src/index';
import { advanceRound } from './index';
import { world } from './calendar.testkit';
import { CAREER_YEAR } from './career.testkit';

/** The round both worlds play to (T787). */
const ROUNDS = 4;

describe('persistent season calendar', () => {
  it('retains identical match, player and season facts over a few rounds when the fast path skips motion', () => {
    const observed = world('BEL');
    const fast = structuredClone(observed);
    const watched = advanceToNextMatch(observed);
    const skipped = advanceToNextMatch(fast, undefined, false);
    // A released own match is pictured from its script (→MATCH-38/39, T838): watching hands over
    // the script and staging inputs, the fast path neither, and no frames are built at settlement.
    expect(watched?.script?.beats.length).toBeGreaterThan(0);
    expect(watched?.staging).toBeDefined();
    expect(watched?.frames).toEqual([]);
    expect(skipped?.script).toBeUndefined();
    expect(skipped?.staging).toBeUndefined();
    expect(skipped?.frames).toEqual([]);
    expect(skipped?.record).toEqual(watched?.record);
    expect(skipped?.record.players.length).toBeGreaterThan(0);
    expect(canonical(fast)).toBe(canonical(observed));
    // A few rounds, not a whole observed season: observing is the same rule match by match, which
    // grid-throughput's observed league fixture keeps in three eras (→MATCH-7), and
    // calendar.progression-eng keeps the fast path through a season close.
    while (observed.round < ROUNDS) advanceRound(observed);
    while (fast.round < ROUNDS) advanceRound(fast, undefined, false);
    expect(canonical(fast)).toBe(canonical(observed));
    expect(fast.rankHistory?.filter((s) => s.year === CAREER_YEAR)).toHaveLength(ROUNDS + 1);
  });
});
