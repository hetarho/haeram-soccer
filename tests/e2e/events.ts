import { expect, type Page } from '@playwright/test';

const STOP_KINDS = [
  'match',
  'window-open',
  'window-close',
  'bid-response',
  'incoming-bid',
  'youth-intake',
  'staff-report',
  'finance',
] as const;

/**
 * Seeds the first-run clock stops (localStorage 'haeram-soccor:stop-on') so a test that is not
 * about events is not interrupted by, e.g., another club's offer arriving in the open window.
 * Choices the test makes later in the UI still persist across reloads.
 */
export async function stopOnlyFor(page: Page, kinds: (typeof STOP_KINDS)[number][]) {
  await page.addInitScript(
    ({ all, on }) => {
      const key = 'haeram-soccor:stop-on';
      if (!localStorage.getItem(key))
        localStorage.setItem(
          key,
          JSON.stringify(Object.fromEntries(all.map((k) => [k, on.includes(k)]))),
        );
    },
    { all: [...STOP_KINDS], on: kinds as string[] },
  );
}

/** The card shown when the clock stops for a match eve or an attention event. */
export const eventCard = (page: Page) => page.getByTestId('event-card');

/** Reads every pending attention card with '확인', e.g. after importing a career mid-season. */
export async function acknowledgeEvents(page: Page) {
  const card = eventCard(page);
  // The whole card text, so two events that share a title still count as a change.
  // Read without auto-waiting: the card may leave between a count and a text query.
  const title = () =>
    card.evaluateAll((cards) => (cards[0] as HTMLElement | undefined)?.innerText ?? '');
  for (let i = 0; i < 20; i++) {
    const current = await title();
    if (!current) return;
    await card.getByRole('button', { name: '확인', exact: true }).click();
    await expect.poll(title, { timeout: 10000 }).not.toBe(current);
  }
  throw new Error('Too many pending events to acknowledge');
}
