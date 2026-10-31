import { expect, test, type Page } from '@playwright/test';
import { pendingDecisions } from '../../packages/engine/src/stopping';
import { pendingAcquisitionCareer, importResponsibilityCareer } from './responsibility-fixtures';
import { eventCard } from './events';
import { enterOffice, officeBar, officeLobby, officeTitle } from './office';
import { exportedCareer } from './career-fixtures';

/** The office lobby's approval tray (→WEB-39): home leaves office work out of its events. */
async function tray(page: Page) {
  await enterOffice(page);
  await officeLobby(page);
  return page.getByRole('region', { name: '결재 대기 업무', exact: true }).getByRole('listitem');
}
async function reviewFirst(page: Page) {
  await (
    await tray(page)
  )
    .first()
    .getByRole('button', { name: /· 검토하기$/ })
    .click();
  const request = page.getByTestId('approval-request');
  await expect(request).toBeVisible();
  return request;
}

for (const width of [390, 1280]) {
  test(`office approval returns keep request identity and stale history at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const w = pendingAcquisitionCareer();
    w.settings!.mode = 'manual';
    w.settings!.observations = { matchEve: false, windowOpen: false };
    const ids = pendingDecisions(w).map((item) => item.id);
    await importResponsibilityCareer(page, w);
    await expect(eventCard(page)).toHaveCount(0);
    const titles = pendingDecisions(w).map((item) => item.title);
    await expect(await tray(page)).toHaveCount(ids.length);
    await expect((await tray(page)).getByRole('button', { name: '거절', exact: true })).toHaveCount(
      0,
    );
    // Every cancellation route returns to the same unresolved list without a command.
    for (const exit of ['cancel', 'home', 'office', 'browser'] as const) {
      const request = await reviewFirst(page);
      await expect(officeTitle(page)).toHaveText('선수 계약');
      await expect(request).toHaveAttribute('data-request-id', ids[0]);
      await expect(request.getByRole('button', { name: '역제안 수락', exact: true })).toBeVisible();
      if (exit === 'browser') await page.goBack();
      else if (exit === 'office')
        await officeBar(page).getByRole('button', { name: '사무실', exact: true }).click();
      else
        await request
          .getByRole('button', { name: exit === 'cancel' ? '취소' : '홈으로', exact: true })
          .click();
      // Browser back retraces the visit to the office lobby; every other exit returns home.
      await expect(
        exit === 'browser' ? page.getByTestId('office-lobby') : page.getByTestId('club-hub'),
      ).toBeVisible();
      expect(pendingDecisions(await exportedCareer(page)).map((item) => item.id)).toEqual(ids);
    }
    const request = await reviewFirst(page);
    await request.getByRole('button', { name: '거절', exact: true }).click();
    await expect(page).toHaveURL(/\/journal$/);
    // Browser back reads the resolved request, with no second submission control.
    await page.goBack();
    await expect(request).toContainText('이미 처리되었거나 조건이 바뀐 요청');
    await expect(request.getByRole('button', { name: '거절', exact: true })).toHaveCount(0);
    await page.goForward();
    await expect(page.getByTestId('club-hub')).toBeVisible();
    await expect(await tray(page)).toHaveCount(ids.length - 1);
    await expect((await tray(page)).first()).toContainText(titles[1]!);
    await expect(await reviewFirst(page)).toHaveAttribute('data-request-id', ids[1]);
    await request.getByRole('button', { name: '거절', exact: true }).click();
    await expect(page).toHaveURL(/\/journal$/);
    await expect(await tray(page)).toHaveCount(0);
    const after = await exportedCareer(page);
    expect(pendingDecisions(after)).toHaveLength(0);
    expect(after.calendar).toEqual(w.calendar);
  });
}
