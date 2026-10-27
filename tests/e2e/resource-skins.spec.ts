import { expect, test, type Locator } from '@playwright/test';
import { readPresentationBaselines } from '../fixtures/presentation';
import { preparedWorld } from '../fixtures/prepared-world';
import { seedSlot, continueSlot } from './slots';
import { openOfficeArea, leaveOffice } from './office';
import { openManagerHistory } from './record-navigation';

test.use({ reducedMotion: 'reduce' });

async function imageSkin(element: Locator) {
  await expect(element).toBeVisible();
  const skin = await element.evaluate((node) => {
    const css = getComputedStyle(node);
    return { material: css.backgroundImage, frame: css.borderImageSource };
  });
  expect(skin.material).toContain('/art/');
  expect(skin.frame).toContain('/art/');
}

for (const theme of readPresentationBaselines().themeRegistry.entries) {
  test(`${theme.id}: shared resource skins across captured management surfaces`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(
      (themeId) =>
        localStorage.setItem(
          'haeram-soccor:presentation',
          JSON.stringify({ themeId, localeId: 'ko-KR' }),
        ),
      theme.id,
    );
    const world = preparedWorld('manager-journey');
    world.settings!.mode = 'manual';
    await seedSlot(page, world);
    await page.goto('/');
    await continueSlot(page);
    await expect(page.getByTestId('club-hub')).toBeVisible();
    const navigate = async (name: string) =>
      page.getByRole('button', { name, exact: true }).filter({ visible: true }).first().click();
    await navigate('선수단·스태프');
    await imageSkin(page.getByRole('textbox', { name: '선수 찾기' }));
    await page.screenshot({ path: `.tmp/resource-audit/${theme.id}-roster.png` });
    const roster = page.locator('[class*="rosterCards"]');
    await roster
      .getByRole('button', { name: / 선수 기록$/ })
      .first()
      .click();
    const dialog = page.getByRole('dialog');
    const profile = dialog.getByRole('region', { name: '선수 프로필', exact: true });
    await profile.scrollIntoViewIfNeeded();
    await imageSkin(profile.locator('[data-ui="position-map"]'));
    await imageSkin(profile.locator('[data-ui="attribute-meter"]').first());
    await dialog.screenshot({ path: `.tmp/resource-audit/${theme.id}-player.png` });
    await dialog.getByRole('button', { name: '창 닫기', exact: true }).click();
    await navigate('클럽 홈');
    await page
      .getByRole('button', { name: '결재라인 모아보기', exact: true })
      .filter({ visible: true })
      .first()
      .click();
    await openOfficeArea(page, '투자');
    const steps = page.locator('[data-ui="facility-steps"]');
    await steps.scrollIntoViewIfNeeded();
    await imageSkin(steps.locator('li').first());
    const readable = await steps
      .locator('li b')
      .evaluateAll((nodes) => nodes.every((node) => node.scrollWidth <= node.clientWidth));
    expect(readable).toBe(true);
    await expect(page.getByTestId('facility-stadium')).toBeVisible();
    await page.screenshot({ path: `.tmp/resource-audit/${theme.id}-facilities.png` });
    await leaveOffice(page);
    await navigate('컵 대회');
    const cupStatus = page.locator('[data-ui="notice"]').filter({ visible: true }).first();
    if (await cupStatus.count()) await imageSkin(cupStatus);
    await page.screenshot({ path: `.tmp/resource-audit/${theme.id}-cups.png` });
    await openManagerHistory(page);
    const history = page.getByRole('region', { name: '감독 이력', exact: true });
    await expect(history).toBeVisible();
    const notice = history.locator('[data-ui="notice"]').first();
    if (await notice.count()) await imageSkin(notice);
    await page.screenshot({ path: `.tmp/resource-audit/${theme.id}-history.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.setViewportSize({ width: 1380, height: 920 });
    await page.screenshot({ path: `.tmp/resource-audit/${theme.id}-desktop.png` });
  });
}
