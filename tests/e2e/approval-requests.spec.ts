import { expect, test } from '@playwright/test';
import { pendingDecisions } from '../../packages/engine/src/stopping';
import { pendingAcquisitionCareer, importResponsibilityCareer } from './responsibility-fixtures';
import { eventCard, reviewEvent } from './events';
import { officeBar, officeTitle } from './office';
import { exportedCareer } from './career-fixtures';

for (const width of [390, 1280]) {
  test(`home approval returns keep request identity and stale history at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const w = pendingAcquisitionCareer();
    w.settings!.mode = 'manual';
    w.settings!.observations = { matchEve: false, windowOpen: false };
    const ids = pendingDecisions(w).map((item) => item.id);
    await importResponsibilityCareer(page, w);
    const cards = eventCard(page);
    await expect(cards).toHaveCount(ids.length);
    expect(
      await cards.evaluateAll((cards) => cards.map((card) => card.getAttribute('data-request-id'))),
    ).toEqual(ids);
    await expect(cards.getByRole('button', { name: '거절', exact: true })).toHaveCount(0);
    // Every cancellation route returns to the same unresolved list without a command.
    for (const exit of ['cancel', 'home', 'office', 'browser'] as const) {
      const request = await reviewEvent(page, cards.first());
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
      await expect(page.getByTestId('club-hub')).toBeVisible();
      expect(pendingDecisions(await exportedCareer(page)).map((item) => item.id)).toEqual(ids);
    }
    const request = await reviewEvent(page, cards.first());
    await request.getByRole('button', { name: '거절', exact: true }).click();
    await expect(page).toHaveURL(/\/journal$/);
    await expect(cards).toHaveCount(ids.length - 1);
    await expect(cards.first()).toHaveAttribute('data-request-id', ids[1]);
    // Browser back reads the resolved request, with no second submission control.
    await page.goBack();
    await expect(request).toContainText('이미 처리되었거나 조건이 바뀐 요청');
    await expect(request.getByRole('button', { name: '거절', exact: true })).toHaveCount(0);
    await page.goForward();
    await expect(cards.first()).toHaveAttribute('data-request-id', ids[1]);
    await reviewEvent(page, cards.first());
    await request.getByRole('button', { name: '거절', exact: true }).click();
    await expect(page).toHaveURL(/\/journal$/);
    await expect(cards).toHaveCount(0);
    const after = await exportedCareer(page);
    expect(pendingDecisions(after)).toHaveLength(0);
    expect(after.calendar).toEqual(w.calendar);
  });
}
