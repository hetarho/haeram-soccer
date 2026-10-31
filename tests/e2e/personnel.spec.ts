import { expect, test } from '@playwright/test';
import { preparedWorld } from '../fixtures/prepared-world';
import { continueSlot, seedSlot } from './slots';
import { enterOffice, leaveOffice, officeBar, openOfficeArea } from './office';
import { exportedCareer } from './career-fixtures';
import { horizontalOverflow } from './layout';

for (const width of [360, 1280]) {
  test(`player overview opens independent work and cancels scoped approvals at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const world = preparedWorld('manager-journey');
    world.settings!.mode = 'manual';
    world.settings!.observations = { matchEve: false, windowOpen: false };
    const before = structuredClone(world.settings);
    await seedSlot(page, world);
    await page.goto('/');
    await continueSlot(page);
    await enterOffice(page);
    await openOfficeArea(page, '선수 계약');
    const overview = page.getByTestId('player-office-overview');
    await expect(overview).toBeVisible();
    await expect(page.getByRole('tablist', { name: '선수 계약 업무' }).getByRole('tab')).toHaveText(
      ['개요', '계약', '영입', '매각', '유소년 승격·방출'],
    );
    const figures = page.getByTestId('desk-stats');
    await expect(figures).toContainText('1군 연봉 약정');
    await expect(figures).toContainText('이번 시즌 만료');
    await expect(page.getByTestId('desk-responsibilities')).toHaveCount(0);
    await overview.getByRole('button', { name: '계약 업무 열기', exact: true }).click();
    const inline = page.getByTestId('desk-responsibilities');
    for (const [tab, responsibility] of [
      ['계약', '선수 계약'],
      ['영입', '선수 영입'],
      ['매각', '선수 매각'],
      ['유소년 승격·방출', '유소년 승격·방출'],
    ]) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      await expect(inline.getByRole('group')).toHaveCount(1);
      const choices = inline.getByRole('group', { name: responsibility, exact: true });
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
      await expect(page.getByRole('radiogroup', { name: '라커룸 문화', exact: true })).toHaveCount(
        0,
      );
    }
    // Back/forward restores the actual work, then the named office return skips local tab entries.
    await page.goBack();
    await expect(page.getByRole('tab', { name: '매각', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.goForward();
    await expect(page.getByRole('tab', { name: '유소년 승격·방출', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await officeBar(page).getByRole('button', { name: '사무실', exact: true }).click();
    await expect(page.getByTestId('office-lobby')).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
    await leaveOffice(page);
    expect((await exportedCareer(page)).settings).toEqual(before);
  });
}
