import { expect, type Page } from '@playwright/test';
import { settle } from './layout';

// Imported careers can retain the root address as their remembered dashboard route.
const isClubhouseRoute = (url: URL) => url.pathname === '/journal' || url.pathname === '/';

/**
 * The shared primary navigation's clubhouse entry (→WEB-10), on the sidebar or the phone tab bar.
 * It is found by its icon, since a locale pack renames it.
 */
export const clubhouseTab = (page: Page) =>
  page
    .getByRole('navigation')
    .getByRole('button')
    .filter({ has: page.locator('[data-pixel-icon="home"]') })
    .filter({ visible: true })
    .first();

/** Back to the clubhouse through the primary navigation, once its briefing is shown. */
export async function openClubhouse(page: Page) {
  await clubhouseTab(page).click();
  await expect(page).toHaveURL(isClubhouseRoute);
  const home = page.getByTestId('club-hub');
  await expect(home).toBeVisible();
  await settle(page);
  return home;
}

/**
 * The calendar date the information row shows. Current League and Cup omit that row (→WEB-18),
 * so a journey reads the date at the clubhouse, which shows it beside our league.
 */
export async function clubhouseDate(page: Page) {
  await openClubhouse(page);
  return page.getByTestId('game-date');
}

/** Enter through the clubhouse, then its local lens, using the journey's real UI steps. */
async function openLens(
  page: Page,
  hub: string,
  lens: string,
  entry: 'current' | 'resume' = 'current',
) {
  const pathname = hub === '역사' ? '/history' : '/season';
  const tabs = page.getByRole('tablist', { name: hub, exact: true });
  // Navigation updates the address before deferred content replaces the outgoing tabs.
  if (new URL(page.url()).pathname !== pathname) {
    const home = await openClubhouse(page);
    if (hub === '역사')
      await home.getByRole('button', { name: '클럽 기록실', exact: true }).click();
    else if (entry === 'resume') {
      // This link restores the notebook; the explicit current-league shortcut selects our league.
      await home.getByRole('button', { name: '클럽 소식·시즌 브리핑', exact: true }).click();
      await page
        .getByRole('dialog', { name: '시즌 상세와 클럽 소식', exact: true })
        .getByRole('button', { name: '전체 리그 보기 →', exact: true })
        .click();
    } else await home.getByRole('button', { name: '리그 보기', exact: true }).click();
  }
  await expect(page).toHaveURL((url) => url.pathname === pathname);
  if (hub === '역사') {
    const back = page
      .getByRole('navigation', { name: '시즌 기록 이동', exact: true })
      .getByRole('button', { name: /^←/ });
    await expect(tabs.or(back).filter({ visible: true }).first()).toBeVisible();
    if (!(await tabs.isVisible())) await back.click();
  }
  await expect(tabs).toBeVisible();
  await settle(page);
  const tab = tabs.getByRole('tab', { name: lens, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}
export const openLeague = (page: Page, archive = false) =>
  openLens(page, archive ? '역사' : '시즌', archive ? '이전 리그 기록' : '리그');
/** Resume the selected current-season league/lens without an own-league selection request. */
export const resumeLeague = (page: Page) => openLens(page, '시즌', '리그', 'resume');
/** Retrace the league detour through the clubhouse to the retained match. */
export async function returnToMatch(page: Page) {
  await page.goBack();
  await expect(page).toHaveURL(isClubhouseRoute);
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL((url) => url.pathname === '/matches');
  await expect(page.getByTestId('match-theatre')).toBeVisible();
  await settle(page);
}
export const openCups = (page: Page, archive = false) =>
  openLens(page, archive ? '역사' : '시즌', archive ? '이전 컵대회 기록' : '컵 대회');
export const openClubRecords = (page: Page) => openLens(page, '역사', '클럽 기록실');
