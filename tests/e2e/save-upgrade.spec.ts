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

test('an earlier-rules career is refused, never converted, and its slot kept (→SAVE-16)', async ({
  page,
}) => {
  const { raw } = await current();
  // The same career saved under rules 1.22.0: the player model of 2.0.0 cannot read it.
  const earlier = JSON.stringify({ ...JSON.parse(raw), engine: '1.22.0' });
  await seed(page, earlier);
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('지원하지 않는 저장');
  await expect(page.getByTestId('club-hub')).toHaveCount(0);
  expect(await exportRaw(page, true)).toBe(earlier);
  expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:slot:a'))).toBe(earlier);
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
