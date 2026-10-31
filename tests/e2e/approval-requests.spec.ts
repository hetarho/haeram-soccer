import { expect, test, type Page } from '@playwright/test';
import { contractLine } from '../../apps/web/src/ui/format';
import { approvalDeadline } from '../../packages/engine/src/approvals';
import { POSITION_LABEL } from '../../packages/engine/src/player';
import { overall } from '../../packages/engine/src/player-state';
import { pendingDecisions } from '../../packages/engine/src/stopping';
import { pendingAcquisitionCareer, importResponsibilityCareer } from './responsibility-fixtures';
import { eventCard } from './events';
import {
  approvalOrder,
  approvalQueue,
  approvalRows,
  enterOffice,
  officeLobby,
  officeTitle,
  reviewButton as review,
} from './office';
import { exportedCareer } from './career-fixtures';

/** The office opens on its 결재함 (→WEB-39); home leaves office work out of its events. */
async function queue(page: Page) {
  await enterOffice(page);
  await officeLobby(page);
  return approvalRows(page);
}
async function reviewFirst(page: Page) {
  await (
    await queue(page)
  )
    .first()
    .getByRole('button', { name: /· 검토하기$/ })
    .click();
  const request = page.getByTestId('approval-request');
  await expect(request).toBeVisible();
  return request;
}

for (const width of [390, 1280]) {
  test(`the 결재함 reviews, returns to and keeps its context for live requests at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const w = pendingAcquisitionCareer();
    w.settings!.mode = 'manual';
    w.settings!.observations = { matchEve: false, windowOpen: false };
    const ids = approvalOrder(w);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    await importResponsibilityCareer(page, w);
    await expect(eventCard(page)).toHaveCount(0);
    const rows = await queue(page);
    // Every actual request, in deadline order, with nothing above it but a quiet heading.
    await expect(rows).toHaveCount(ids.length);
    expect(await rows.evaluateAll((items) => items.map((item) => item.dataset.requestId))).toEqual(
      ids,
    );
    await expect(approvalQueue(page).getByTestId('approval-counts')).toContainText(
      `대기 ${ids.length}건`,
    );
    for (const gone of ['클럽 소식·시즌 브리핑', '선수 계약', '재정·투자', '감독 사무실', '훈련장'])
      await expect(approvalQueue(page).getByRole('button', { name: gone })).toHaveCount(0);
    // The club's summary stays in the clubhouse; the office holds no copy of it (→WEB-44).
    await expect(page.getByTestId('club-situation')).toBeHidden();
    const first = await review(page, ids[0]!).boundingBox();
    expect(first!.y + first!.height).toBeLessThanOrEqual(844);
    await expect(rows.getByRole('button', { name: '거절', exact: true })).toHaveCount(0);

    // The review names the actual target its bid pinned, before any answer (→WEB-39/43).
    const reviewed = pendingDecisions(w).find((candidate) => candidate.id === ids[0])!;
    const target = w.bids!.find((bid) => bid.id === reviewed.ref)!.offer!.player;
    await expect(review(page, ids[0]!)).toHaveAccessibleName(
      `${reviewed.title} · ${target.name} · 검토하기`,
    );
    const left = approvalDeadline(w, reviewed.id);
    await reviewFirst(page);
    // A direct reload keeps the selected request, its one heading, its 결재 기한 and its terms.
    await page.reload();
    const opened = page.getByTestId('approval-request');
    await expect(opened).toHaveAttribute('data-request-id', ids[0]!);
    await expect(opened.getByRole('heading')).toHaveText([reviewed.title]);
    await expect(opened.getByText(reviewed.title, { exact: true })).toHaveCount(1);
    await expect(opened.getByTestId('approval-deadline')).toHaveText(
      left > 0 ? `D-${left}` : `지연 ${1 - left}일`,
    );
    const facts = opened.getByTestId('bid-facts');
    await expect(facts).toContainText(target.name);
    await expect(facts).toContainText(
      `${target.position} · ${POSITION_LABEL[target.position]} · ${w.year - target.born}세`,
    );
    await expect(facts).toContainText(
      `OVR ${overall(target)} · 잠재력 ${Math.round(target.potential)}`,
    );
    await expect(facts).toContainText('우리 제안 이적료');
    await expect(facts).toContainText('역제안 이적료');
    await expect(facts).toContainText(contractLine(target.until, w.year));
    // One named return; leaving answers nothing.
    await expect(opened.getByRole('button', { name: '취소', exact: true })).toHaveCount(0);
    await opened.getByRole('button', { name: '결재함으로', exact: true }).click();
    await expect(approvalQueue(page)).toBeVisible();
    await expect(page).toHaveURL(/\/direction$/);
    await expect(review(page, ids[0]!)).toBeFocused();

    // A filter of the actual responsibility stays through a review and its return.
    const filters = approvalQueue(page).getByRole('group', { name: '결재함 보기', exact: true });
    const recruitment = filters.getByRole('button', { name: `선수 영입 ${ids.length}` });
    await recruitment.click();
    await expect(recruitment).toHaveAttribute('aria-pressed', 'true');

    // Both ways out — the named return and browser back — reach the same unresolved queue.
    for (const exit of ['queue', 'browser'] as const) {
      const request = await reviewFirst(page);
      await expect(officeTitle(page)).toHaveText('선수 계약');
      await expect(request).toHaveAttribute('data-request-id', ids[0]!);
      await expect(request.getByRole('button', { name: '역제안 수락', exact: true })).toBeVisible();
      if (exit === 'browser') await page.goBack();
      else await request.getByRole('button', { name: '결재함으로', exact: true }).click();
      await expect(approvalQueue(page)).toBeVisible();
      await expect(page).toHaveURL(/\/direction$/);
      await expect(approvalRows(page)).toHaveCount(ids.length);
      await expect(recruitment).toHaveAttribute('aria-pressed', 'true');
      // A named return puts focus back on the request that still waits there.
      if (exit !== 'browser') await expect(review(page, ids[0]!)).toBeFocused();
      expect(
        pendingDecisions(await exportedCareer(page))
          .map((item) => item.id)
          .sort(),
      ).toEqual([...ids].sort());
    }

    // A completed review returns to the refreshed queue with focus on the request now in its place.
    let request = await reviewFirst(page);
    await request.getByRole('button', { name: '거절', exact: true }).click();
    await expect(page).toHaveURL(/\/direction$/);
    await expect(approvalRows(page)).toHaveCount(ids.length - 1);
    await expect(approvalRows(page).first()).toHaveAttribute('data-request-id', ids[1]!);
    await expect(review(page, ids[1]!)).toBeFocused();
    // Browser back reads the resolved request, with no second submission control.
    await page.goBack();
    await expect(request).toContainText('이미 처리되었거나 조건이 바뀐 요청');
    await expect(request.getByRole('button', { name: '거절', exact: true })).toHaveCount(0);
    await page.goForward();
    await expect(approvalQueue(page)).toBeVisible();
    await expect(approvalRows(page)).toHaveCount(ids.length - 1);
    request = await reviewFirst(page);
    await expect(request).toHaveAttribute('data-request-id', ids[1]!);
    await request.getByRole('button', { name: '거절', exact: true }).click();
    await expect(page).toHaveURL(/\/direction$/);
    if (ids.length === 2) {
      // The filtered view is empty now: it says so, focuses its heading and clears the filter.
      const empty = approvalQueue(page).getByTestId('approval-empty');
      await expect(empty.getByRole('heading')).toBeFocused();
      await empty.getByRole('button', { name: '전체 보기', exact: true }).click();
      await expect(empty).toContainText('지금 결재할 업무가 없어요');
    }
    const after = await exportedCareer(page);
    expect(pendingDecisions(after)).toHaveLength(ids.length - 2);
    expect(after.calendar).toEqual(w.calendar);
  });
}
