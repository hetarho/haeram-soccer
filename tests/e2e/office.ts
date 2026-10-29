import { expect, type Page } from '@playwright/test';

/** Local desk navigation within the shared management shell (→WEB-39). */
export const officeBar = (page: Page) => page.locator('[data-ui="office-bar"]');
/** The office or area name the bar shows: 구단주 사무실 in the lobby, else the area. */
export const officeTitle = (page: Page) => officeBar(page).getByRole('heading');
export const LOBBY = '구단주 사무실';
const OFFICE_PATH = /^\/(direction|business)(\/|$)/;

/**
 * Read the active route and its rendered office context together. A request can return home
 * between separate locator reads; a departing office heading must never become a return target.
 * A reload on an office route still waits for its real heading to mount.
 */
async function officeContext(page: Page) {
  const current: { value?: { area: string; libraryOpen: boolean } | null } = {};
  await expect
    .poll(async () => {
      current.value = await officeTitle(page).evaluateAll((headings, officePath) => {
        if (!new RegExp(officePath).test(location.pathname)) return null;
        const area = headings[0]?.textContent?.trim();
        if (!area) return undefined;
        return {
          area,
          libraryOpen:
            document.querySelector('[data-testid="office-library"]')?.hasAttribute('open') ?? false,
        };
      }, OFFICE_PATH.source);
      return current.value !== undefined;
    })
    .toBe(true);
  return current.value ?? null;
}

/** Whether the active route and its office landmark identify an open office. */
export async function inOffice(page: Page) {
  return (await officeContext(page)) !== null;
}

/** An achievement banner (→WEB-52) clears itself; a tap closes it at once. */
async function dismissCelebration(page: Page) {
  const banner = page.getByTestId('celebration').locator('[role="status"]');
  if (await banner.isVisible()) await banner.click({ timeout: 2000 }).catch(() => undefined);
}

/**
 * Enters the owner office through primary navigation (→WEB-10/39). Dismiss an observation
 * dialog before navigating; dismissing never resolves its work. A no-op inside the office.
 */
export async function enterOffice(page: Page, options: { timeout?: number } = {}) {
  if (await inOffice(page)) {
    if (!new URL(page.url()).searchParams.has('request')) return;
    await page
      .getByTestId('approval-request')
      .getByRole('button', { name: '취소', exact: true })
      .click();
  }
  await dismissCelebration(page);
  const covering = page.getByRole('dialog').filter({ has: page.getByTestId('event-group') });
  if (await covering.isVisible())
    await covering.getByRole('button', { name: '창 닫기', exact: true }).click();
  // The selected tab decides, not what is drawn: a deferred view can still show home. The tab is
  // found by its icon, since a locale pack renames it.
  const home = page
    .getByRole('navigation')
    .getByRole('button')
    .filter({ has: page.locator('[data-pixel-icon="home"]') })
    .first();
  if (new URL(page.url()).pathname !== '/journal') await home.click(options);
  const hub = page.getByTestId('club-hub');
  await expect(hub).toBeVisible();
  if (await covering.isVisible())
    await covering.getByRole('button', { name: '창 닫기', exact: true }).click();
  const outcome = page.getByTestId('action-outcome');
  if (await outcome.isVisible())
    await outcome.getByRole('button', { name: /^(확인|알림 닫기)$/ }).click();
  const entrance = page
    .getByRole('navigation')
    .getByRole('button', { name: '구단주 사무실', exact: true })
    .filter({ visible: true })
    .first();
  await entrance.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  for (let attempt = 0; ; attempt++) {
    try {
      await entrance.click({ ...options, timeout: 2000 });
      break;
    } catch (error) {
      // Leaving a watched match may resume the clock and open the next eve after our dismissal.
      if (attempt >= 2 || !(await covering.isVisible())) throw error;
      await covering.getByRole('button', { name: '창 닫기', exact: true }).click();
    }
  }
  await expect(officeBar(page)).toBeVisible();
}

export async function closeOfficeOverview(page: Page) {
  const overview = page.getByRole('dialog', { name: '결재라인 모아보기', exact: true });
  if (await overview.isVisible())
    await overview.getByRole('button', { name: '창 닫기', exact: true }).click();
}

/** Back to the lobby from an area by ← 사무실; a no-op in the lobby. */
export async function officeLobby(page: Page) {
  await closeOfficeOverview(page);
  if ((await officeTitle(page).innerText()).trim() !== LOBBY)
    await officeBar(page).getByRole('button', { name: '사무실', exact: true }).click();
  await expect(officeTitle(page)).toHaveText(LOBBY);
}

/** Opens one office area (선수 계약, 스태프 계약, 재정·투자, 후원, 구단 디자인, 결재라인 모아보기) from its lobby card. */
export async function openOfficeArea(page: Page, area: string, options: { timeout?: number } = {}) {
  if (area === '투자') area = '재정·투자';
  if (area === '결재라인 모아보기') {
    const overview = page.getByRole('dialog', { name: area, exact: true });
    if (await overview.isVisible()) return;
    await enterOffice(page, options);
    await officeLobby(page);
    await page
      .locator('[data-ui="season-transport"]')
      .getByRole('button', { name: area, exact: true })
      .click(options);
    await expect(overview).toBeVisible();
    return;
  }
  await closeOfficeOverview(page);
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

/** Whole-club configuration is a secondary disclosure within investment. */
export async function openOfficeLibrary(page: Page) {
  await openOfficeArea(page, '투자');
  const library = page.getByTestId('office-library');
  if ((await library.getAttribute('open')) === null)
    await library.locator(':scope > summary').click();
  await expect(page.getByTestId('strategy-board')).toBeVisible();
}

/** Leaves the office by its 나가기 (through the lobby), back where it was entered from. */
export async function leaveOffice(page: Page) {
  await closeOfficeOverview(page);
  if (!(await inOffice(page))) return;
  await officeLobby(page);
  await officeBar(page).getByRole('button', { name: '나가기', exact: true }).click();
  await expect(officeBar(page)).toHaveCount(0);
}

/** Steps out of the office when inside it, for helpers that need the HUD or the menus. */
export async function outsideOffice(page: Page) {
  await closeOfficeOverview(page);
  if (await inOffice(page)) await leaveOffice(page);
}

/**
 * Runs a menu action (an export, a save retry) from outside the office and returns to the same
 * office area afterwards, so a test reading the save mid-edit keeps its place and draft. Transient
 * notices of the area (a failed apply) do not survive the visit.
 */
export async function aroundOffice<T>(page: Page, action: () => Promise<T>) {
  const context = await officeContext(page);
  if (!context) return action();
  const { area, libraryOpen } = context;
  await leaveOffice(page);
  const result = await action();
  if (area === LOBBY) await enterOffice(page);
  else if (area === '재정·투자' && libraryOpen) await openOfficeLibrary(page);
  else await openOfficeArea(page, area);
  return result;
}
