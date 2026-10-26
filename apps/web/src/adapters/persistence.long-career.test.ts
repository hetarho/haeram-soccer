import { expect, it } from 'vitest';
import { canonical } from '../../../../packages/contracts/src/index';
import { simulateSeason } from '../../../../packages/engine/src/index';
import { cachedWorld } from '../../../../tests/fixtures/cached-world';
import { checkpoint, decode } from './persistence';
import { world } from './persistence.testkit';

it('builds a codec checkpoint of a 10-season career that decodes to the same world', async () => {
  const w = cachedWorld('ten rich seasons', () => {
    const w = world();
    for (let season = 0; season < 10; season++) {
      w.cash = '999999999999999';
      simulateSeason(w);
    }
    return w;
  });
  expect(w.history).toHaveLength(10);
  const { raw, envelope } = await checkpoint(w, 5, 4);
  expect(envelope).toMatchObject({ worldId: w.id, generation: 5, parentGeneration: 4 });
  expect(JSON.parse(raw)).toEqual(envelope);
  expect(canonical((await decode(raw)).world)).toBe(canonical(w));
}, 600000);
