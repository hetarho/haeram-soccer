import { chooseLevel } from './events';
import { expect, test, type Page } from '@playwright/test';

/** Finish via the public round control, then let the clock settle the final season-close day. */
export async function finishSeason(page: Page) {
  // A journey can close multiple seasons; reserve another season budget on each call.
  test.setTimeout(Math.max(test.info().timeout, 180000) + 90000);
  const tools = page.getByRole('dialog', { name: '시즌 진행 도구', exact: true });
  // Archive journeys delegate real business before time moves. Reading notices cannot dismiss
  // an unanswered renewal or an interim appointment at the season boundary.
  await tools.getByRole('button', { name: '창 닫기', exact: true }).click();
  await chooseLevel(page, 4);
  await page
    .getByTestId('club-hub')
    .getByRole('button', { name: '시즌 진행 도구', exact: true })
    .click();
  const calendar = page.getByTestId('calendar');
  const text = (await calendar.textContent())!;
  const year = Number(/(\d{4})\//.exec(text)![1]);
  const firstRound = Number(/라운드 (\d+)/.exec(text)![1]);
  for (let round = firstRound + 1; round <= 46; round++) {
    await tools.getByRole('button', { name: '한 라운드 진행', exact: true }).click();
    await expect(calendar).toContainText(`라운드 ${round}`);
  }
  await tools.getByRole('button', { name: '창 닫기', exact: true }).click();
  // The batched round summary waits behind the tools and can cover the launcher on phones.
  const outcome = page.getByTestId('action-outcome');
  await expect(outcome).toBeVisible();
  await outcome.getByRole('button', { name: '확인', exact: true }).click();
  await expect(outcome).toHaveCount(0);
  await page.getByTestId('communications-button').click();
  const inbox = page.getByRole('dialog', { name: '알림·뉴스', exact: true });
  const read = inbox.getByRole('button', { name: '모두 읽음', exact: true });
  if (await read.isEnabled()) await read.click();
  await inbox.getByRole('button', { name: '닫기', exact: true }).click();
  await page.getByRole('button', { name: '1초에 하루 속도 선택', exact: true }).click();
  await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
  await expect(calendar).toContainText(`${year + 1}/${String(year + 2).slice(-2)} · 라운드 0`);
  const stop = page.getByRole('button', { name: '자동 진행 정지', exact: true });
  if (await stop.count()) await stop.click();
  await expect(page.getByRole('button', { name: '자동 진행 시작', exact: true })).toBeVisible();
  await page
    .getByTestId('club-hub')
    .getByRole('button', { name: '시즌 진행 도구', exact: true })
    .click();
}
