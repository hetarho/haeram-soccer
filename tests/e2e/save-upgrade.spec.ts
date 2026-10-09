import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createWorld, advanceRound, operate } from '../../packages/engine/src/index';
import { encode, decode } from '../../apps/web/src/adapters/persistence';
import type { World } from '../../packages/contracts/src/types';

async function legacy() {
  const world = createWorld({
    country: 'ENG',
    name: 'Legacy Century',
    color: '#385577',
    seed: 'legacy-browser-upgrade',
    difficulty: 2,
  });
  operate(world, { type: 'sponsor', kind: 'stable' });
  advanceRound(world, undefined, false);
  world.engine = '1.0.0';
  delete world.training;
  delete world.trainingAt;
  for (const player of world.players) delete player.developed;
  return { world, raw: await encode(world, 1, 0) };
}
async function seed(page: Page, raw: string, other?: string) {
  await page.addInitScript(
    ({ raw, other }) => {
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
  const event = page.waitForEvent('download');
  await page
    .getByRole('button', { name: recovery ? '복구 기록 내보내기' : '기록 내보내기', exact: true })
    .click();
  const file = await event;
  return await readFile((await file.path())!, 'utf8');
}
const facts = (w: World) =>
  Object.fromEntries(Object.entries(w).filter(([key]) => key !== 'engine' && key !== 'revision'));

test('writer upgrades a legacy career through the other slot without changing past facts', async ({
  page,
}) => {
  const { world, raw } = await legacy();
  await seed(page, raw);
  await page.goto('/');
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await expect(page.getByTestId('save-status')).toContainText(`저장 완료 · r${world.revision + 1}`);
  const stored = await page.evaluate(() => ({
    manifest: JSON.parse(localStorage.getItem('haeram-soccor:manifest')!),
    old: localStorage.getItem('haeram-soccor:slot:a'),
    next: localStorage.getItem('haeram-soccor:slot:b'),
  }));
  expect(stored.old).toBe(raw);
  expect(stored.manifest).toMatchObject({ slot: 1, generation: 2, parentGeneration: 1 });
  const restored = (await decode(stored.next!)).world;
  expect(restored.engine).toBe('1.4.0');
  expect(facts(restored)).toEqual(facts(world));
});

test('read-only legacy view does not perform a disk or metadata upgrade', async ({
  page,
  context,
}) => {
  const { world, raw } = await legacy();
  await page.goto('/');
  await expect(page.getByTestId('club-founding')).toBeVisible();
  await page.evaluate((raw) => {
    const e = JSON.parse(raw);
    localStorage.setItem('haeram-soccor:slot:a', raw);
    localStorage.setItem(
      'haeram-soccor:manifest',
      JSON.stringify({ slot: 0, worldId: e.worldId, generation: 1, parentGeneration: 0 }),
    );
  }, raw);
  const reader = await context.newPage();
  await reader.goto('/');
  await expect(reader.getByRole('status').filter({ hasText: '이 탭은 읽기 전용' })).toBeVisible();
  await expect(reader.getByTestId('hub-play')).toBeDisabled();
  await expect(reader.getByTestId('save-status')).toContainText(`저장 완료 · r${world.revision}`);
  expect(await reader.evaluate(() => localStorage.getItem('haeram-soccor:slot:a'))).toBe(raw);
  expect(await reader.evaluate(() => localStorage.getItem('haeram-soccor:slot:b'))).toBeNull();
  await reader.close();
});

test('future selected save stays protected and exports exactly instead of downgrading its predecessor', async ({
  page,
}) => {
  const { world, raw } = await legacy();
  const current = await encode({ ...world, engine: '1.3.0' }, 2, 1);
  const future = JSON.stringify({ ...JSON.parse(current), engine: '9.0.0' });
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

test('upgrade quota failure keeps old disk and exports new memory before an explicit retry', async ({
  page,
}) => {
  const { world, raw } = await legacy();
  await seed(page, raw);
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Object.assign(window, { allowUpgrade: false });
    Storage.prototype.setItem = function (key: string, value: string) {
      if (
        key === 'haeram-soccor:slot:b' &&
        !(window as typeof window & { allowUpgrade: boolean }).allowUpgrade
      )
        throw new DOMException('Upgrade quota', 'QuotaExceededError');
      return set.call(this, key, value);
    };
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('저장 실패');
  await expect(page.getByTestId('club-hub')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:slot:a'))).toBe(raw);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('haeram-soccor:manifest')!).generation,
    ),
  ).toBe(1);
  const upgraded = (await decode(await exportRaw(page))).world;
  expect(upgraded.engine).toBe('1.4.0');
  expect(facts(upgraded)).toEqual(facts(world));
  await page.evaluate(() => Object.assign(window, { allowUpgrade: true }));
  await page.getByRole('button', { name: '저장 재시도', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText(`저장 완료 · r${world.revision + 1}`);
  expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:slot:a'))).toBe(raw);
});
