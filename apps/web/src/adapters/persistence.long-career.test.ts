import { expect, it } from 'vitest';
import { canonical } from '../../../../packages/contracts/src/index';
import { CAREER_YEAR } from '../../../../packages/engine/src/career.testkit';
import { checkpoint, decode } from './persistence';
import { tenRichSeasons } from './persistence.testkit';

it('builds an IndexedDB codec checkpoint of a 10-season career that decodes to the same world', async () => {
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
  const { raw, envelope } = await checkpoint(w, 5, 4);
  expect(envelope).toMatchObject({ worldId: w.id, generation: 5, parentGeneration: 4 });
  expect(JSON.parse(raw)).toEqual(envelope);
  expect(canonical((await decode(raw)).world)).toBe(canonical(w));
}, 600000);
