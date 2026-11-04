import { openCups } from './competition-navigation';
import { openPersonnel } from './personnel-navigation';
import { textContrast } from './contrast';
import { expect, test, type Locator } from '@playwright/test';
import { readPresentationBaselines } from '../fixtures/presentation';
import { preparedWorld } from '../fixtures/prepared-world';
import { seedSlot, continueSlot } from './slots';
import { leaveOffice, openArea } from './office';
import { openManagerHistory } from './record-navigation';

test.use({ reducedMotion: 'reduce' });

async function imageSkin(element: Locator) {
  await expect(element).toBeVisible();
  const skin = await element.evaluate((node) => {
    const css = getComputedStyle(node);
    return {
      material: css.backgroundImage,
      frame: css.borderImageSource,
      slice: css.borderImageSlice,
    };
  });
  expect(skin.frame).toContain('/art/');
  // A full-surface skin draws its authored centre through border-image's fill keyword.
  expect(skin.material.includes('/art/') || skin.slice.split(/\s+/).includes('fill')).toBe(true);
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
    const venue = page.locator('[data-home-part="fixture"] [data-ui="home-away-badge"]');
    await imageSkin(venue);
    expect((await venue.evaluate(textContrast)).ratio).toBeGreaterThanOrEqual(4.5);
    await expect(page.locator('[data-home-part="entrances"]')).toHaveCount(0);
    await page.screenshot({ path: `.tmp/resource-audit/${theme.id}-home.png` });
    // The 결재함 stays whole beside the other transport buttons at both phone widths (→WEB-18).
    for (const width of [360, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const buttons = await page.locator('[data-ui="season-transport"]').evaluate((node) =>
        [...node.querySelectorAll('button')]
          .filter((button) => button.offsetParent)
          .map((button) => {
            const r = button.getBoundingClientRect();
            // Badges sit over the frame on purpose; only the label must stay inside it.
            const label = (button.querySelector('span') ?? button).getBoundingClientRect();
            return {
              name: button.getAttribute('aria-label') ?? button.textContent ?? '',
              left: r.left,
              right: r.right,
              top: r.top,
              bottom: r.bottom,
              labelInside: label.left >= r.left - 0.5 && label.right <= r.right + 0.5,
            };
          }),
      );
      const inbox = buttons.find((button) => button.name.startsWith('결재함'))!;
      // One row: a wrapped transport would push the clock up under celebrations and content.
      expect(
        new Set(buttons.map((button) => Math.round(button.top))).size,
        `${theme.id} ${width}`,
      ).toBe(1);
      expect(inbox, `${theme.id} ${width}`).toBeDefined();
      expect(inbox.left).toBeGreaterThanOrEqual(0);
      expect(inbox.right).toBeLessThanOrEqual(width);
      expect(inbox.labelInside).toBe(true);
      for (const other of buttons.filter((button) => button !== inbox))
        expect(
          inbox.right <= other.left ||
            inbox.left >= other.right ||
            inbox.bottom <= other.top ||
            inbox.top >= other.bottom,
          `${theme.id} ${width}: 결재함 overlaps ${other.name}`,
        ).toBe(true);
      expect(
        (await page.getByTestId('approval-inbox').locator('span').evaluate(textContrast)).ratio,
      ).toBeGreaterThanOrEqual(4.5);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const navigate = async (name: string) =>
      page.getByRole('button', { name, exact: true }).filter({ visible: true }).first().click();
    await openPersonnel(page, 'players');
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
    const sheetHeader = await dialog.locator('[data-ui="dialog-header"]').evaluate((node) => {
      const css = getComputedStyle(node);
      return { fill: css.backgroundColor, material: css.backgroundImage };
    });
    const transport = await page.locator('[data-ui="season-transport"]').evaluate((node) => {
      const css = getComputedStyle(node);
      return { fill: css.backgroundColor, material: css.backgroundImage };
    });
    expect(sheetHeader.fill).not.toBe(transport.fill);
    const navigationFill = await page
      .locator('[data-ui="game-shell"] > nav')
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(transport.fill).not.toBe(navigationFill);
    expect(
      (await page.locator('[data-ui="season-transport"]').evaluate(textContrast)).ratio,
    ).toBeGreaterThanOrEqual(4.5);
    expect(transport.material).toContain('/art/');
    expect(
      (await dialog.locator('[data-ui="dialog-header"] h2').evaluate(textContrast)).ratio,
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      (await dialog.getByRole('button', { name: '창 닫기', exact: true }).evaluate(textContrast))
        .ratio,
    ).toBeGreaterThanOrEqual(4.5);
    await dialog.screenshot({ path: `.tmp/resource-audit/${theme.id}-player.png` });
    await dialog.getByRole('button', { name: '창 닫기', exact: true }).click();
    await openPersonnel(page, 'training');
    await page.screenshot({ path: `.tmp/resource-audit/${theme.id}-training.png` });
    await openPersonnel(page, 'academy');
    await page.screenshot({ path: `.tmp/resource-audit/${theme.id}-academy.png` });
    await openPersonnel(page, 'coaches');
    await page.screenshot({ path: `.tmp/resource-audit/${theme.id}-staff.png` });
    await navigate('클럽하우스');
    await page
      .getByRole('button', { name: '결재 설정', exact: true })
      .filter({ visible: true })
      .first()
      .click();
    // 경기장 reads the stadium's stage with its art beside its next work (→WEB-14, ECON-32).
    const facility = (await openArea(page, '경기장')).locator('#investment-facility-stadium');
    await facility.scrollIntoViewIfNeeded();
    const inset = await facility.evaluate((node) => {
      const css = getComputedStyle(node);
      return [css.paddingTop, css.paddingRight, css.paddingBottom, css.paddingLeft].map(parseFloat);
    });
    expect(inset.every((value) => value >= 12)).toBe(true);
    await expect(facility.locator('[data-facility-art]')).toHaveCount(1);
    await page.screenshot({ path: `.tmp/resource-audit/${theme.id}-facilities.png` });
    await leaveOffice(page);
    await openCups(page);
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
