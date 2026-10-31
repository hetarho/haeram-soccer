import { expect, type Page } from '@playwright/test';
import { settle } from './layout';
import { enterOffice, officeLobby } from './office';
import { chooseOption } from './select';

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

/** A primary navigation entry (→WEB-10), found by its icon since a locale pack renames it. */
export const primaryEntry = (page: Page, icon: 'table' | 'cup' | 'history' | 'switch') =>
  page
    .getByRole('navigation')
    .getByRole('button')
    .filter({ has: page.locator(`[data-pixel-icon="${icon}"]`) })
    .filter({ visible: true })
    .first();

/** The current league through its primary entry, once its live tabs are shown. */
async function openCurrentLeague(page: Page) {
  if (new URL(page.url()).pathname !== '/season' || !(await leagueTabs(page).isVisible()))
    await primaryEntry(page, 'table').click();
  await expect(page).toHaveURL((url) => url.pathname === '/season');
  await expect(leagueTabs(page)).toBeVisible();
  await settle(page);
}
const leagueTabs = (page: Page) => page.getByRole('tablist', { name: '리그 보기', exact: true });

/**
 * The league (→WEB-10). A closed season opens from the league's own season filter: `archive`
 * picks that season, the latest closed one when given as true.
 */
export async function openLeague(page: Page, archive: boolean | number = false) {
  await openCurrentLeague(page);
  if (archive === false) return;
  const season = page.getByRole('combobox', { name: '시즌', exact: true });
  await chooseOption(season, archive === true ? { index: 1 } : String(archive));
  await expect(page).toHaveURL((url) => url.pathname === '/history');
  await expect(page.getByRole('tablist', { name: '지난 시즌 보기', exact: true })).toBeVisible();
  await settle(page);
}
/**
 * Resume the selected current-season league/lens without an own-league selection request: the
 * journal's league link in the owner office restores the notebook.
 */
export async function resumeLeague(page: Page) {
  await enterOffice(page);
  await officeLobby(page);
  await page.getByRole('button', { name: '클럽 소식·시즌 브리핑', exact: true }).click();
  await page
    .getByRole('dialog', { name: '시즌 상세와 클럽 소식', exact: true })
    .getByRole('button', { name: '전체 리그 보기 →', exact: true })
    .click();
  await expect(page).toHaveURL((url) => url.pathname === '/season');
  await expect(leagueTabs(page)).toBeVisible();
  await settle(page);
}
/** Retrace the league detour, entered from the menu, back to the retained match. */
export async function returnToMatch(page: Page) {
  await page.goBack();
  await expect(page).toHaveURL((url) => url.pathname === '/matches');
  await expect(page.getByTestId('match-theatre')).toBeVisible();
  await settle(page);
}
/** The cups through their primary entry; this season or past records by their own tabs. */
export async function openCups(page: Page, archive = false) {
  const tabs = page.getByRole('tablist', { name: '컵 대회', exact: true });
  if (!(await tabs.isVisible())) await primaryEntry(page, 'cup').click();
  await expect(tabs).toBeVisible();
  await settle(page);
  const tab = tabs.getByRole('tab', {
    name: archive ? '이전 컵대회 기록' : '컵 대회',
    exact: true,
  });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}
/** The club records room through the 기록 entry. */
export async function openClubRecords(page: Page) {
  if (new URL(page.url()).pathname !== '/history' || !(await recordTabs(page).isVisible()))
    await primaryEntry(page, 'history').click();
  await expect(page).toHaveURL((url) => url.pathname === '/history');
  await expect(recordTabs(page)).toBeVisible();
  await settle(page);
}
const recordTabs = (page: Page) => page.getByRole('tablist', { name: '기록실 보기', exact: true });
