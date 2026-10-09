import { expect, test } from '@playwright/test';
import { horizontalOverflow, settle } from './layout';

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
  await expect(nav.getByRole('button')).toHaveCount(7);
  const metrics = await nav.getByRole('button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return { width: rect.width, height: rect.height, bottom: rect.bottom };
    }),
  );
  expect(metrics.every((button) => button.width >= 44 && button.height >= 48)).toBe(true);
  expect(metrics.every((button) => button.bottom <= 844)).toBe(true);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  const more = page.getByRole('button', { name: '전체 메뉴', exact: true });
  const moreBounds = await more.boundingBox();
  expect(moreBounds!.width).toBeGreaterThanOrEqual(44);
  expect(moreBounds!.height).toBeGreaterThanOrEqual(44);
  expect(moreBounds!.y).toBeGreaterThanOrEqual(0);
  await expect(more).toBeEnabled();
  // Pages scroll inside the view scroller; open a long page and scroll it before the modal.
  await nav.getByRole('button', { name: '구단 운영', exact: true }).click();
  const scroller = page.getByTestId('view-scroller');
  await expect(page.getByRole('region', { name: '구단 운영 방침' })).toBeVisible();
  await scroller.evaluate((element) => element.scrollTo(0, 240));
  const before = await scroller.evaluate((element) => element.scrollTop);
  expect(before).toBeGreaterThan(0);
  await more.focus();
  await more.click();
  const dialog = page.getByRole('dialog', { name: '전체 메뉴' }),
    close = dialog.getByRole('button', { name: '창 닫기', exact: true });
  await expect(dialog).toBeVisible();
  await expect(close).toBeFocused();
  expect(await page.evaluate(() => document.body.style.position)).toBe('fixed');
  expect(await page.evaluate(() => document.getElementById('root')?.inert)).toBe(true);
  await settle(page);
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
  expect(await scroller.evaluate((element) => element.scrollTop)).toBe(before);
  expect(await page.evaluate(() => scrollY)).toBe(0);

  await more.click();
  await expect(dialog.getByRole('button', { name: '선수단', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: '창 닫기', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await nav.getByRole('button', { name: '선수단', exact: true }).click();
  await expect(page.getByRole('button', { name: /^선수단 \d+\/26$/ })).toBeVisible();
  await nav.getByRole('button', { name: '리그', exact: true }).click();
  await page.getByRole('tab', { name: '순위표', exact: true }).click();
  await expect(page.getByRole('table', { name: '리그 순위표' }).first()).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test('keeps confirmation actions and its close control inside a small mobile viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await page.getByRole('button', { name: '전체 메뉴', exact: true }).click();
  await page
    .getByRole('dialog', { name: '전체 메뉴' })
    .getByRole('button', { name: '새로운 세계', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: '새로운 세계 창단 확인' }),
    close = dialog.getByRole('button', { name: '창 닫기', exact: true }),
    confirm = dialog.getByRole('button', { name: '새 세계 설정', exact: true });
  await expect(dialog).toBeVisible();
  await settle(page);
  for (const control of [close, confirm]) {
    const rect = await control.boundingBox();
    expect(rect!.height).toBeGreaterThanOrEqual(48);
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(320);
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(568);
  }
  await close.click();
  await expect(dialog).toHaveCount(0);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});
