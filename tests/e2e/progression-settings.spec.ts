import { expect, test } from '@playwright/test';

test('mobile settings expose all paces and manual days without advancing while choosing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  const date = page.getByTestId('game-date');
  await expect(date).toHaveText('1901년 8월 1일');
  const settings = page.getByRole('button', { name: '진행 설정', exact: true });
  const rect = await settings.boundingBox();
  expect(rect!.width).toBeGreaterThanOrEqual(44);
  expect(rect!.height).toBeGreaterThanOrEqual(44);
  expect(rect!.y + rect!.height).toBeLessThan(740);
  await settings.click();
  const dialog = page.getByRole('dialog', { name: '시즌 진행 설정' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '2단계' }).click();
  await expect(date).toHaveText('1901년 8월 1일');
  await dialog.getByRole('button', { name: '하루 진행', exact: true }).click();
  await expect(date).toHaveText('1901년 8월 2일');
  await dialog.getByRole('button', { name: '설정 확인 마치기', exact: true }).click();
  await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
  await expect(date).toHaveText('1901년 8월 5일');
  await page.getByRole('button', { name: '자동 진행 정지', exact: true }).click();
  await settings.click();
  await dialog.getByRole('button', { name: '3단계' }).click();
  await dialog.getByRole('button', { name: '설정 확인 마치기' }).click();
  await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
  await expect(page.getByTestId('calendar')).toContainText('라운드 1');
  await page.getByRole('button', { name: '자동 진행 정지', exact: true }).click();
});

test('visibility events suspend the shared clock and return requires explicit restart', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  const date = page.getByTestId('game-date');
  await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
  await expect(date).toHaveText('1901년 8월 2일');
  // Headless engines keep pages visible; exercise the real browser listener with its hidden input.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('button', { name: '자동 진행 시작', exact: true })).toBeVisible();
  const paused = await date.textContent();
  await page.waitForTimeout(1200);
  await expect(date).toHaveText(paused!);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(1200);
  await expect(date).toHaveText(paused!);
  await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
  await expect(date).not.toHaveText(paused!);
  await page.getByRole('button', { name: '자동 진행 정지', exact: true }).click();
});
