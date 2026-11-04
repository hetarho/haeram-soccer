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
  approvalRequest,
  approvalRows,
  enterOffice,
  officeDialog,
  officeLobby,
  officeTitle,
  reviewButton as review,
} from './office';
import { exportedCareer } from './career-fixtures';

/** The 결재함 opens over the page (→WEB-39); home leaves office work out of its events. */
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
  const request = approvalRequest(page);
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
    // The queue opens as a modal with no quick actions in it; the home briefing keeps no club
    // summary (→WEB-11/39).
    await expect(officeDialog(page).getByTestId('quick-actions')).toHaveCount(0);
    await expect(page.getByTestId('club-hub').getByTestId('club-situation')).toHaveCount(0);
    const first = await review(page, ids[0]!).boundingBox();
    expect(first!.y + first!.height).toBeLessThanOrEqual(844);
    await expect(rows.getByRole('button', { name: '거절', exact: true })).toHaveCount(0);

    // The review names the actual target its bid pinned, before any answer (→WEB-39/43).
    const reviewed = pendingDecisions(w).find((candidate) => candidate.id === ids[0])!;
    const bid = w.bids!.find((candidate) => candidate.id === reviewed.ref)!;
    const target = bid.offer!.player;
    // A bid on another club's player names that club after him; a free agent's has none (→CLUB-50).
    const seller = w.clubs.find((club) => club.id === bid.club)?.name;
    await expect(review(page, ids[0]!)).toHaveAccessibleName(
      [reviewed.title, target.name, seller, '검토하기'].filter(Boolean).join(' · '),
    );
    const left = approvalDeadline(w, reviewed.id);
    // The review reads its one heading, its 결재 기한 and its terms.
    const opened = await reviewFirst(page);
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
    await expect(review(page, ids[0]!)).toBeFocused();

    // The requests wait under their title, 선수 영입, with its count; there are no filters, and the
    // title stays through a review and its return (→WEB-100).
    const recruitment = approvalQueue(page).locator('[data-title="recruitment"]');
    await expect(recruitment.getByRole('heading')).toHaveText(`선수 영입${ids.length}`);
    await expect(approvalQueue(page).getByRole('group', { name: '결재함 보기' })).toHaveCount(0);

    // Both ways out — the named return and the dialog's close — reach the same unresolved queue.
    for (const exit of ['queue', 'close'] as const) {
      const request = await reviewFirst(page);
      await expect(officeTitle(page)).toHaveText('선수 계약');
      await expect(request).toHaveAttribute('data-request-id', ids[0]!);
      await expect(request.getByRole('button', { name: '역제안 수락', exact: true })).toBeVisible();
      if (exit === 'close')
        await officeDialog(page)
          .locator('[data-ui="dialog-header"]')
          .getByRole('button', { name: '창 닫기', exact: true })
          .click();
      else await request.getByRole('button', { name: '결재함으로', exact: true }).click();
      await expect(approvalQueue(page)).toBeVisible();
      await expect(approvalRows(page)).toHaveCount(ids.length);
      await expect(recruitment.getByRole('listitem')).toHaveCount(ids.length);
      // The way back puts focus on the request that still waits there.
      await expect(review(page, ids[0]!)).toBeFocused();
      expect(
        pendingDecisions(await exportedCareer(page))
          .map((item) => item.id)
          .sort(),
      ).toEqual([...ids].sort());
    }

    // A completed review returns to the refreshed queue with focus on the request now in its place.
    let request = await reviewFirst(page);
    await request.getByRole('button', { name: '거절', exact: true }).click();
    await expect(approvalRows(page)).toHaveCount(ids.length - 1);
    await expect(approvalRows(page).first()).toHaveAttribute('data-request-id', ids[1]!);
    await expect(review(page, ids[1]!)).toBeFocused();
    request = await reviewFirst(page);
    await expect(request).toHaveAttribute('data-request-id', ids[1]!);
    await request.getByRole('button', { name: '거절', exact: true }).click();
    await expect(approvalQueue(page)).toBeVisible();
    if (ids.length === 2) {
      // Nothing waits now: the count line says so and takes focus, over the quiet titles.
      const counts = approvalQueue(page).getByTestId('approval-counts');
      await expect(counts).toHaveText('지금 결재할 업무가 없어요');
      await expect(counts).toBeFocused();
      await expect(recruitment.getByRole('listitem')).toHaveCount(0);
    }
    const after = await exportedCareer(page);
    expect(pendingDecisions(after)).toHaveLength(ids.length - 2);
    expect(after.calendar).toEqual(w.calendar);
  });
}
