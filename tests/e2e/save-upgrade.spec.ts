import { idbGet, seedRawCheckpoint } from './checkpoint-storage';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { advanceRound } from '../../packages/engine/src/index';
import { careerWorld } from '../../packages/engine/src/career.testkit';
import { encode } from '../../apps/web/src/adapters/persistence';
import { withoutMatchModel } from '../fixtures/earlier-saves';
import { withoutManagerHistory } from '../fixtures/worlds';
import { openSaveMenu } from './save-menu';
import { startCareer, startFlow } from './start';
import { CURRENT_ENGINE_VERSION } from '../../packages/contracts/src/versions';

/**
 * A career of the current rules, one round in, saved as a writer before the full match model's
 * release saved it, so the earlier-rules copies below carry no model data those rules never wrote
 * (→SAVE-23).
 */
async function current() {
  const world = careerWorld({ country: 'ENG', seed: 'legacy-browser-upgrade' });
  advanceRound(world, undefined, false);
  withoutMatchModel(world);
  return { world, raw: await encode(world, 1, 0) };
}
async function seed(page: Page, raw: string, other?: string) {
  await seedRawCheckpoint(page, other || raw, other ? raw : undefined);
}
async function exportRaw(page: Page, recovery = false) {
  const menu = recovery ? undefined : await openSaveMenu(page);
  const event = page.waitForEvent('download');
  await (menu ?? page)
    .getByRole('button', { name: recovery ? '복구 기록 내보내기' : '기록 내보내기', exact: true })
    .click();
  const file = await event;
  if (menu) await menu.getByRole('button', { name: '창 닫기', exact: true }).click();
  return await readFile((await file.path())!, 'utf8');
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
  expect(await idbGet(page, 'checkpoints', 'active')).not.toBeNull();
  expect(
    await page.evaluate((keys) => keys.map((key) => localStorage.getItem(key)), oldKeys),
  ).toEqual(oldKeys.map(() => 'retired bytes'));
  await page.reload();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  expect(JSON.parse(await exportRaw(page)).engine).toBe(CURRENT_ENGINE_VERSION);
});

test('missing IndexedDB reports a storage error without writing localStorage checkpoints', async ({
  page,
}) => {
  await page.addInitScript(() => Object.defineProperty(window, 'indexedDB', { value: undefined }));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('IndexedDB');
  expect(
    await page.evaluate(() =>
      ['haeram-soccor:slot:a', 'haeram-soccor:slot:b', 'haeram-soccor:manifest'].map((key) =>
        localStorage.getItem(key),
      ),
    ),
  ).toEqual([null, null, null]);
});

test('a founded 0.7.0 career stays as stored in every tab and names its rules (→SAVE-26/29)', async ({
  page,
  context,
}) => {
  // The rules-4.0.0 line, as game version 0.7.0 wrote it: the full match model and the managers'
  // history in their containers.
  const { world } = await current();
  const stored = await encode({ ...world, engine: '0.7.0' });
  expect(JSON.parse(stored).schema).toBeGreaterThanOrEqual(3);
  const holder = await context.newPage();
  await holder.goto('/');
  await expect(startFlow(holder)).toBeVisible();
  await seed(page, stored);
  // A read-only tab names the earlier rules and never writes.
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('규칙 0.7.0');
  expect(await idbGet(page, 'checkpoints', 'active')).toBe(stored);
  await holder.close();
  // The writer keeps it as stored too: no conversion, no reset (→SAVE-26/29).
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('규칙 0.7.0');
  expect(await idbGet(page, 'checkpoints', 'active')).toBe(stored);
  const slot = page.getByRole('listitem', { name: '슬롯 1 · 이전 규칙' });
  await expect(slot.getByRole('button', { name: '삭제', exact: true })).toBeEnabled();
});

test('earlier rules import refused', async ({ page }) => {
  const { raw } = await current();
  const earlier = JSON.stringify({ ...JSON.parse(raw), engine: '1.22.0' });
  await page.goto('/');
  await expect(startFlow(page)).toBeVisible();
  await page.getByLabel('기록 파일 가져오기').setInputFiles({
    name: 'earlier.json',
    mimeType: 'application/json',
    buffer: Buffer.from(earlier),
  });
  await expect(page.getByRole('alert')).toContainText(
    `이 저장은 규칙 1.22.0 커리어입니다 — 게임 버전 ${CURRENT_ENGINE_VERSION} 커리어만 열 수 있습니다. 새 커리어를 시작하세요`,
  );
  // Nothing changed: no career opened and nothing was stored.
  await expect(page.getByTestId('club-hub')).toHaveCount(0);
  expect(await idbGet(page, 'checkpoints', 'active')).toBeNull();
  expect(await idbGet(page, 'checkpoints', 'previous')).toBeNull();
});

test('future selected save stays protected and exports exactly instead of downgrading its predecessor', async ({
  page,
}) => {
  const { world, raw } = await current();
  const next = await encode(world, 2, 1);
  const future = JSON.stringify({ ...JSON.parse(next), engine: '9.0.0' });
  await seed(page, raw, future);
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('지원하지 않는 저장');
  await expect(page.getByTestId('club-hub')).toHaveCount(0);
  const backup = await exportRaw(page, true);
  expect(backup).toBe(future);
  expect(await idbGet(page, 'checkpoints', 'previous')).toBe(raw);
  expect(await idbGet(page, 'checkpoints', 'active')).toBe(future);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('haeram-soccor:manifest')!).generation,
    ),
  ).toBe(2);
});

test('unsupported indexed career stays protected after writer handoff', async ({
  page,
  context,
}) => {
  const holder = await context.newPage();
  await holder.goto('/');
  await expect(startFlow(holder)).toBeVisible();
  const world = withoutManagerHistory((await current()).world);
  world.engine = '2.0.0';
  const raw = await encode(world);
  await seed(page, raw);
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('규칙 2.0.0');
  expect(await idbGet(page, 'checkpoints', 'active')).toBe(raw);
  await holder.close();
  await expect(page.getByRole('alert')).toContainText('규칙 2.0.0');
  expect(await idbGet(page, 'checkpoints', 'active')).toBe(raw);
  const slot = page.getByRole('listitem', { name: '슬롯 1 · 이전 규칙' });
  await expect(slot.getByRole('button', { name: '삭제', exact: true })).toBeEnabled();
  const downloading = page.waitForEvent('download');
  await slot.getByRole('button', { name: '내보내기', exact: true }).click();
  expect(await readFile((await (await downloading).path())!, 'utf8')).toBe(raw);
});
