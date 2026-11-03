import { describe, expect, it } from 'vitest';
import { advanceToNextMatch } from './testing';
import { canonical } from '../../contracts/src/index';
import { advanceRound, closeSeason, simulateSeason } from './index';
import { world } from './calendar.testkit';
import { CAREER_YEAR } from './career.testkit';

describe('persistent season calendar', () => {
  it('retains identical match, player and season facts when the fast path skips motion', () => {
    const observed = world('BEL');
    const fast = structuredClone(observed);
    const watched = advanceToNextMatch(observed);
    const skipped = advanceToNextMatch(fast, undefined, false);
    expect(watched?.frames.length).toBeGreaterThan(0);
    expect(skipped?.frames).toEqual([]);
    expect(skipped?.record).toEqual(watched?.record);
    expect(skipped?.record.players.length).toBeGreaterThan(0);
    expect(canonical(fast)).toBe(canonical(observed));
    while (observed.round < 46) advanceRound(observed);
    closeSeason(observed);
    observed.revision++;
    simulateSeason(fast);
    expect(canonical(fast)).toBe(canonical(observed));
    expect(fast.history).toHaveLength(1);
    expect(fast.rankHistory?.filter((s) => s.year === CAREER_YEAR)).toHaveLength(47);
  });
});
