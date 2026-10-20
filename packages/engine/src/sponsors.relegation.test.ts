import { describe, expect, it } from 'vitest';
import { operate, simulateSeason } from './index';
import { cachedWorld } from '../../../tests/fixtures/worlds';
import { club, squadOf, toFinalRound } from './sponsors.testkit';

/** A professional club with an indexed local contract of five seasons. */
function indexedLocal() {
  const w = club({ professional: true });
  operate(w, { type: 'sign-sponsor', slot: 'local', offer: 2 });
  return w;
}

describe('sponsor contracts by slot', () => {
  it('cuts every running contract’s remaining seasons by 30% on relegation', () => {
    const start = indexedLocal();
    expect(start.sponsors![0]).toMatchObject({ kind: 'indexed', until: start.year + 5 });
    // A squad this weak finishes in the last division's bottom two and drops to the amateur league.
    const w = cachedWorld('relegated', () => {
      const w = indexedLocal();
      squadOf(w, 5);
      return toFinalRound(w);
    });
    simulateSeason(w);
    expect(w.lower).toBe(true);
    // Four seasons were left; 70% of them, rounded, remain.
    expect(w.sponsors![0].until).toBe(w.year + 3);
    expect(w.events.findLast((e) => e.kind === 'sponsor-cut')?.detail).toContain(
      '남은 4시즌 → 3시즌',
    );
  });
});
