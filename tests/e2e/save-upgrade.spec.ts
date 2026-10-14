import { CURRENT_ENGINE_VERSION } from '../../packages/contracts/src/versions';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createWorld, advanceRound, quote, BUILD_PRESETS } from '../../packages/engine/src/index';
import { encode, decode } from '../../apps/web/src/adapters/persistence';
import type { World } from '../../packages/contracts/src/types';
import { continueSlot } from './slots';

async function legacy() {
  const world = createWorld({
    country: 'ENG',
    name: 'Legacy Century',
    color: '#385577',
    seed: 'legacy-browser-upgrade',
    difficulty: 2,
  });
  // Rules before 1.16 kept one sponsor, as this older save does.
  world.sponsor = {
    name: 'Legacy Cooperative',
    kind: 'stable',
    annual: quote('ENG', world.year, 300),
    bonus: '0',
    until: world.year + 2,
    lastPaid: world.year - 1,
    index: world.priceIndex,
  };
  advanceRound(world, undefined, false);
  world.engine = '1.0.0';
  delete world.trainingOrders;
  delete world.trainingAt;
  for (const player of world.players) delete player.developed;
  const raw = await encode(world, 1, 0);
  // A load moves the single sponsor of rules before 1.16 into its slot (→SAVE-10).
  return { world, raw, loaded: (await decode(raw)).world };
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
  const { world, raw, loaded } = await legacy();
  await seed(page, raw);
  await page.goto('/');
  // A save from before game slots is listed as slot 1.
  await continueSlot(page);
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
  expect(restored.engine).toBe(CURRENT_ENGINE_VERSION);
  expect(restored.sponsor).toBeUndefined();
  // ENG opens the shirt-front slot in 1979: a 1950 sponsor is the local partner, until its end.
  expect(restored.sponsors).toEqual([
    expect.objectContaining({
      slot: 'local',
      annual: world.sponsor!.annual,
      until: world.sponsor!.until,
    }),
  ]);
  expect(facts(restored)).toEqual(facts(loaded));
});

test('a 1.15 career at intervention level 2 with a reserved strategy upgrades to the three levers', async ({
  page,
}) => {
  const world = createWorld({
    country: 'ENG',
    name: 'Lever Upgrade',
    color: '#385577',
    seed: 'levers-browser-upgrade',
    difficulty: 2,
  });
  const reserved = BUILD_PRESETS.find((preset) => preset.id === 'local-pride')!;
  // Rules 1.15 at intervention level 2: staff switches with training and the academy delegated,
  // contract talks not yet a switch; the attack department at coaching level 최고, this season's
  // strategy change spent and next season's strategy reserved.
  Object.assign(world, {
    engine: '1.15.0',
    delegation: { training: true, academy: true },
    coaching: { attack: 3 },
    buildYear: world.year,
    buildNext: { build: reserved.build },
  });
  delete world.intervention;
  delete world.hiring;
  await seed(page, await encode(world, 1, 0));
  await page.goto('/');
  await continueSlot(page);
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await expect(page.getByTestId('save-status')).toContainText(`저장 완료 · r${world.revision + 1}`);
  const upgraded = (
    await decode((await page.evaluate(() => localStorage.getItem('haeram-soccor:slot:b')))!)
  ).world;
  expect(upgraded.engine).toBe(CURRENT_ENGINE_VERSION);
  // The switches load as the level they were set by: 2, contract talks with the staff.
  expect(upgraded.intervention).toBe(2);
  expect(Object.hasOwn(upgraded, 'delegation')).toBe(false);
  const trigger = page
    .getByRole('region', { name: '시즌 진행', exact: true })
    .getByRole('button', { name: /^개입 수준/ });
  await expect(trigger).toHaveAccessibleName('개입 수준 · 중요한 결정만');
  await expect(trigger).toContainText('개입 2');
  // 최고 becomes 최소 능력 65 with 능력 높은 순 for the attack coach.
  expect(upgraded.hiring?.coaches?.attack).toMatchObject({
    volunteer: false,
    minAbility: 65,
    priority: 'ability',
  });
  // The reservation is dropped and named in the inbox; no slot is locked.
  expect(upgraded.buildNext).toBeUndefined();
  expect(Object.hasOwn(upgraded, 'buildChanged')).toBe(false);
  expect(Object.hasOwn(upgraded, 'buildYear')).toBe(false);
  await page.getByRole('button', { name: /^소식함/ }).click();
  await expect(page.getByRole('dialog', { name: '소식함' })).toContainText(
    `예약했던 방향 ‘${reserved.label}’ 취소`,
  );
  await page
    .getByRole('dialog', { name: '소식함' })
    .getByRole('button', { name: '닫기', exact: true })
    .click();
  await page.getByRole('button', { name: '구단 방향', exact: true }).first().click();
  await expect(page.getByRole('tab', { name: '방향', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByText(/에 변경 가능/)).toHaveCount(0);
  // The attack coach's criteria show at any level; they act once level 4 hands hiring over.
  await page.getByRole('button', { name: '선수·스태프', exact: true }).first().click();
  await page
    .getByRole('tablist', { name: '선수·스태프 보기' })
    .getByRole('tab', { name: '코치진', exact: true })
    .click();
  await expect(page.getByText(/능력 65 이상 · 능력 높은 순/)).toBeVisible();
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
  // Read-only, the tab may not list the game, yet its slot still shows and continues it.
  await expect(reader.getByTestId('game-slots')).toContainText('Legacy Century');
  await continueSlot(reader);
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
  const { world, raw, loaded } = await legacy();
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
  await continueSlot(page);
  await expect(page.getByRole('alert')).toContainText('저장 실패');
  await expect(page.getByTestId('club-hub')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:slot:a'))).toBe(raw);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('haeram-soccor:manifest')!).generation,
    ),
  ).toBe(1);
  const upgraded = (await decode(await exportRaw(page))).world;
  expect(upgraded.engine).toBe(CURRENT_ENGINE_VERSION);
  expect(facts(upgraded)).toEqual(facts(loaded));
  await page.evaluate(() => Object.assign(window, { allowUpgrade: true }));
  await page.getByRole('button', { name: '저장 재시도', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText(`저장 완료 · r${world.revision + 1}`);
  expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:slot:a'))).toBe(raw);
});
