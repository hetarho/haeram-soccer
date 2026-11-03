import { expect, test } from '@playwright/test';
import { createWorld } from '../../packages/engine/src/founding';
import { initializeReadModels } from '../../packages/engine/src/read-models';
import {
  INDEXED_CHECKPOINT_LIMIT,
  PORTABLE_FILE_LIMIT,
} from '../../apps/web/src/adapters/repository';
import { decode } from '../../apps/web/src/adapters/persistence';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { committedRaw } from './club-identity-helpers';

// Synthetic note details make a >3 MiB checkpoint while keeping the gzip file below 8 MiB.
test('saves and reloads a larger portable gzip checkpoint through IndexedDB', async ({ page }) => {
  test.setTimeout(180000);
  const w = createWorld({
    country: 'ENG',
    name: 'Fast Checkpoint',
    color: '#223344',
    seed: 'fast-checkpoint',
    level: 'easy',
  });
  w.settings!.mode = 'manual';
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_';
  let state = 1;
  for (let n = 0; n < 3600; n++) {
    let detail = '';
    for (let i = 0; i < 1000; i++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      detail += alphabet[(state >>> 0) % alphabet.length];
    }
    w.events.push({
      year: w.year,
      round: 0,
      kind: 'benchmark-note',
      title: '합성 보관 기록',
      detail,
    });
  }
  initializeReadModels(w);
  await importResponsibilityCareer(page, w);
  await expect(page.getByTestId('save-status')).toContainText('저장 완료', { timeout: 90000 });
  const raw = await committedRaw(page);
  if (raw === null) throw new Error('저장된 체크포인트가 없습니다.');
  expect(raw.length * 2).toBeGreaterThan(3 * 1024 * 1024);
  expect(raw.length * 2).toBeLessThan(INDEXED_CHECKPOINT_LIMIT);
  expect(Buffer.byteLength(raw)).toBeLessThan(PORTABLE_FILE_LIMIT);
  expect(JSON.parse(raw).codec).toBe('gzip-cjk14');
  const saved = (await decode(raw)).world;
  expect(saved.events).toEqual(w.events);
  expect(saved.newsJournal).toEqual(w.newsJournal);
  expect(saved.careerReads).toEqual(w.careerReads);
  await page.reload();
  await expect(page.getByTestId('club-hub')).toBeVisible({ timeout: 90000 });
  const reloaded = await committedRaw(page);
  if (reloaded === null) throw new Error('재로딩한 체크포인트가 없습니다.');
  expect((await decode(reloaded)).world.events).toEqual(w.events);
});
