import { describe, expect, it } from 'vitest';
import { validateWorld } from '../../contracts/src/index';
import { LOAD_CATALOG } from '../../catalogs/src/index';
import { quote, simulateSeason } from './index';
import { cachedWorld } from '../../../tests/fixtures/worlds';
import { club, paidIn, toFinalRound } from './sponsors.testkit';

/** A club with a rules 1.15 sponsor, and the club a load makes of it. */
function migrated() {
  const w = club();
  const annual = quote('ENG', w.year, 300);
  // Rules 1.15 kept one sponsor; a load moves it into its slot (→SAVE-10).
  w.sponsor = {
    name: 'Slot Cooperative',
    kind: 'stable',
    annual,
    bonus: '0',
    until: w.year + 2,
    lastPaid: w.year - 1,
    index: w.priceIndex,
  };
  return { w, annual, loaded: validateWorld(structuredClone(w), LOAD_CATALOG) };
}
/** The loaded club after its first close, and at the second season's final round. */
const migratedFirst = () =>
  cachedWorld('migrated-first', () => {
    const { loaded } = migrated();
    simulateSeason(loaded);
    return loaded;
  });
const migratedLast = () => cachedWorld('migrated-last', () => toFinalRound(migratedFirst()));

describe('sponsor contracts by slot', () => {
  it('pays a sponsor migrated from rules 1.15 on to its end', () => {
    const { w, annual, loaded: start } = migrated();
    expect(start.sponsor).toBeUndefined();
    expect(start.sponsors).toEqual([
      expect.objectContaining({ slot: 'local', annual, from: w.year, until: w.year + 2 }),
    ]);
    // The first season is built once; the second's last round and close, which end it, here.
    const first = migratedFirst();
    expect(paidIn(first, 'local', w.year, '지역 후원')).toBe(BigInt(annual));
    expect(first.sponsors).toHaveLength(1);
    const loaded = migratedLast();
    simulateSeason(loaded);
    expect(paidIn(loaded, 'local', w.year + 1, '지역 후원')).toBe(BigInt(annual));
    expect(loaded.sponsors).toBeUndefined();
    expect(loaded.events.filter((e) => e.kind === 'sponsor-end')).toHaveLength(1);
  });
});
