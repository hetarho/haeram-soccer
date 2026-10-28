import { expect, type Page } from '@playwright/test';

export const marketRows = (page: Page) =>
  page.locator('table[aria-label="영입 후보 목록"] tbody tr[data-candidate-id]');

export async function marketFilters(page: Page) {
  await page.getByRole('button', { name: '영입 필터', exact: true }).click();
  return page.getByRole('dialog', { name: '영입 필터', exact: true });
}

export async function marketInfo(page: Page) {
  await page
    .getByRole('button', { name: '영입 정보 · 필요한 영입과 감독 요청', exact: true })
    .click();
  return page.getByRole('dialog', { name: '영입 정보', exact: true });
}

export async function closeMarketPanel(page: Page, name: string) {
  const dialog = page.getByRole('dialog', { name, exact: true });
  await dialog.getByRole('button', { name: '창 닫기', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

/** Find a retained identity through the public name search, independently of the current page. */
export async function marketCandidate(page: Page, id: string, name?: string) {
  if (name) {
    const filters = await marketFilters(page);
    await filters.getByRole('button', { name: '초기화', exact: true }).click();
    await closeMarketPanel(page, '영입 필터');
    await page.getByRole('searchbox', { name: '선수 이름 검색', exact: true }).fill(name);
  }
  await expect(page.getByTestId(`market-candidate-${id}`)).toBeVisible();
  await page
    .getByTestId(`market-candidate-${id}`)
    .getByRole('button', { name: / 상세 보기$/ })
    .click();
  return page
    .getByRole('dialog', { name: '영입 후보 상세', exact: true })
    .getByTestId(`candidate-${id}`);
}
