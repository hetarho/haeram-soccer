import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createWorld, advanceRound } from '../../packages/engine/src/index';
import { encode } from '../../apps/web/src/adapters/persistence';
import { DISABLED_RELEASE } from '../fixtures/releases';
import { withoutManagerHistory } from '../fixtures/worlds';
import { openSaveMenu } from './save-menu';

/**
 * A career of the current rules, one round in, founded before the full match model's release, so
 * the earlier-rules copies below carry no model data those rules never wrote (→SAVE-23).
 */
async function current() {
  const world = createWorld(
    {
      country: 'ENG',
      name: 'Legacy Century',
      color: '#385577',
      seed: 'legacy-browser-upgrade',
      level: 'easy' as const,
    },
    DISABLED_RELEASE,
  );
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
  await expect(page.getByRole('button', { name: '클럽 창단' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:slot:a'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('unrelated-preference'))).toBe('keep');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  // The new career's checkpoint is in IndexedDB, none in localStorage (→SAVE-3).
  expect(
    JSON.parse((await page.evaluate(() => localStorage.getItem('haeram-soccor:manifest')))!).slot,
  ).toBe(3);
  expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:slot:a'))).toBeNull();
  await page.reload();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  expect(JSON.parse(await exportRaw(page)).engine).toBe('0.7.0');
});

test('a rules-4.0.0 save opens as game version 0.7.0, read-only tabs leaving it as stored', async ({
  page,
  context,
}) => {
  // The rules line 0.7.0 continues: only its version label is rewritten (→SAVE-10).
  const { world } = await current();
  const stored = await encode({ ...world, engine: '4.0.0' });
  const holder = await context.newPage();
  await holder.goto('/');
  await expect(holder.getByRole('button', { name: '클럽 창단' })).toBeVisible();
  await seed(page, stored);
  // A read-only tab shows the career and never writes the upgrade; with another tab playing, its
  // start screen is the slot list, so it opens the career by a deep link.
  await page.goto('/journal');
  await expect(page.getByTestId('club-hub')).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('status').filter({ hasText: '읽기 전용' }).first()).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:slot:a'))).toBe(stored);
  await holder.close();
  // Taking over as the writer activates it as 0.7.0 and commits it to IndexedDB, whose first
  // commit moves the career out of localStorage (→SAVE-3).
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('haeram-soccor:slot:a')))
    .toBeNull();
  expect(JSON.parse(await exportRaw(page))).toMatchObject({ engine: '0.7.0', worldId: world.id });
  await page.reload();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  expect(JSON.parse(await exportRaw(page)).engine).toBe('0.7.0');
});

test('earlier rules import refused', async ({ page }) => {
  const { raw } = await current();
  const earlier = JSON.stringify({ ...JSON.parse(raw), engine: '1.22.0' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '클럽 창단' })).toBeVisible();
  await page.getByLabel('기록 파일 가져오기').setInputFiles({
    name: 'earlier.json',
    mimeType: 'application/json',
    buffer: Buffer.from(earlier),
  });
  await expect(page.getByRole('alert')).toContainText(
    '이 저장은 규칙 1.22.0 커리어입니다 — 게임 버전 0.7.0 커리어만 열 수 있습니다. 새 커리어를 시작하세요',
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
  await expect(holder.getByRole('button', { name: '클럽 창단' })).toBeVisible();
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
  await expect(page.getByRole('button', { name: '클럽 창단' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:slot:a'))).toBeNull();
});
