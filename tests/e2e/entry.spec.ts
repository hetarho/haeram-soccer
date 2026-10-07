import { expect, test } from '@playwright/test';
test('serves a real static application entry', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Haeram/ })).toBeVisible();
});
test('creates, computes and reloads through the bundled worker', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByRole('heading', { name: 'Haeram Athletic' })).toBeVisible();
  await page.getByRole('button', { name: '다음 라운드' }).click();
  await expect(page.getByText('시즌 1901 · 라운드 1')).toBeVisible();
  await expect(page.getByText('저장 완료: 1')).toBeVisible();
  await page.reload();
  await expect(page.getByText('시즌 1901 · 라운드 1')).toBeVisible();
});
