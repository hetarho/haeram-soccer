import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectCompactStandings, expectHomeBounds, horizontalOverflow, settle } from './layout';
import { textContrast } from './contrast';

async function navigate(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).filter({ visible: true }).first().click();
}

async function surface(locator: Locator) {
  return locator.evaluate((element) => {
    const css = getComputedStyle(element);
    return {
      padding: parseFloat(css.paddingLeft),
      radius: css.borderTopLeftRadius,
      cardRadius: css.getPropertyValue('--card-radius').trim(),
      background: css.backgroundColor,
      material: css.backgroundImage,
      frame: css.borderImageSource,
      overflow: element.scrollWidth - element.clientWidth,
    };
  });
}

for (const themeId of ['matchday-print', 'sticker-club']) {
  test(`${themeId}: next-event text remains readable on the dark transport`, async ({ page }) => {
    await page.addInitScript((themeId) => {
      localStorage.setItem(
        'haeram-soccor:presentation',
        JSON.stringify({ themeId, localeId: 'ko-KR' }),
      );
    }, themeId);
    await page.goto('/');
    await page.getByRole('button', { name: '클럽 창단' }).click();
    await page.getByRole('button', { name: /진행 방식 변경/ }).click();
    await page.getByRole('button', { name: '수동 모드로 변경', exact: true }).click();
    const next = page.getByRole('button', { name: '다음 이벤트', exact: true });
    for (const width of [360, 390, 1380]) {
      await page.setViewportSize({ width, height: width === 360 ? 740 : 844 });
      await settle(page);
      await expect(next).toBeVisible();
      expect((await next.evaluate(textContrast)).ratio).toBeGreaterThanOrEqual(4.5);
      const spacing = await next.evaluate((button) => {
        const box = button.getBoundingClientRect();
        const bar = button.closest('section')!.getBoundingClientRect();
        return { above: box.top - bar.top, below: bar.bottom - box.bottom };
      });
      expect(spacing.above).toBeGreaterThanOrEqual(8);
      expect(spacing.below).toBeGreaterThanOrEqual(8);
    }
  });
}

for (const themeId of ['standard', 'pixel']) {
  test(`${themeId}: management cards, transport and choices retain inset content and separate actions`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((themeId) => {
      localStorage.setItem(
        'haeram-soccor:presentation',
        JSON.stringify({ themeId, localeId: 'ko-KR' }),
      );
    }, themeId);
    await page.goto('/');
    await page.getByRole('button', { name: '클럽 창단' }).click();
    await expect(page.getByTestId('club-hub')).toBeVisible();
    await expect(
      page.getByTestId('club-hub').getByRole('button', { name: '게임 슬롯', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: '기록 내보내기', exact: true })).toHaveCount(0);
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await page.getByRole('button', { name: '설정', exact: true }).click();
    const saveMenu = page.getByRole('dialog', { name: '설정', exact: true });
    await expect(
      saveMenu.getByRole('button', { name: '기록 내보내기', exact: true }),
    ).toBeVisible();
    await expect(saveMenu.getByRole('button', { name: '게임 슬롯', exact: true })).toBeVisible();
    await expect(saveMenu.locator('label:has(input[type="file"])')).toBeVisible();
    await saveMenu.getByRole('button', { name: '창 닫기', exact: true }).click();
    await page.getByRole('button', { name: /진행 방식 변경/ }).click();
    await page
      .getByRole('dialog', { name: '게임 진행 방식이 변경됩니다.', exact: true })
      .getByRole('button', { name: '수동 모드로 변경', exact: true })
      .click();
    await navigate(page, '구단 운영');
    await page.getByRole('tab', { name: '구단주 사무실', exact: true }).click();
    const office = page.getByTestId('owner-office');
    await expect(
      page
        .getByRole('region', { name: '시즌 진행', exact: true })
        .getByRole('button', { name: '진행 방식 변경', exact: true }),
    ).toBeVisible();
    await expect(office.getByRole('group', { name: '진행 모드', exact: true })).toHaveCount(0);

    for (const width of [360, 390, 760, 1380]) {
      await page.setViewportSize({ width, height: width === 360 ? 740 : 844 });
      await settle(page);
      const reports = office.getByRole('group', { name: '경기 전날 보고', exact: true });
      await expect(reports.getByRole('button')).toHaveCount(2);
      const choices = await reports.getByRole('button').evaluateAll((buttons) =>
        buttons.map((button) => {
          const box = button.getBoundingClientRect(),
            css = getComputedStyle(button);
          return {
            width: box.width,
            height: box.height,
            padding: parseFloat(css.paddingLeft),
            overflow: button.scrollWidth - button.clientWidth,
          };
        }),
      );
      expect(Math.abs(choices[0].width - choices[1].width)).toBeLessThanOrEqual(1);
      expect(
        choices.every(
          (choice) => choice.height >= 44 && choice.padding >= 8 && choice.overflow <= 0,
        ),
      ).toBe(true);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

      await navigate(page, '클럽 홈');
      await expectHomeBounds(page);
      const fixture = page.getByRole('region', { name: '다음 경기', exact: true });
      const card = await surface(fixture);
      expect(card.padding).toBeGreaterThanOrEqual(width <= 760 ? 4 : 6);
      expect(card.radius).toBe(card.cardRadius);
      expect(card.background).not.toBe('rgba(0, 0, 0, 0)');
      expect(card.material).toContain(`/art/${themeId}/ui/`);
      expect(card.frame).toContain(`/art/${themeId}/ui/`);
      expect(card.overflow).toBeLessThanOrEqual(0);
      await expect(
        fixture.getByRole('button', { name: '전술·선발 준비', exact: true }),
      ).toBeVisible();
      const transport = page.getByRole('region', { name: '시즌 진행', exact: true });
      await expect(transport.getByTestId('progression-mode')).toHaveText('MANUAL');
      await expect(
        transport.getByRole('button', { name: '진행 방식 변경', exact: true }),
      ).toBeVisible();
      await expect(
        transport.getByRole('button', { name: '진행 방식 변경', exact: true }),
      ).toHaveAttribute('data-ui', 'primary');
      await expect(page.locator('[data-ui="season-overview"] button')).toHaveCount(0);
      await expect(page.locator('main footer')).toHaveCount(0);
      await expect(
        page.getByText('수동 진행 · 다음 이벤트를 선택하세요', { exact: true }),
      ).toHaveCount(0);
      await expect(
        transport.getByRole('button', { name: '다음 이벤트', exact: true }),
      ).toBeVisible();
      const nextAction = await transport
        .getByRole('button', { name: '다음 이벤트', exact: true })
        .evaluate((button) => {
          const box = button.getBoundingClientRect();
          const bar = button.closest('section')!.getBoundingClientRect();
          const css = getComputedStyle(button);
          return {
            height: box.height,
            padding: parseFloat(css.paddingTop),
            above: box.top - bar.top,
            below: bar.bottom - box.bottom,
            icon: !!button.querySelector('svg,img'),
          };
        });
      expect(nextAction.height).toBeGreaterThanOrEqual(44);
      expect(nextAction.padding).toBeGreaterThanOrEqual(8);
      expect(nextAction.above).toBeGreaterThanOrEqual(8);
      expect(nextAction.below).toBeGreaterThanOrEqual(8);
      expect(nextAction.icon).toBe(true);
      expect(
        (
          await transport
            .getByRole('button', { name: '다음 이벤트', exact: true })
            .evaluate(textContrast)
        ).ratio,
      ).toBeGreaterThanOrEqual(4.5);

      if (width === 360 || width === 390) {
        await navigate(page, '리그');
        await page.getByRole('tab', { name: '순위표', exact: true }).click();
        await page.getByTestId('view-scroller').evaluate((element) => element.scrollTo(0, 0));
        await expectCompactStandings(page);
      }

      await navigate(page, '선수단·스태프');
      const panel = page
        .locator('section')
        .filter({ has: page.getByRole('heading', { name: '우리 클럽의 선수들', exact: true }) });
      const row = panel.locator('article').first();
      await expect(row).toBeVisible();
      const beforeHover = await surface(row);
      await row.hover();
      await settle(page);
      const hovered = await surface(row);
      expect(hovered.padding).toBeGreaterThanOrEqual(8);
      expect(hovered.radius).toBe(hovered.cardRadius);
      expect(hovered.overflow).toBeLessThanOrEqual(0);
      if (await page.evaluate(() => matchMedia('(hover: hover)').matches)) {
        expect(hovered.background).not.toBe(beforeHover.background);
      }
      // Keyboard enters the profile link first; its focus indicator follows the whole row.
      const name = row.getByRole('button', { name: /선수 기록$/ }).first();
      // Safari's default Tab policy skips ordinary buttons; establish keyboard modality first.
      await page.keyboard.press('Tab');
      await name.focus();
      await expect(name).toBeFocused();
      expect(await row.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid');
      const stance = row.getByRole('button', { name: /이적 상태 .*바꾸기$/ });
      await stance.click();
      const dialog = page.getByRole('dialog', { name: '이적 상태', exact: true });
      await expect(dialog).toBeVisible();
      await expect(page.getByRole('region', { name: '선수 프로필', exact: true })).toHaveCount(0);
      await dialog.getByRole('button', { name: '창 닫기', exact: true }).click();
      // The inset space still opens the player's profile, independently of the stance button.
      await row.click({ position: { x: 8, y: 8 } });
      await expect(page.getByRole('region', { name: '선수 프로필', exact: true })).toBeVisible();
      await page.getByRole('dialog').getByRole('button', { name: '창 닫기', exact: true }).click();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await navigate(page, '구단 운영');
      await page.getByRole('tab', { name: '구단주 사무실', exact: true }).click();
    }
  });
}
