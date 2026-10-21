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

export async function marketCandidate(page: Page, id: string) {
  await page
    .getByTestId(`market-candidate-${id}`)
    .getByRole('button', { name: / 상세 보기$/ })
    .click();
  return page
    .getByRole('dialog', { name: '영입 후보 상세', exact: true })
    .getByTestId(`candidate-${id}`);
}
