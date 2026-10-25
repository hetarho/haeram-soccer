import type { Page } from '@playwright/test';

/** Game record and slot tools live in the shared settings menu. */
export async function openSaveMenu(page: Page) {
  await page.getByRole('button', { name: '설정', exact: true }).click();
  return page.getByRole('dialog', { name: '설정', exact: true });
}
