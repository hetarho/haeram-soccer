import { expect, it } from 'vitest';
import { canonical } from '../../../../packages/contracts/src/index';
import { CAREER_YEAR } from '../../../../packages/engine/src/career.testkit';
import { roundTrip } from '../../../../tests/fixtures/save-roundtrip';
import { tenRichSeasons } from './persistence.testkit';

it('saves a 10-season career into its database and opens the same world', () => {
  const w = tenRichSeasons();
  expect(w.history).toHaveLength(10);
  expect(w.history.map((season) => season.year)).toEqual(
    Array.from({ length: 10 }, (_, index) => CAREER_YEAR + index),
  );
  expect(w.ended).toBeUndefined();
  expect(w.bankrupt).toBeUndefined();
  const owner = w.owner!;
  expect(owner.seasonRecords.map((season) => season.year)).toEqual(
    w.history.map((season) => season.year),
  );
  const injections = w.events.filter((event) => event.kind === 'owner-injection');
  expect(injections.length).toBeGreaterThan(0);
  let fortune = BigInt(owner.takeover.fortune) - BigInt(owner.takeover.price);
  for (const season of owner.seasonRecords) {
    const injected = injections
      .filter((event) => event.year === season.year && event.currency === season.currency)
      .reduce((sum, event) => sum + BigInt(event.amount!), 0n);
    expect(injected).toBe(BigInt(season.injected));
    fortune += BigInt(season.business) - BigInt(season.living) - injected + BigInt(season.dividend);
    expect(BigInt(season.fortune)).toBe(fortune);
  }
  expect(BigInt(owner.fortune)).toBe(fortune);
  expect(canonical(roundTrip(w))).toBe(canonical(w));
}, 600000);
