import { expect, test, type Page } from '@playwright/test';
import { encode } from '../../apps/web/src/adapters/persistence';
import { createWorld } from '../../packages/engine/src/index';
import { withOwner } from '../../packages/engine/src/testing';
import type { World } from '../../packages/contracts/src/types';
import { acknowledgeEvents } from './events';
import { horizontalOverflow, settle } from './layout';
import { startFlow } from './start';

/** Imports a career that has an owner beside its club (→WEB-114) and opens it. */
async function importCareer(page: Page, w: World) {
  await page.goto('/');
  await expect(startFlow(page)).toBeVisible();
  await page
    .locator('input[type=file]')
    .last()
    .setInputFiles({
      name: 'owner-sheet.json',
      mimeType: 'application/json',
      buffer: Buffer.from(await encode(w)),
    });
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await acknowledgeEvents(page);
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
]) {
  test(`shows the owner's fortune beside the cash and opens the 구단주 sheet at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const w = createWorld({
      country: 'ENG',
      name: 'Owner Fixture',
      color: '#335577',
      seed: 'owner-sheet',
      level: 'normal',
    });
    // 팬 민심 under the floor for three rounds: 퇴진 압박 shows as a status, never a dialog.
    withOwner(w, { fanMood: 12, fanCrisis: { rounds: 3 } });
    await importCareer(page, w);

    const cash = page.getByTestId('hud-cash');
    const fortune = page.getByTestId('hud-fortune');
    await expect(cash).toBeVisible();
    await expect(fortune).toBeVisible();
    await expect(page.getByTestId('fans-crisis')).toContainText('퇴진 압박');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Both pots stay on the right and clear of the centred date.
    await settle(page);
    const date = (await page.locator('[data-ui="hud-date"]').boundingBox())!;
    for (const pot of [cash, fortune]) {
      const box = (await pot.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(date.x + date.width);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    }
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    await fortune.click();
    const sheet = page.getByRole('dialog', { name: '구단주' });
    await expect(sheet).toBeVisible();
    for (const section of ['구단주 자금', '사업 투자', '자금 투입', '배당', '팬 민심'])
      await expect(sheet).toContainText(section);
    // The stake slider previews its odds before anything applies (→OWNER-7, WEB-36).
    await sheet.getByRole('slider').fill('40');
    await expect(sheet).toContainText('자금의 40%를 사업에 걸기');
    await expect(sheet).toContainText('성공 50%');
    await settle(page);
    const sheetBox = (await sheet.boundingBox())!;
    expect(sheetBox.x).toBeGreaterThanOrEqual(0);
    expect(sheetBox.x + sheetBox.width).toBeLessThanOrEqual(viewport.width);
    // The last section is reachable inside the sheet.
    await sheet.getByRole('meter', { name: '팬 민심' }).scrollIntoViewIfNeeded();
    await expect(sheet.getByRole('meter', { name: '팬 민심' })).toBeInViewport();
  });
}

test('a founded career keeps the cash alone in the HUD', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await importCareer(
    page,
    createWorld({
      country: 'ENG',
      name: 'Founded Fixture',
      color: '#335577',
      seed: 'owner-sheet-founded',
      level: 'normal',
    }),
  );
  await expect(page.getByTestId('hud-cash')).toBeVisible();
  await expect(page.getByTestId('hud-fortune')).toHaveCount(0);
});
