import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('uses reachable mobile navigation and traps modal focus without scrolling the background', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill('mobile-navigation');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  const nav = page.getByRole('navigation', { name: '모바일 게임 메뉴' });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('button')).toHaveCount(5);
  const metrics = await nav.getByRole('button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return { width: rect.width, height: rect.height, bottom: rect.bottom };
    }),
  );
  expect(metrics.every((button) => button.width >= 44 && button.height >= 48)).toBe(true);
  expect(metrics.every((button) => button.bottom <= 844)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  const more = nav.getByRole('button', { name: '더보기', exact: true });
  await expect(more).toBeEnabled();
  await page.evaluate(() => window.scrollTo(0, 240));
  const before = await page.evaluate(() => scrollY);
  await more.focus();
  await more.click();
  const dialog = page.getByRole('dialog', { name: '전체 메뉴' }),
    close = dialog.getByRole('button', { name: '창 닫기', exact: true });
  await expect(dialog).toBeVisible();
  await expect(close).toBeFocused();
  expect(await page.evaluate(() => document.body.style.position)).toBe('fixed');
  expect(await page.evaluate(() => document.getElementById('root')?.inert)).toBe(true);
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBe(0);
  expect(bounds!.width).toBe(390);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);

  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(more).toBeFocused();
  expect(await page.evaluate(() => document.getElementById('root')?.inert)).toBe(false);
  expect(await page.evaluate(() => document.body.style.position)).not.toBe('fixed');
  expect(await page.evaluate(() => scrollY)).toBe(before);

  await more.click();
  await dialog.getByRole('button', { name: '선수와 영입', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: /우리 선수단/ })).toBeVisible();
  await nav.getByRole('button', { name: '리그', exact: true }).click();
  await expect(page.getByRole('table', { name: '리그 순위표' }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('keeps confirmation actions and its close control inside a small mobile viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await page
    .getByRole('navigation', { name: '모바일 게임 메뉴' })
    .getByRole('button', { name: '더보기', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: '전체 메뉴' })
    .getByRole('button', { name: '새로운 세계', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: '새로운 세계 창단 확인' }),
    close = dialog.getByRole('button', { name: '창 닫기', exact: true }),
    confirm = dialog.getByRole('button', { name: '새 세계 설정', exact: true });
  await expect(dialog).toBeVisible();
  for (const control of [close, confirm]) {
    const rect = await control.boundingBox();
    expect(rect!.height).toBeGreaterThanOrEqual(48);
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(320);
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(568);
  }
  await close.click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
