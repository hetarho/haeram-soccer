import { expect, test } from '@playwright/test';
import { careerWorld } from '../../packages/engine/src/career.testkit';
import { initializeReadModels } from '../../packages/engine/src/read-models';
import { PORTABLE_FILE_LIMIT } from '../../apps/web/src/adapters/repository';
import { worldOfSaveFile } from '../fixtures/save-file';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { exportRaw } from './club-identity-helpers';

// Synthetic note details make a >3 MiB checkpoint while keeping the gzip file below 8 MiB.
test('saves and reloads a larger portable gzip checkpoint through IndexedDB', async ({ page }) => {
  test.setTimeout(180000);
  const w = careerWorld({ country: 'ENG', seed: 'fast-checkpoint' });
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
  const file = await exportRaw(page);
  expect(file.length).toBeGreaterThan(1024 * 1024);
  expect(file.length).toBeLessThan(PORTABLE_FILE_LIMIT);
  expect(new TextDecoder().decode(file.subarray(0, 8))).toBe('HRSAVE1\n');
  const saved = await worldOfSaveFile(file);
  expect(saved.events).toEqual(w.events);
  expect(saved.newsJournal).toEqual(w.newsJournal);
  expect(saved.careerReads).toEqual(w.careerReads);
  await page.reload();
  await expect(page.getByTestId('club-hub')).toBeVisible({ timeout: 90000 });
  expect((await worldOfSaveFile(await exportRaw(page))).events).toEqual(w.events);
});
