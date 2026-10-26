import { expect, type Page } from '@playwright/test';

/** The owner office's only chrome: its way back, its name and the cash (→WEB-39). */
export const officeBar = (page: Page) => page.locator('[data-ui="office-bar"]');

/**
 * Enters the owner office through home's entrance (→WEB-11/39): it has no menu entry, and the
 * shell hides the HUD, calendar, controls and menus while it is open. A no-op inside the office.
 */
export async function enterOffice(page: Page, options: { timeout?: number } = {}) {
  if (await officeBar(page).isVisible()) return;
  const hub = page.getByTestId('club-hub');
  if (!(await hub.isVisible()))
    await page
      .getByRole('navigation')
      .getByRole('button', { name: '클럽 홈', exact: true })
      .first()
      .click(options);
  await hub.getByRole('button', { name: '구단주 사무실', exact: true }).click(options);
  await expect(officeBar(page)).toBeVisible();
}

/** Leaves the office by its 나가기, back where it was entered from. */
export async function leaveOffice(page: Page) {
  await officeBar(page).getByRole('button', { name: '나가기', exact: true }).click();
  await expect(officeBar(page)).toHaveCount(0);
}

/** Opens one area of the office (운영 방침, 시설, 재정, 후원, 구단 디자인, 구단주 사무실). */
export async function openOfficeArea(page: Page, area: string) {
  await enterOffice(page);
  const tab = page.getByRole('tab', { name: area, exact: true });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}
