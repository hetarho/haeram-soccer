import { expect, test } from '@playwright/test';
import { advanceRound } from '../../packages/engine/src/index';
import { careerWorld } from '../../packages/engine/src/career.testkit';
import { withoutMatchModel } from '../fixtures/earlier-saves';
import { saveFileOf } from '../fixtures/save-roundtrip';
import { exportWorld } from './club-identity-helpers';
import { startCareer, startFlow } from './start';
import { CURRENT_ENGINE_VERSION } from '../../packages/contracts/src/versions';

/**
 * A career of the current rules, one round in, saved as a writer before the full match model's
 * release saved it, so the earlier-rules copies below carry no model data those rules never wrote
 * (→SAVE-23).
 */
function current() {
  const world = careerWorld({ country: 'ENG', seed: 'legacy-browser-upgrade' });
  advanceRound(world, undefined, false);
  withoutMatchModel(world);
  return world;
}

test('old localStorage saves and retired strategies are ignored and left untouched', async ({
  page,
}) => {
  const oldKeys = ['haeram-soccor:slot:a', 'haeram-soccor:slot:b', 'haeram-soccor:strategies'];
  await page.addInitScript((keys) => {
    for (const key of keys) localStorage.setItem(key, 'retired bytes');
  }, oldKeys);
  await page.goto('/');
  await expect(startFlow(page)).toBeVisible();
  await startCareer(page, { seed: 'retired-keys-takeover' });
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  expect(
    await page.evaluate((keys) => keys.map((key) => localStorage.getItem(key)), oldKeys),
  ).toEqual(oldKeys.map(() => 'retired bytes'));
  await page.reload();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  expect((await exportWorld(page)).engine).toBe(CURRENT_ENGINE_VERSION);
});

test('earlier rules import refused', async ({ page }) => {
  const earlier = await saveFileOf({ ...current(), engine: '1.22.0' });
  await page.goto('/');
  await expect(startFlow(page)).toBeVisible();
  await page.getByLabel('기록 파일 가져오기').setInputFiles({
    name: 'earlier.haeram-save',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(earlier),
  });
  await expect(page.getByRole('alert')).toContainText(
    `이 저장은 규칙 1.22.0 커리어입니다 — 게임 버전 ${CURRENT_ENGINE_VERSION} 커리어만 열 수 있습니다. 새 커리어를 시작하세요`,
  );
  // Nothing changed: no career opened and no slot was taken.
  await expect(page.getByTestId('club-hub')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:games'))).toBeNull();
});
