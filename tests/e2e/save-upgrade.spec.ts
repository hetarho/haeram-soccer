import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createWorld, advanceRound } from '../../packages/engine/src/index';
import { encode } from '../../apps/web/src/adapters/persistence';

/** A career of the current rules, one round in. */
async function current() {
  const world = createWorld({
    country: 'ENG',
    name: 'Legacy Century',
    color: '#385577',
    seed: 'legacy-browser-upgrade',
    level: 'easy' as const,
  });
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
  const event = page.waitForEvent('download');
  await page
    .getByRole('button', { name: recovery ? '복구 기록 내보내기' : '기록 내보내기', exact: true })
    .click();
  const file = await event;
  return await readFile((await file.path())!, 'utf8');
}

test('earlier rules listed with export and delete', async ({ page }) => {
  const { raw } = await current();
  // The same career saved under rules 1.22.0: the player model of 2.0.0 cannot read it.
  const earlier = JSON.stringify({ ...JSON.parse(raw), engine: '1.22.0' });
  await seed(page, earlier);
  await page.goto('/');
  // Its slot says what it is and offers only export and delete (→SAVE-16).
  const card = page.getByTestId('slot-earlier-0');
  await expect(card).toContainText('이전 규칙 (1.22.0)');
  await expect(card.getByRole('button', { name: '이어하기' })).toHaveCount(0);
  await expect(card.getByRole('button', { name: '새 게임으로 덮어쓰기' })).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText(
    '이 저장은 규칙 1.22.0 커리어입니다 — 규칙 2.0.0 커리어만 열 수 있습니다',
  );
  await expect(page.getByTestId('club-hub')).toHaveCount(0);
  // Its export is the stored checkpoint exactly; the raw slot is kept.
  const event = page.waitForEvent('download');
  await card.getByRole('button', { name: '내보내기', exact: true }).click();
  expect(await readFile((await (await event).path())!, 'utf8')).toBe(earlier);
  expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:slot:a'))).toBe(earlier);
  // Deleting it is the explicit way to found a new career there.
  await card.getByRole('button', { name: '삭제', exact: true }).click();
  await page
    .getByRole('dialog', { name: '게임 삭제 확인' })
    .getByRole('button', { name: '삭제', exact: true })
    .click();
  await expect(page.getByRole('button', { name: '클럽 창단' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:slot:a'))).toBeNull();
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
    '이 저장은 규칙 1.22.0 커리어입니다 — 규칙 2.0.0 커리어만 열 수 있습니다. 새 커리어를 시작하세요',
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
