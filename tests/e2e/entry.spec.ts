import { expect, test } from '@playwright/test';
test('serves a real static application entry', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('club-founding')).toBeVisible();
  await expect(page.getByRole('heading', { name: '작은 클럽의, 큰 내일.' })).toBeVisible();
  await expect(page.getByRole('button', { name: '클럽 창단' })).toBeEnabled();
});
test('creates, computes and reloads through the bundled worker', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByText('Haeram Athletic', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: '자세한 클럽 일지', exact: true }).click();
  await page.getByRole('button', { name: '다음 라운드', exact: true }).click();
  await expect(page.getByText('시즌 1901 · 라운드 1')).toBeVisible();
  await expect(page.getByTestId('save-status')).toContainText('저장 완료 · r1');
  await page
    .getByRole('dialog', { name: '클럽 일지 상세' })
    .getByRole('button', { name: '창 닫기' })
    .click();
  await page.reload();
  await expect(page.getByText('시즌 1901 · 라운드 1')).toBeVisible();
});
test('observes event-backed metrics, historical locks and responsive navigation', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await page.getByRole('button', { name: '다음 경기 관전' }).click();
  await expect(page.getByRole('heading', { name: '90분의 작은 드라마.' })).toBeVisible();
  await page.getByRole('button', { name: '결과 보기' }).click();
  await expect(page.getByText(/90′ ·/)).toBeVisible();
  await page.getByRole('button', { name: '경기 상세', exact: true }).click();
  await expect(page.getByText('유효 슈팅', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '유럽 무대' }).click();
  await expect(page.getByText('54년 후 창설 예정')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileMenu = page.getByRole('navigation', { name: '모바일 게임 메뉴' });
  await expect(mobileMenu).toBeVisible();
  for (const label of ['클럽 일지', '경기 관전', '리그', '클럽 경영', '더보기']) {
    const bounds = await mobileMenu.getByRole('button', { name: label, exact: true }).boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  }
  await mobileMenu.getByRole('button', { name: '더보기', exact: true }).click();
  const allMenu = page.getByRole('dialog', { name: '전체 메뉴' });
  await expect(allMenu).toBeVisible();
  await allMenu.getByRole('button', { name: '선수와 영입', exact: true }).click();
  await expect(allMenu).toHaveCount(0);
  await expect(page.getByRole('button', { name: '우리 선수단 · 18/26' })).toBeVisible();
  await mobileMenu.getByRole('button', { name: '리그', exact: true }).click();
  await expect(page.getByRole('tab', { name: '순위표', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('combobox', { name: '국가', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
