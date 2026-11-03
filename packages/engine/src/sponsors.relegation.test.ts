import { describe, expect, it } from 'vitest';
import { clubOf, operate, simulateSeason } from './index';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import { club, squadOf, toFinalRound } from './sponsors.testkit';

/**
 * A third-division club with an indexed local contract of five seasons: the last division
 * relegates nobody (→LEAGUE-16), so the one above it is the lowest that can go down.
 */
function indexedLocal() {
  const w = club({ club: 'ENG:2:0:0' });
  operate(w, { type: 'sign-sponsor', slot: 'local', offer: 2 });
  return w;
}

describe('sponsor contracts by slot', () => {
  it('cuts every running contract’s remaining seasons by 30% on relegation', () => {
    const start = indexedLocal();
    expect(start.sponsors![0]).toMatchObject({ kind: 'indexed', until: start.year + 5 });
    // A squad this weak finishes in the third division's bottom four and drops to the fourth.
    const w = cachedWorld('relegated-third', () => {
      const w = indexedLocal();
      squadOf(w, 5);
      return toFinalRound(w);
    });
    simulateSeason(w);
    expect(clubOf(w).tier).toBe(3);
    // Four seasons were left; 70% of them, rounded, remain.
    expect(w.sponsors![0].until).toBe(w.year + 3);
    expect(w.events.findLast((e) => e.kind === 'sponsor-cut')?.detail).toContain(
      '남은 4시즌 → 3시즌',
    );
  });
});
