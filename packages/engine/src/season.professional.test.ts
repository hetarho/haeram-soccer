import { describe, expect, it } from 'vitest';
import { exchange, lastRound } from './season.testkit';

describe('amateur exchange (→LEAGUE-6)', () => {
  it('keeps the strength order in a season the own club plays professionally', () => {
    const w = lastRound('ENG', true);
    // exchange() expects the strongest amateur clubs up in every country.
    expect(exchange(w).down).toHaveLength(2);
  });
});
