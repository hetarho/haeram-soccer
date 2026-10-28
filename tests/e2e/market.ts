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
export async function marketCandidate(page: Page, id: string, name: string) {
  const filters = await marketFilters(page);
  await filters.getByRole('button', { name: '초기화', exact: true }).click();
  await closeMarketPanel(page, '영입 필터');
  const search = page.getByRole('searchbox', { name: '선수 이름 검색', exact: true });
  await search.fill(name);
  await expect(search).toHaveValue(name);
  const pages = page.getByRole('navigation', { name: '영입 목록 페이지', exact: true });
  const status = pages.getByRole('status');
  const next = pages.getByRole('button', { name: '다음 페이지', exact: true });
  const row = page.getByTestId(`market-candidate-${id}`);
  for (let current = 1; ; current++) {
    // Pending queries have no pagination. Wait for the requested page before inspecting rows,
    // since a shared name can span several pages under the default OVR order.
    await expect(status).toHaveText(
      new RegExp(`^총 \\d+명 · ${current} / \\d+ 페이지 · \\d+명 표시$`),
    );
    if (await row.count()) break;
    if (await next.isDisabled())
      throw new Error(`Market player ${id} (${name}) absent: ${await status.innerText()}`);
    await next.click();
  }
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: / 상세 보기$/ }).click();
  const candidate = page
    .getByRole('dialog', { name: '영입 후보 상세', exact: true })
    .getByTestId(`candidate-${id}`);
  await expect(candidate).toBeVisible();
  return candidate;
}
