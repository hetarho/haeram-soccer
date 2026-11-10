import { expect, test, type Page } from '@playwright/test';
import { encode } from '../../apps/web/src/adapters/persistence';
import { careerWorld } from '../../packages/engine/src/career.testkit';
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

// No CSS rule falls between 360 and 390 px or 740 and 844 px on this screen, so a fit at 360x740
// implies one at 390x844 (T786).
for (const viewport of [{ width: 360, height: 740 }]) {
  test(`shows the owner's fortune with the cash and opens 자금 관리 at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const w = careerWorld({ country: 'ENG', seed: 'owner-sheet' });
    // 팬 민심 under the floor for three rounds: 퇴진 압박 shows as a status, never a dialog.
    withOwner(w, { fanMood: 12, fanCrisis: { rounds: 3 } });
    await importCareer(page, w);

    // One HUD action shows the club's cash over the owner's business funds (→WEB-114).
    const money = page.getByTestId('hud-cash');
    await expect(money).toBeVisible();
    await expect(money).toHaveAccessibleName(/^구단 자금 .+ · 사업자금 .+ · 자금 관리$/);
    await expect(page.getByTestId('fans-crisis')).toContainText('퇴진 압박');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // It stays on the right and clear of the centred date.
    await settle(page);
    const date = (await page.locator('[data-ui="hud-date"]').boundingBox())!;
    const box = (await money.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(date.x + date.width);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    await money.click();
    const sheet = page.getByRole('dialog', { name: '자금 관리' });
    await expect(sheet).toBeVisible();
    for (const section of ['구단 운영비 · 자금 여력', '사업 투자', '자금 투입', '배당'])
      await expect(sheet).toContainText(section);
    // The stake slider previews its odds before anything applies (→OWNER-7, WEB-36).
    await sheet.getByRole('slider', { name: /사업에 걸기/ }).fill('40');
    await expect(sheet).toContainText('자금의 40%를 사업에 걸기');
    await expect(sheet).toContainText('성공 60%');
    // It settles monthly, winning or losing 5% of what is staked (→OWNER-7).
    await expect(sheet).toContainText('정산마다 투자금의 5%를 벌거나 잃어요');
    await settle(page);
    const sheetBox = (await sheet.boundingBox())!;
    expect(sheetBox.x).toBeGreaterThanOrEqual(0);
    expect(sheetBox.x + sheetBox.width).toBeLessThanOrEqual(viewport.width);
    // The last section is reachable inside the sheet.
    const dividend = sheet.getByRole('slider', { name: '배당 비율', exact: true });
    await dividend.scrollIntoViewIfNeeded();
    await expect(dividend).toBeInViewport();
  });
}

test('a career without owner state keeps the cash alone in the HUD', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // As a hand-built world holds it (T670's no-owner cases).
  const ownerless = careerWorld({ country: 'ENG', seed: 'owner-sheet-founded' });
  delete ownerless.owner;
  await importCareer(page, ownerless);
  await expect(page.getByTestId('hud-cash')).toBeVisible();
  await expect(page.getByTestId('hud-cash')).not.toContainText('사업자금');
  await expect(page.getByTestId('hud-cash')).toHaveAccessibleName(/^구단 자금 .+ · 자금 관리$/);
});
