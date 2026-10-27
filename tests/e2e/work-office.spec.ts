import { expect, test } from '@playwright/test';
import { createWorld } from '../../packages/engine/src/index';
import { RESPONSIBILITY_KEYS } from '../../packages/engine/src/responsibilities';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { exportedCareer } from './career-fixtures';
import { enterOffice, leaveOffice, officeBar, openOfficeArea } from './office';
import { horizontalOverflow } from './layout';

for (const width of [390, 1280]) {
  test(`working desks retain authority and shared command panels at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const w = createWorld({
      name: 'Synthetic Work Office',
      country: 'ENG',
      color: '#224466',
      seed: 'work-office',
      level: 'easy',
    });
    w.settings!.mode = 'manual';
    w.settings!.observations.matchEve = false;
    for (const key of RESPONSIBILITY_KEYS) w.settings!.responsibilities[key] = 'delegated';
    const before = structuredClone(w.settings);
    await importResponsibilityCareer(page, w);
    const entrance = page.getByRole('button', { name: '구단주 사무실 들어가기', exact: true });
    await expect(entrance).toHaveText('구단주 사무실 들어가기');
    const art = await entrance.locator('[data-facility-art="manager"]').boundingBox();
    expect(art!.width / art!.height).toBeCloseTo(3, 1);
    await enterOffice(page);
    const lobby = page.getByTestId('office-lobby');
    await expect(lobby.locator('[data-office-area]')).toHaveCount(5);
    for (const name of ['선수 계약', '스태프 계약', '투자', '후원', '구단 디자인'])
      await expect(lobby.getByRole('button', { name, exact: true })).toBeVisible();
    await expect(lobby.getByRole('button', { name: '운영 방침', exact: true })).toHaveCount(0);
    const overviewTrigger = lobby.getByRole('button', { name: '결재라인 모아보기', exact: true });
    await overviewTrigger.click();
    const overview = page.getByRole('dialog', { name: '결재라인 모아보기', exact: true });
    await expect(
      overview
        .getByRole('group', { name: '선수 영입', exact: true })
        .getByRole('button', { name: '자동', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(overview).toHaveCount(0);
    await expect(overviewTrigger).toBeFocused();
    await openOfficeArea(page, '선수 계약');
    await expect(page).toHaveURL(/view=players$/);
    const inline = page.getByTestId('desk-responsibilities');
    await expect(inline.getByRole('group')).toHaveCount(4);
    await expect(page.getByRole('table', { name: '영입 후보 목록', exact: true })).toBeVisible();
    await page.getByRole('tab', { name: '재계약·매각', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '선수 찾기', exact: true })).toBeVisible();
    await page
      .getByRole('button', { name: /이적 상태 .*바꾸기$/ })
      .first()
      .click();
    await expect(page.getByRole('dialog', { name: '이적 상태', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: '유소년 승격·방출', exact: true }).click();
    await expect(page.getByRole('region', { name: '유소년 아카데미', exact: true })).toBeVisible();
    await openOfficeArea(page, '스태프 계약');
    await expect(page.getByTestId('desk-responsibilities').getByRole('group')).toHaveCount(2);
    await page
      .getByRole('button', { name: /^(교체|감독 선임)$/ })
      .first()
      .click();
    await expect(page.getByRole('dialog', { name: /감독 (선임|교체)/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: '스태프 계약', exact: true }).click();
    await expect(page.getByRole('region', { name: '스태프', exact: true })).toBeVisible();
    await openOfficeArea(page, '투자');
    for (const part of ['stadium', 'training', 'academy'])
      await expect(page.getByTestId(`facility-${part}`)).toBeVisible();
    for (const name of ['선수단·계약', '유소년', '지역', '글로벌'])
      await expect(page.getByRole('button', { name: new RegExp('^' + name + ' ·') })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await officeBar(page).getByRole('button', { name: '사무실', exact: true }).click();
    await openOfficeArea(page, '선수 계약');
    await page.goBack();
    await expect(lobby).toBeVisible();
    await leaveOffice(page);
    expect((await exportedCareer(page)).settings).toEqual(before);
  });
}
