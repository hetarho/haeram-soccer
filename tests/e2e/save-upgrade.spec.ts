import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { advanceRound } from '../../packages/engine/src/index';
import { careerWorld } from '../../packages/engine/src/career.testkit';
import { encode } from '../../apps/web/src/adapters/persistence';
import { DISABLED_RELEASE } from '../fixtures/releases';
import { withoutManagerHistory } from '../fixtures/worlds';
import { openSaveMenu } from './save-menu';
import { startCareer, startFlow } from './start';
import { CURRENT_ENGINE_VERSION } from '../../packages/contracts/src/versions';

/**
 * A career of the current rules, one round in, taken over before the full match model's release,
 * so the earlier-rules copies below carry no model data those rules never wrote (→SAVE-23).
 */
async function current() {
  const world = careerWorld({ country: 'ENG', seed: 'legacy-browser-upgrade' }, DISABLED_RELEASE);
  advanceRound(world, undefined, false);
  return { world, raw: await encode(world, 1, 0) };
}
async function seed(page: Page, raw: string, other?: string) {
  await page.addInitScript(
    ({ raw, other }) => {
      // Seeded once per tab: a reload after deleting must not bring the save back.
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('haeram-soccor:slot:a', raw);
      const active = other || raw,
        envelope = JSON.parse(active);
      if (other) localStorage.setItem('haeram-soccor:slot:b', other);
      localStorage.setItem(
        'haeram-soccor:manifest',
        JSON.stringify({
          slot: other ? 1 : 0,
          worldId: envelope.worldId,
          generation: envelope.generation,
          parentGeneration: envelope.parentGeneration,
        }),
      );
    },
    { raw, other },
  );
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

test('recognized legacy gameplay resets on writer activation and new careers reload', async ({
  page,
}) => {
  // Earlier rules never tracked manager history, so they wrote only the older containers.
  const world = withoutManagerHistory((await current()).world);
  world.engine = '2.0.0';
  const earlier = await encode(world);
  await seed(page, earlier);
  await page.addInitScript(() => {
    localStorage.setItem('unrelated-preference', 'keep');
    localStorage.setItem('haeram-soccor:strategies', '[]');
  });
  await page.goto('/');
  await page
    .getByRole('listitem', { name: '슬롯 1 · 빈 슬롯' })
    .getByRole('button', { name: '새 게임', exact: true })
    .click();
  await expect(startFlow(page)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:slot:a'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('unrelated-preference'))).toBe('keep');
  // The device strategy library of earlier versions goes when the writer starts (→SAVE-25).
  expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:strategies'))).toBeNull();
  await startCareer(page, { seed: 'legacy-reset-takeover' });
  // The new career's checkpoint is in IndexedDB, none in localStorage (→SAVE-3).
  expect(
    JSON.parse((await page.evaluate(() => localStorage.getItem('haeram-soccor:manifest')))!).slot,
  ).toBe(3);
  expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:slot:a'))).toBeNull();
  await page.reload();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  expect(JSON.parse(await exportRaw(page)).engine).toBe(CURRENT_ENGINE_VERSION);
});

test('a founded 0.7.0 career is cleared once by the writer, read-only tabs leaving it as stored (→SAVE-26)', async ({
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
  expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:slot:a'))).toBe(stored);
  await holder.close();
  // The writer clears it once and says so (→WEB-62's release reset); a new game starts.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('haeram-soccor:slot:a')))
    .toBeNull();
  await page.reload();
  await expect(startFlow(page)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:manifest'))).toBeNull();
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
  expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:slot:a'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:slot:b'))).toBeNull();
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
  expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:slot:a'))).toBe(raw);
  expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:slot:b'))).toBe(future);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('haeram-soccor:manifest')!).generation,
    ),
  ).toBe(2);
});

test('readonly legacy stays intact until writer handoff', async ({ page, context }) => {
  const holder = await context.newPage();
  await holder.goto('/');
  await expect(startFlow(holder)).toBeVisible();
  const world = withoutManagerHistory((await current()).world);
  world.engine = '2.0.0';
  const raw = await encode(world);
  await seed(page, raw);
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('규칙 2.0.0');
  expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:slot:a'))).toBe(raw);
  await holder.close();
  await page
    .getByRole('listitem', { name: '슬롯 1 · 빈 슬롯' })
    .getByRole('button', { name: '새 게임', exact: true })
    .click();
  await expect(startFlow(page)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:slot:a'))).toBeNull();
});
