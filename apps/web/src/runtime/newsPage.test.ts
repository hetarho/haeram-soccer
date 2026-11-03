import { INDEXED_CHECKPOINT_LIMIT } from '../adapters/repository';
import { requestSchema, type CodecJob } from './protocol';
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

it('bounds the requested storage budget and passes it unchanged to the codec without changing facts', async () => {
  const host = new Host(),
    w = facts();
  w.id = 'budget-world';
  w.revision = 0;
  host.world = w;
  const jobs: CodecJob[] = [];
  host.codec = { postMessage: (job) => jobs.push(job) };
  expect(
    (
      await host.handle({
        ...req('fast', -1, { type: 'save' }),
        checkpointBudget: INDEXED_CHECKPOINT_LIMIT,
      })
    ).ok,
  ).toBe(true);
  expect(jobs[0].checkpointBudget).toBe(INDEXED_CHECKPOINT_LIMIT);
  expect((await host.handle(req('compact', -1, { type: 'save' }))).ok).toBe(true);
  expect(jobs[1]).not.toHaveProperty('checkpointBudget');
  expect(
    requestSchema.safeParse({
      ...req('oversize', -1, { type: 'save' }),
      checkpointBudget: INDEXED_CHECKPOINT_LIMIT + 1,
    }).success,
  ).toBe(false);
  expect(jobs).toHaveLength(2);
  expect(w.revision).toBe(0);
});
