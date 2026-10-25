import {
  ALL_DELEGATED,
  configureResponsibilities,
  acknowledgeEvents,
  dismissMatchReport,
  eventCard,
} from './events';
import { expect, test, type Page } from '@playwright/test';

async function identity(page: Page) {
  const year = await page.getByTestId('calendar').getAttribute('data-season');
  const round = await page.getByTestId('game-round').innerText();
  if (!year || !round) throw new Error('Missing season identity');
  return { year: Number(year), round: Number(round) };
}
async function manual(page: Page, all = false) {
  await dismissMatchReport(page);
  await page.getByRole('button', { name: '클럽 홈', exact: true }).first().click();
  await configureResponsibilities(page, {
    responsibilities: all ? ALL_DELEGATED : { recruitment: 'delegated', sales: 'delegated' },
    mode: 'manual',
    observations: { matchEve: true, windowOpen: false },
  });
}
/** Resolve real observation cards and advance only through the public next-event/match actions. */
async function step(page: Page) {
  const pill = page.getByTestId('event-pill');
  if (await pill.isVisible()) await pill.click();
  await acknowledgeEvents(page);
  const match = eventCard(page).filter({ hasText: '내일 경기' });
  const before = await page.getByTestId('game-date').innerText();
  if (!(await match.isVisible())) {
    await page.getByRole('button', { name: '다음 이벤트', exact: true }).click();
    await expect(eventCard(page).first()).toBeVisible();
  }
  // Reopening a dismissed match report deliberately leaves the date unchanged.
  if ((await match.isVisible()) && (await page.getByTestId('game-date').innerText()) === before) {
    await match.getByRole('button', { name: '결과만 보고 계속', exact: true }).click();
    await expect(match).toHaveCount(0);
  }
  await expect(page.getByTestId('game-date')).not.toHaveText(before);
}
/** One domestic round, allowing cup fixtures and real event stops between league fixtures. */
export async function advanceOneRound(page: Page) {
  const wasManual =
    (await page.getByRole('button', { name: '다음 이벤트', exact: true }).count()) > 0;
  await manual(page);
  const initial = await identity(page);
  for (let event = 0; event < 40; event++) {
    const now = await identity(page);
    if (now.year !== initial.year || now.round > initial.round) {
      if (!wasManual) await configureResponsibilities(page, { mode: 'automatic' });
      return;
    }
    await step(page);
  }
  throw new Error('No next domestic round after forty real stopping events');
}
/** Finish the observed season; fixture/event identity, rather than a fixed click count, ends it. */
export async function finishSeason(page: Page) {
  test.setTimeout(Math.max(test.info().timeout, 180000) + 90000);
  await manual(page, true);
  const initial = await identity(page);
  for (let event = 0; event < 240; event++) {
    if ((await identity(page)).year !== initial.year) {
      await configureResponsibilities(page, {
        mode: 'automatic',
        observations: { matchEve: false, windowOpen: false },
      });
      return;
    }
    await step(page);
  }
  throw new Error('Season did not close after 240 real stopping events');
}
