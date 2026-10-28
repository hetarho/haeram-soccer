import type { Page } from '@playwright/test';

/** Enter via the primary group, then its local lens; retain all the journey's real UI steps. */
async function openLens(page: Page, hub: string, lens: string) {
  const tabs = page.getByRole('tablist', { name: hub, exact: true });
  if (!(await tabs.isVisible())) {
    const mobile = (page.viewportSize()?.width ?? 1280) <= 760;
    await page
      .getByRole('navigation', { name: mobile ? '모바일 게임 메뉴' : '게임 메뉴', exact: true })
      .getByRole('button', { name: '클럽하우스', exact: true })
      .click();
    if (hub === '역사')
      await page.getByRole('button', { name: '클럽 기록실', exact: true }).click();
    else await page.getByRole('button', { name: '현재 리그 보기', exact: true }).click();
  }
  if (hub === '역사' && !(await tabs.isVisible())) {
    const back = page
      .getByRole('navigation', { name: '시즌 기록 이동', exact: true })
      .getByRole('button', { name: /^←/ });
    if (await back.isVisible()) await back.click();
  }
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
