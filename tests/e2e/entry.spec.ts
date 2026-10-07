import { expect, test } from '@playwright/test';
test('serves a real static application entry', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Haeram/ })).toBeVisible();
});
test('creates, computes and reloads through the bundled worker', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByText('Haeram Athletic', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: '다음 라운드', exact: true }).click();
  await expect(page.getByText('시즌 1901 · 라운드 1')).toBeVisible();
  await expect(page.getByTestId('save-status')).toContainText('저장 완료 · r1');
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
  await expect(page.getByText('유효 슈팅', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '유럽 무대' }).click();
  await expect(page.getByText('54년 후 창설 예정')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '리그', exact: true }).click();
  await expect(page.getByLabel('국가', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
