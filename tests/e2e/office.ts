import { expect, type Page } from '@playwright/test';

/** The owner office's only chrome: its way back, its name and the cash (→WEB-39). */
export const officeBar = (page: Page) => page.locator('[data-ui="office-bar"]');
/** The office or area name the bar shows: 구단주 사무실 in the lobby, else the area. */
export const officeTitle = (page: Page) => officeBar(page).getByRole('heading');
export const LOBBY = '구단주 사무실';

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

/** Back to the lobby from an area by ← 사무실; a no-op in the lobby. */
export async function officeLobby(page: Page) {
  const back = officeBar(page).getByRole('button', { name: '사무실', exact: true });
  if (await back.isVisible()) await back.click();
  await expect(officeTitle(page)).toHaveText(LOBBY);
}

/** Opens one office area (운영 방침, 시설, 재정, 후원, 구단 디자인, 결재 라인) from its lobby card. */
export async function openOfficeArea(page: Page, area: string, options: { timeout?: number } = {}) {
  await enterOffice(page, options);
  if ((await officeTitle(page).innerText()).trim() === area) return;
  await officeLobby(page);
  await page
    .getByTestId('office-lobby')
    .getByRole('button', { name: area, exact: true })
    .click(options);
  await expect(officeTitle(page)).toHaveText(area);
}

/** Leaves the office by its 나가기 (through the lobby), back where it was entered from. */
export async function leaveOffice(page: Page) {
  await officeLobby(page);
  await officeBar(page).getByRole('button', { name: '나가기', exact: true }).click();
  await expect(officeBar(page)).toHaveCount(0);
}

/** Steps out of the office when inside it, for helpers that need the HUD or the menus. */
export async function outsideOffice(page: Page) {
  if (await officeBar(page).isVisible()) await leaveOffice(page);
}

/**
 * Runs a menu action (an export, a save retry) from outside the office and returns to the same
 * office area afterwards, so a test reading the save mid-edit keeps its place and draft.
 */
export async function aroundOffice<T>(page: Page, action: () => Promise<T>) {
  if (!(await officeBar(page).isVisible())) return action();
  const area = (await officeTitle(page).innerText()).trim();
  await leaveOffice(page);
  const result = await action();
  if (area === LOBBY) await enterOffice(page);
  else await openOfficeArea(page, area);
  return result;
}
