import { expect, it } from 'vitest';
import { canonical } from '../../../../packages/contracts/src/index';
import { facts } from '../../../../tests/fixtures/read-facts';
import {
  initializeReadModels,
  refreshReadModels,
} from '../../../../packages/engine/src/read-models';
import { Host } from './host';
import { req } from './host.testkit';

it('validates and answers bounded news pages as pure reads, including stale career protection', async () => {
  const host = new Host();
  const w = facts();
  w.id = 'news-test';
  host.world = w;
  initializeReadModels(w);
  for (let n = 0; n < 80; n++)
    w.events.push({
      year: w.year,
      round: n,
      kind: 'transfer-in',
      title: `Player ${n}`,
      detail: 'Fact',
    });
  refreshReadModels(w);
  const before = canonical(w);
  const page = await host.handle(req('page', -1, { type: 'news-page', world: w.id }));
  expect(page.ok, page.error).toBe(true);
  expect(page.newsPage?.items).toHaveLength(50);
  expect(page.view).toBeUndefined();
  expect(page.newsPage?.next).toBeDefined();
  const older = await host.handle(
    req('older', -1, { type: 'news-page', world: w.id, before: page.newsPage?.next }),
  );
  expect(older.newsPage?.items).toHaveLength(30);
  expect((await host.handle(req('foreign', -1, { type: 'news-page', world: 'another' }))).ok).toBe(
    false,
  );
  const filtered = await host.handle(
    req('filter', -1, { type: 'news-page', world: w.id, tag: '경기' }),
  );
  expect(filtered.newsPage?.items).toEqual([]);
  expect(canonical(w)).toBe(before);
});
