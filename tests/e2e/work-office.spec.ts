import { expect, test } from '@playwright/test';
import { careerWorld } from '../../packages/engine/src/career.testkit';
import { RESPONSIBILITY_KEYS } from '../../packages/engine/src/responsibilities';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { exportedCareer } from './career-fixtures';
import {
  approvalQueue,
  CLUB_SECTION_LABELS,
  clubSections,
  enterOffice,
  leaveOffice,
  openDirectionInForce,
  openOperations,
  operationsTabs,
} from './office';
import { horizontalOverflow } from './layout';
import { clubhouseTab } from './competition-navigation';

for (const width of [360, 390, 1280]) {
  test(`the office's sections and 구단 운영 hold its proactive work at ${width}`, async ({
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
    // The home briefing has no section bar; the office and its working pages share one, which
    // the illustrated entrance leads into; our people belong to 팀 instead (→WEB-10/11/112).
    await clubhouseTab(page).click();
    const sections = clubSections(page);
    await expect(page.getByTestId('club-hub')).toBeVisible();
    await expect(sections).toHaveCount(0);
    await enterOffice(page);
    await expect(sections.getByRole('tab')).toHaveText(CLUB_SECTION_LABELS);
    await expect(sections.getByRole('tab', { name: '사무실', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // 사무실 opens the office's queue, never the home briefing.
    for (const [section, now] of [
      ['훈련', /\/training$/],
      ['운영', /\/club-operations\?view=investment$/],
      ['사무실', /\/direction$/],
    ] as const) {
      const tab = sections.getByRole('tab', { name: section, exact: true });
      await tab.click();
      await expect(page).toHaveURL(now);
      if (section === '사무실') {
        await expect(approvalQueue(page)).toBeVisible();
        await expect(page.getByTestId('club-hub')).toBeHidden();
      }
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      await expect(clubhouseTab(page)).toHaveAttribute('aria-current', 'page');
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    }
    // Each 구단 운영 section opens from its own address and again after a reload, as the static
    // deployment serves it (→ARCH-23, →WEB-110); an older desk address lands on the same section.
    for (const [view, name, legacy] of [
      ['investment', '재정·투자', '/business?view=finance'],
      ['sponsor', '후원', '/direction?view=sponsor'],
      ['identity', '구단 디자인', '/direction?view=identity'],
    ] as const) {
      const section = operationsTabs(page).getByRole('tab', { name, exact: true });
      for (const open of [
        () => page.goto(`/club-operations?view=${view}`),
        () => page.reload(),
        () => page.goto(legacy),
      ]) {
        expect((await open())?.status()).toBe(200);
        await expect(section).toHaveAttribute('aria-selected', 'true');
        await expect(page).toHaveURL(new RegExp(`/club-operations\\?view=${view}$`));
        await expect(clubhouseTab(page)).toHaveAttribute('aria-current', 'page');
      }
    }
    // The office queue carries the one shared bar (→WEB-39), and leaving for home drops it.
    await enterOffice(page);
    await expect(sections).toHaveCount(1);
    await leaveOffice(page);
    await expect(sections).toHaveCount(0);
    // 재정·투자: every facility and the spending direction in force, read-only (→WEB-14/110).
    await openOperations(page, '재정·투자');
    for (const part of ['stadium', 'training', 'academy'])
      await expect(page.getByTestId(`facility-${part}`)).toBeVisible();
    const areas = page.getByTestId('direction-areas');
    const financial = areas.getByRole('region', { name: '재정', exact: true });
    await expect(financial.locator('[data-row="renewal"]')).toContainText('표준');
    await expect(financial.locator('[data-row="support"]')).toContainText('표준');
    // Culture belongs to the squad, read on the 1군 page.
    await expect(areas.locator('[data-row="culture"]')).toHaveCount(0);
    for (const name of ['재정', '유소년', '지역', '글로벌'])
      await expect(areas.getByRole('region', { name, exact: true })).toBeVisible();
    await expect(areas.getByRole('button')).toHaveCount(0);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    // 후원: the actual slots with the sponsorship responsibility beside them (→WEB-79/110).
    await openOperations(page, '후원');
    await expect(page).toHaveURL(/\/club-operations\?view=sponsor$/);
    await expect(page.getByTestId('sponsor-slot-shirt')).toBeVisible();
    await expect(
      page
        .getByTestId('desk-responsibilities')
        .getByRole('group', { name: '스폰서 계약', exact: true }),
    ).toBeVisible();
    // 구단 디자인: the applied identity and its designer commission (→WEB-108).
    await openOperations(page, '구단 디자인');
    await expect(page.getByRole('region', { name: '구단 디자인', exact: true })).toBeVisible();
    // Back and forward retrace the sections.
    await page.goBack();
    await expect(page).toHaveURL(/\/club-operations\?view=sponsor$/);
    await expect(
      operationsTabs(page).getByRole('tab', { name: '후원', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await page.goForward();
    await expect(page).toHaveURL(/\/club-operations\?view=identity$/);
    // Reading an export during operations work keeps the section and changes nothing.
    await openDirectionInForce(page);
    const saved = await exportedCareer(page);
    expect(saved.settings).toEqual(before);
    expect(saved.policy?.support ?? 3).toBe(w.policy?.support ?? 3);
    await expect(page).toHaveURL(/\/club-operations\?view=investment$/);
    await expect(page.getByTestId('direction-areas')).toBeVisible();
  });
}
