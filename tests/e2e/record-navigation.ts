import { expect, type Page } from '@playwright/test';

/** Enter the current club season through the user-facing season list. */
export async function openCurrentClubSeason(page: Page) {
  await page.getByRole('tab', { name: '시즌별 기록', exact: true }).click();
  await page.getByRole('table', { name: '시즌별 기록' }).getByRole('button').first().click();
  await expect(page.getByRole('combobox', { name: '기록 시즌', exact: true })).toBeVisible();
}
export async function openSeasonReview(page: Page) {
  await page.getByRole('button', { name: '우리 구단의 이 시즌 기록', exact: true }).click();
  await page.getByText('리그 심층 분석·구단 재정 결산', { exact: true }).click();
  await expect(page.getByTestId('season-review')).toBeVisible();
}
