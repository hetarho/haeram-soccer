import { expect, type Page } from '@playwright/test';

/** The owner office's only chrome: its way back, its name and the cash (→WEB-39). */
export const officeBar = (page: Page) => page.locator('[data-ui="office-bar"]');
/** The office or area name the bar shows: 구단주 사무실 in the lobby, else the area. */
export const officeTitle = (page: Page) => officeBar(page).getByRole('heading');
export const LOBBY = '구단주 사무실';
const OFFICE_PATH = /^\/(direction|business)(\/|$)/;

/**
 * Whether the office is open. The address decides: right after a reload the office bar is not
 * drawn yet, and right after leaving the previous view may still show for a moment.
 */
export async function inOffice(page: Page) {
  if (!OFFICE_PATH.test(new URL(page.url()).pathname)) return false;
  await expect(officeBar(page)).toBeVisible();
  return true;
}

/** An achievement banner (→WEB-52) clears itself; a tap closes it at once. */
async function dismissCelebration(page: Page) {
  const banner = page.getByTestId('celebration').locator('[role="status"]');
  if (await banner.isVisible()) await banner.click({ timeout: 2000 }).catch(() => undefined);
}

/**
 * Enters the owner office through home's entrance (→WEB-11/39): it has no menu entry, and the
 * shell hides the HUD, calendar, controls and menus while it is open. An open event group covers
 * home, so its own 결재 라인 link opens the office instead (→WEB-79). A no-op inside the office.
 */
export async function enterOffice(page: Page, options: { timeout?: number } = {}) {
  if (await inOffice(page)) return;
  await dismissCelebration(page);
  const group = page.getByTestId('event-group');
  if (await group.isVisible()) {
    await group.getByRole('button', { name: '결재 라인', exact: true }).first().click(options);
    await expect(officeBar(page)).toBeVisible();
    return;
  }
  // The selected tab decides, not what is drawn: a deferred view can still show home.
  const home = page
    .getByRole('navigation')
    .getByRole('button', { name: '클럽 홈', exact: true })
    .first();
  if ((await home.getAttribute('aria-current')) !== 'page') await home.click(options);
  const hub = page.getByTestId('club-hub');
  await expect(hub).toBeVisible();
  await hub.getByRole('button', { name: '구단주 사무실', exact: true }).click(options);
  await expect(officeBar(page)).toBeVisible();
}

/** Back to the lobby from an area by ← 사무실; a no-op in the lobby. */
export async function officeLobby(page: Page) {
  if ((await officeTitle(page).innerText()).trim() !== LOBBY)
    await officeBar(page).getByRole('button', { name: '사무실', exact: true }).click();
  await expect(officeTitle(page)).toHaveText(LOBBY);
}

/** Opens one office area (운영 방침, 시설, 재정, 후원, 구단 디자인, 결재 라인) from its lobby card. */
export async function openOfficeArea(page: Page, area: string, options: { timeout?: number } = {}) {
  await enterOffice(page, options);
  if ((await officeTitle(page).innerText()).trim() === area) return;
  await officeLobby(page);
  await dismissCelebration(page);
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
  if (await inOffice(page)) await leaveOffice(page);
}

/**
 * Runs a menu action (an export, a save retry) from outside the office and returns to the same
 * office area afterwards, so a test reading the save mid-edit keeps its place and draft. Transient
 * notices of the area (a failed apply) do not survive the visit.
 */
export async function aroundOffice<T>(page: Page, action: () => Promise<T>) {
  if (!(await inOffice(page))) return action();
  const area = (await officeTitle(page).innerText()).trim();
  await leaveOffice(page);
  const result = await action();
  if (area === LOBBY) await enterOffice(page);
  else await openOfficeArea(page, area);
  return result;
}
