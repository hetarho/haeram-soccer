import type { Page } from '@playwright/test';

/** Enter via the primary group, then its local lens; retain all the journey's real UI steps. */
async function openLens(page: Page, hub: string, lens: string) {
  const mobile = (page.viewportSize()?.width ?? 1280) <= 760;
  await page
    .getByRole('navigation', { name: mobile ? '모바일 게임 메뉴' : '게임 메뉴', exact: true })
    .getByRole('button', { name: hub, exact: true })
    .click();
  await page
    .getByRole('tablist', { name: hub, exact: true })
    .getByRole('tab', { name: lens, exact: true })
    .click();
}
export const openLeague = (page: Page, archive = false) =>
  openLens(page, archive ? '역사' : '시즌', archive ? '이전 리그 기록' : '리그');
export const openCups = (page: Page, archive = false) =>
  openLens(page, archive ? '역사' : '시즌', archive ? '이전 컵대회 기록' : '컵 대회');
export const openClubRecords = (page: Page) => openLens(page, '역사', '클럽 기록실');
