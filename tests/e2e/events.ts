import { expect, type Page } from '@playwright/test';

const LEVEL_NAMES = ['모든 결정 확인', '중요한 결정만', '이적만 직접', '운영진에 모두 맡기기'];

/**
 * Picks the intervention level from the clock's popover (→WEB-45) once the game is shown. Level 4
 * stops only for money, so a test that is not about events is not interrupted by, e.g., another
 * club's offer arriving in the open window; new clubs start at level 2, which also stops on match
 * eves and offers.
 */
export async function chooseLevel(page: Page, level: 1 | 2 | 3 | 4) {
  const trigger = page.getByTestId('intervention-trigger');
  await trigger.click();
  await page
    .getByTestId('intervention-popover')
    .getByRole('radio', { name: new RegExp(`^${level}\\. `) })
    .click();
  await expect(trigger).toHaveAccessibleName(`개입 수준 · ${LEVEL_NAMES[level - 1]}`);
  // The level is saved with the game: its outcome card says the worker applied it, and closing
  // it keeps the card from covering the controls a test uses next.
  const outcome = page.getByTestId('action-outcome');
  await expect(outcome).toContainText('개입 수준을 바꿨어요');
  await outcome.getByRole('button', { name: '확인', exact: true }).click();
  await expect(outcome).toHaveCount(0);
}

/** The card shown when the clock stops for a match eve or an attention event. */
export const eventCard = (page: Page) => page.getByTestId('event-card');

/**
 * Reads every pending attention card with '확인', e.g. after importing a career mid-season; an
 * offer that waits for an answer instead (another club's bid) is declined.
 */
export async function acknowledgeEvents(page: Page) {
  const card = eventCard(page);
  // The whole card text, so two events that share a title still count as a change.
  // Read without auto-waiting: the card may leave between a count and a text query.
  const title = () =>
    card.evaluateAll((cards) => (cards[0] as HTMLElement | undefined)?.innerText ?? '');
  for (let i = 0; i < 20; i++) {
    const current = await title();
    if (!current) return;
    const read = card.getByRole('button', { name: '확인', exact: true });
    await (
      (await read.count()) ? read : card.getByRole('button', { name: '거절', exact: true })
    ).click();
    await expect.poll(title, { timeout: 10000 }).not.toBe(current);
  }
  throw new Error('Too many pending events to acknowledge');
}
