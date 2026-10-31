import { expect, test } from '@playwright/test';
import { preparedWorld } from '../fixtures/prepared-world';
import { continueSlot, seedSlot } from './slots';
import { clubSections, leaveOffice, officeBar, openOfficeArea } from './office';
import { exportedCareer } from './career-fixtures';
import { horizontalOverflow } from './layout';

for (const width of [360, 1280]) {
  test(`older player and staff desks open the actual workflow at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const world = preparedWorld('manager-journey');
    world.settings!.mode = 'manual';
    world.settings!.observations = { matchEve: false, windowOpen: false };
    const before = structuredClone(world.settings);
    await seedSlot(page, world);
    await page.goto('/');
    await continueSlot(page);
    // An unselected desk is no office place: each work tab lands on its own club section (→WEB-39).
    for (const [asked, now, section] of [
      ['/direction?view=players', /\/first-team\?view=players$/, '1군'],
      ['/direction?view=players&work=contracts', /\/first-team\?view=players$/, '1군'],
      ['/direction?view=players&work=sales', /\/first-team\?view=players$/, '1군'],
      ['/direction?view=players&work=academy', /\/academy$/, '유소년'],
      ['/direction?view=staff', /\/first-team\?view=manager$/, '1군'],
      ['/direction?view=staff&work=coaches', /\/staff\?view=coaches$/, '코치진'],
    ] as const) {
      await page.goto(asked);
      await expect(page).toHaveURL(now);
      await expect(
        clubSections(page).getByRole('tab', { name: section, exact: true }),
      ).toHaveAttribute('aria-selected', 'true');
      await expect(officeBar(page)).toHaveCount(0);
    }
    await page.goto('/direction?view=players&work=sales');
    await expect(page.getByRole('textbox', { name: '선수 찾기', exact: true })).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
    // Recruitment is the market, an entry of its own without the club's section bar (→WEB-10).
    await page.goto('/direction?view=players&work=recruitment');
    await expect(page).toHaveURL(/\/first-team\?view=market$/);
    await expect(page.getByRole('table', { name: '영입 후보 목록', exact: true })).toBeVisible();
    await expect(clubSections(page)).toHaveCount(0);
    // The player responsibilities stay in the shared overview; cancelling commits nothing (→WEB-79).
    await openOfficeArea(page, '결재라인 모아보기');
    const overview = page.getByRole('dialog', { name: '결재라인 모아보기', exact: true });
    for (const responsibility of ['선수 계약', '선수 영입', '선수 매각', '유소년 승격·방출']) {
      const choices = overview.getByRole('group', { name: responsibility, exact: true });
      const applied = await choices.locator('button[aria-pressed="true"]').innerText();
      await choices.locator('button[aria-pressed="false"]').click();
      const confirm = page.getByRole('dialog', {
        name: /^(자동으로 처리하겠습니다.|직접 결재하겠습니다.)$/,
      });
      await expect(confirm).toContainText(responsibility);
      await confirm.getByRole('button', { name: '취소', exact: true }).click();
      await expect(choices.getByRole('button', { name: applied, exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    }
    await leaveOffice(page);
    expect((await exportedCareer(page)).settings).toEqual(before);
  });
}
