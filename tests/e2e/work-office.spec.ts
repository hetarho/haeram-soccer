import { expect, test } from '@playwright/test';
import { careerWorld } from '../../packages/engine/src/career.testkit';
import { RESPONSIBILITY_KEYS } from '../../packages/engine/src/responsibilities';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { exportedCareer } from './career-fixtures';
import {
  approvalQueue,
  areaPage,
  closeDecisionSettings,
  homeAreas,
  OFFICE,
  officeDialog,
  officeMenu,
  openArea,
  openOfficePage,
  openSponsors,
} from './office';
import { horizontalOverflow } from './layout';
import { clubhouseTab } from './competition-navigation';

// Both phones run at 844 px of height, and no CSS rule falls between 360 and 390 px on the
// home or the office (T786).
for (const width of [360, 1280]) {
  test(`the office's menu, its areas and 구단 운영 hold its proactive work at ${width}`, async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize({ width, height: 844 });
    const w = careerWorld({ country: 'ENG', seed: 'work-office' });
    w.settings!.mode = 'manual';
    w.settings!.observations.matchEve = false;
    for (const key of RESPONSIBILITY_KEYS) w.settings!.responsibilities[key] = 'delegated';
    const before = structuredClone(w.settings);
    await importResponsibilityCareer(page, w);
    // The home briefing has no office menu; it lists the office's eight areas under the
    // illustrated entrance, which leads into the office and its menu (→WEB-10/11).
    await clubhouseTab(page).click();
    await expect(page.getByTestId('club-hub')).toBeVisible();
    await expect(officeMenu(page)).toHaveCount(0);
    await expect(homeAreas(page).getByRole('button')).toHaveCount(8);
    const office = await openOfficePage(page);
    const menu = officeMenu(page);
    await expect(menu.getByRole('button')).toHaveText(['오버뷰', /^결재함/, '결재 설정']);
    await expect(clubhouseTab(page)).toHaveAttribute('aria-current', 'page');
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    // 오버뷰, 결재함 and 결재 설정 each open their modal over the office, which stays (→WEB-39).
    for (const [button, dialog] of [
      ['오버뷰', '우리 팀 오버뷰'],
      [/^결재함/, '결재함'],
      ['결재 설정', '결재 설정'],
    ] as const) {
      await menu.getByRole('button', { name: button }).click();
      const modal = page.getByRole('dialog', { name: dialog, exact: true });
      await expect(modal).toBeVisible();
      if (dialog === '결재함') await expect(approvalQueue(page)).toBeVisible();
      await modal
        .locator('[data-ui="dialog-header"]')
        .getByRole('button', { name: '창 닫기', exact: true })
        .click();
      await expect(modal).toHaveCount(0);
      await expect(page).toHaveURL(/\/club-operations\?view=investment$/);
    }
    // An area opens from its home card and leads back to the office (→WEB-10/14): 재정 · 사업
    // reads the books (→WEB-110).
    await openArea(page, '재정 · 사업');
    await expect(page.getByRole('region', { name: '클럽 재정', exact: true })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: '구단주 사무실로', exact: true }).click();
    await expect(office.getByTestId('office-effects')).toBeVisible();
    // Each 구단 운영 address opens from itself and again after a reload, as the static deployment
    // serves it (→ARCH-23, →WEB-110); an older desk address lands on the same page.
    for (const [view, region, legacy] of [
      ['investment', OFFICE, '/business?view=finance'],
      ['sponsor', '후원', '/direction?view=sponsor'],
      ['identity', '구단 디자인', '/direction?view=identity'],
    ] as const) {
      for (const open of [
        () => page.goto(`/club-operations?view=${view}`),
        () => page.reload(),
        () => page.goto(legacy),
      ]) {
        expect((await open())?.status()).toBe(200);
        await expect(page.getByRole('region', { name: region, exact: true })).toBeVisible();
        await expect(page).toHaveURL(new RegExp(`/club-operations\\?view=${view}$`));
        await expect(clubhouseTab(page)).toHaveAttribute('aria-current', 'page');
      }
    }
    // 후원: the actual slots and who signs them, from 결재 설정's 스폰서 계약 (→WEB-79/110).
    const sponsors = await openSponsors(page);
    await expect(sponsors.getByTestId('sponsor-slot-shirt')).toBeVisible();
    await expect(sponsors.getByRole('region', { name: '후원 위임', exact: true })).toBeVisible();
    await closeDecisionSettings(page);
    // 구단 디자인: the applied identity and its designer commission (→WEB-108).
    await openArea(page, '구단 디자인');
    await expect(page.getByRole('region', { name: '구단 디자인', exact: true })).toBeVisible();
    // Back and forward retrace the pages.
    await page.goBack();
    await expect(page.getByTestId('club-hub')).toBeVisible();
    await page.goForward();
    await expect(areaPage(page, '구단 디자인')).toBeVisible();
    // Reading an export during the office's work keeps the page and changes nothing.
    const saved = await exportedCareer(page);
    expect(saved.settings).toEqual(before);
    expect(saved.policy?.support ?? 3).toBe(w.policy?.support ?? 3);
    await expect(page).toHaveURL(/\/club-operations\?view=investment&area=identity$/);
    await expect(officeDialog(page)).toHaveCount(0);
  });
}
