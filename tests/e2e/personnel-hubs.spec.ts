import { expect, test } from '@playwright/test';
import { preparedWorld } from '../fixtures/prepared-world';
import { seedSlot, continueSlot } from './slots';
import { openPersonnel } from './personnel-navigation';
import { openLeague, openClubRecords } from './competition-navigation';
import { horizontalOverflow, settle } from './layout';

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
]) {
  test(`six gameplay entries and personnel workflows at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const world = preparedWorld('manager-journey');
    world.settings!.mode = 'manual';
    await seedSlot(page, world);
    await page.goto('/');
    await continueSlot(page);
    const nav = page.getByRole('navigation', {
      name: viewport.width <= 760 ? '모바일 게임 메뉴' : '게임 메뉴',
      exact: true,
    });
    expect(
      await nav
        .getByRole('button')
        .evaluateAll((buttons) =>
          buttons.map((button) => button.getAttribute('aria-label') ?? button.textContent?.trim()),
        ),
    ).toEqual([
      '클럽하우스',
      '구단주 사무실',
      '감독 사무실',
      '코칭스태프실',
      '훈련장',
      '유소년 훈련장',
    ]);
    for (const button of await nav.getByRole('button').all()) {
      const box = await button.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await openLeague(page);
    await expect(page.getByRole('tablist', { name: '시즌', exact: true })).toBeVisible();
    await openClubRecords(page);
    await expect(page.getByRole('tablist', { name: '역사', exact: true })).toBeVisible();
    await openPersonnel(page, 'players');
    await expect(
      page.getByRole('tablist', { name: '감독 사무실', exact: true }).getByRole('tab'),
    ).toHaveText(['감독', '선수 목록', '이적시장']);
    await expect(page.getByTestId('facility-overview')).toHaveAccessibleName('드레싱 룸');
    const search = page.getByRole('textbox', { name: '선수 찾기' });
    await search.fill('Retained work');
    const date = await page.getByTestId('game-date').innerText();
    const trigger = page
      .getByRole('region', { name: '시즌 진행', exact: true })
      .getByRole('button', { name: '결재라인 모아보기', exact: true });
    await trigger.click();
    const overview = page.getByRole('dialog', { name: '결재라인 모아보기', exact: true });
    const contracts = overview.getByRole('group', { name: '선수 계약', exact: true });
    const applied = contracts.locator('button[aria-pressed="true"]');
    const appliedLabel = await applied.innerText();
    await contracts.locator('button[aria-pressed="false"]').click();
    const confirmation = page.getByRole('dialog', {
      name: /^(자동으로 처리하겠습니다.|직접 결재하겠습니다.)$/,
    });
    await confirmation.getByRole('button', { name: '취소', exact: true }).click();
    await expect(
      contracts.getByRole('button', { name: appliedLabel, exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(overview).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(search).toHaveValue('Retained work');
    await expect(page.getByTestId('game-date')).toHaveText(date);
    await expect(page.getByTestId('progression-mode')).toHaveText('MANUAL');
    await openPersonnel(page, 'market');
    await expect(page.getByRole('region', { name: '선수 영입 데스크' })).toBeVisible();
    await openPersonnel(page, 'training');
    await expect(page).toHaveURL(/training$/);
    await expect(page.getByTestId('training-focus')).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/first-team\?view=market$/);
    await page.goForward();
    await expect(page.getByTestId('training-focus')).toBeVisible();
    await openPersonnel(page, 'academy');
    await expect(page.getByTestId('facility-overview')).toHaveAccessibleName('유소년 아카데미');
    await expect(page.getByTestId('youth-focus')).toBeVisible();
    await openPersonnel(page, 'manager');
    await expect(page.getByTestId('facility-overview')).toHaveAccessibleName('감독실');
    await expect(page.getByTestId('place-activities-manager')).toBeVisible();
    await openPersonnel(page, 'coaches');
    await expect(page.getByTestId('facility-overview')).toHaveAccessibleName('스태프 사무실');
    await expect(page.getByTestId('place-activities-coaching')).toBeVisible();
    await openPersonnel(page, 'players');
    await expect(search).toHaveValue('Retained work');
    await openPersonnel(page, 'coaches');
    await page.reload();
    await expect(page.getByRole('tab', { name: '스태프', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await nav.getByRole('button', { name: '클럽하우스', exact: true }).click();
    await nav.getByRole('button', { name: '구단주 사무실', exact: true }).click();
    await page.getByRole('button', { name: '선수 계약', exact: true }).click();
    await expect(page.getByTestId('player-office-overview')).toBeVisible();
    await page.getByRole('tab', { name: '영입', exact: true }).click();
    await expect(page.getByRole('region', { name: '선수 영입 데스크' })).toBeVisible();
    await settle(page);
    expect(await horizontalOverflow(page)).toBe(0);
  });
}
