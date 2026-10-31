import { openClubRecords } from './competition-navigation';
import { expect, type Page } from '@playwright/test';

/** The records tabs, which stay above an opened season too (→WEB-54). */
export async function showRecordTabs(page: Page) {
  await expect(page.getByRole('tablist', { name: '기록실 보기' })).toBeVisible();
}
/** Enter the current club season through the user-facing season list. */
export async function openCurrentClubSeason(page: Page) {
  await showRecordTabs(page);
  await page.getByRole('tab', { name: '시즌별 기록', exact: true }).click();
  await page.getByRole('table', { name: '시즌별 기록' }).getByRole('button').first().click();
  await expect(page.getByRole('combobox', { name: '기록 시즌', exact: true })).toBeVisible();
}
export async function openSeasonReview(page: Page) {
  await page.getByRole('button', { name: '우리 구단의 이 시즌 기록', exact: true }).click();
  await page.getByText('리그 심층 분석·구단 재정 결산', { exact: true }).click();
  await expect(page.getByTestId('season-review')).toBeVisible();
}
/** The records room's 감독 이력 list (→WEB-92), once its first page is shown. */
export async function openManagerHistory(page: Page) {
  await openClubRecords(page);
  await showRecordTabs(page);
  await page.getByRole('tab', { name: '감독 이력', exact: true }).click();
  const list = managerHistoryList(page);
  await expect(list.getByRole('article').first()).toBeVisible();
  return list;
}
export const managerHistoryList = (page: Page) =>
  page.getByRole('region', { name: '감독 이력', exact: true });
/** A tenure's card by the name and service period T305 labels it with. */
export const tenureCard = (page: Page, view: { name: string; service: string }) =>
  managerHistoryList(page).getByRole('article', {
    name: `${view.name} · ${view.service}`,
    exact: true,
  });
/** The content region's scroll position, which a return restores (→WEB-74). */
export const viewScroll = (page: Page) =>
  page.getByTestId('view-scroller').evaluate((element) => element.scrollTop);
