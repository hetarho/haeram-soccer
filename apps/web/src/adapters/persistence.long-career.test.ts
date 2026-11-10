import { expect, it } from 'vitest';
import { canonical } from '../../../../packages/contracts/src/index';
import { checkpoint, decode } from './persistence';
import { tenRichSeasons } from './persistence.testkit';

it('builds an IndexedDB codec checkpoint of a 10-season career that decodes to the same world', async () => {
  const w = tenRichSeasons();
  expect(w.history).toHaveLength(10);
  const { raw, envelope } = await checkpoint(w, 5, 4);
  expect(envelope).toMatchObject({ worldId: w.id, generation: 5, parentGeneration: 4 });
  expect(JSON.parse(raw)).toEqual(envelope);
  expect(canonical((await decode(raw)).world)).toBe(canonical(w));
}, 600000);
