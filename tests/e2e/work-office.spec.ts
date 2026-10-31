import { expect, test } from '@playwright/test';
import { createWorld } from '../../packages/engine/src/index';
import { RESPONSIBILITY_KEYS } from '../../packages/engine/src/responsibilities';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { exportedCareer } from './career-fixtures';
import {
  clubSections,
  enterOffice,
  leaveOffice,
  openOfficeLibrary,
  openOperations,
  operationsTabs,
} from './office';
import { horizontalOverflow } from './layout';
import { clubhouseTab } from './competition-navigation';

for (const width of [360, 390, 1280]) {
  test(`club sections and 구단 운영 hold proactive work outside the office at ${width}`, async ({
    page,
  }) => {
    test.slow();
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
    // The clubhouse and every club information page share one section bar (→WEB-10).
    await clubhouseTab(page).click();
    const sections = clubSections(page);
    await expect(sections.getByRole('tab')).toHaveText([
      '현황',
      '1군',
      '코치진',
      '훈련',
      '유소년',
      '운영',
    ]);
    for (const [section, now] of [
      ['1군', /\/first-team\?view=players$/],
      ['코치진', /\/staff\?view=coaches$/],
      ['훈련', /\/training$/],
      ['유소년', /\/academy$/],
      ['운영', /\/club-operations\?view=investment$/],
      ['현황', /\/journal$/],
    ] as const) {
      const tab = sections.getByRole('tab', { name: section, exact: true });
      await tab.click();
      await expect(page).toHaveURL(now);
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      await expect(clubhouseTab(page)).toHaveAttribute('aria-current', 'page');
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    }
    // The office queue has no copy of it (→WEB-39).
    await enterOffice(page);
    await expect(sections).toHaveCount(0);
    await leaveOffice(page);
    // 재정·투자: every facility and the scoped spending criteria (→WEB-14/110).
    await openOperations(page, '재정·투자');
    for (const part of ['stadium', 'training', 'academy'])
      await expect(page.getByTestId(`facility-${part}`)).toBeVisible();
    await page.getByRole('button', { name: /^재정 ·/ }).click();
    const financial = page.getByRole('dialog', { name: '재정 업무 기준', exact: true });
    await expect(
      financial.getByRole('radiogroup', { name: '재계약 기조', exact: true }),
    ).toBeVisible();
    await expect(
      financial.getByRole('radiogroup', { name: '선수단 투자', exact: true }),
    ).toBeVisible();
    // Read-only synergy conditions may mention culture; its editable row belongs to the manager.
    await expect(financial.locator('[data-row="culture"]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    for (const name of ['재정', '유소년', '지역', '글로벌'])
      await expect(page.getByRole('button', { name: new RegExp('^' + name + ' ·') })).toBeVisible();
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
    // Reading an export during operations work keeps the open library and unapplied draft.
    await openOfficeLibrary(page);
    const board = page.getByTestId('strategy-board');
    const finance = board.getByRole('region', { name: '재정', exact: true });
    const financeHeader = finance.locator(':scope > button[aria-expanded]');
    if ((await financeHeader.getAttribute('aria-expanded')) === 'false')
      await financeHeader.click();
    await finance.getByRole('radio', { name: '선수단 투자 후한 지원', exact: true }).click();
    const draft = page.getByTestId('strategy-draft');
    await expect(draft).toContainText('선수단 투자 표준 → 후한 지원');
    const saved = await exportedCareer(page);
    expect(saved.settings).toEqual(before);
    expect(saved.policy?.support ?? 3).toBe(w.policy?.support ?? 3);
    await expect(page).toHaveURL(/\/club-operations\?view=investment$/);
    await expect(page.getByTestId('office-library')).toHaveAttribute('open', '');
    await expect(draft).toContainText('선수단 투자 표준 → 후한 지원');
    await draft.getByRole('button', { name: '되돌리기', exact: true }).click();
    await expect(draft).toHaveCount(0);
    expect((await exportedCareer(page)).settings).toEqual(before);
  });
}
