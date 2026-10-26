import type { Page } from '@playwright/test';
import { outsideOffice } from './office';

/** Game record and slot tools live in the shared settings menu, outside the owner office. */
export async function openSaveMenu(page: Page) {
  await outsideOffice(page);
  await page.getByRole('button', { name: '설정', exact: true }).click();
  return page.getByRole('dialog', { name: '설정', exact: true });
}
