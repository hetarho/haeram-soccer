import { expect, test } from '@playwright/test';
test('serves a real static application entry', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Haeram/ })).toBeVisible();
});
