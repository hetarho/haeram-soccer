import { openPersonnel } from './personnel-navigation';
import { openLeague } from './competition-navigation';
import { expect, test } from '@playwright/test';
import { encode } from '../../apps/web/src/adapters/persistence';
import { createWorld } from '../../packages/engine/src/index';
import { MANAGER_GONE } from '../../packages/engine/src/operations';
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
  // Competition hubs share the bar with home and personnel, each a 44 px touch target.
  await expect(nav.getByRole('button')).toHaveCount(6);
  const metrics = await nav.getByRole('button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return { width: rect.width, height: rect.height, bottom: rect.bottom };
    }),
  );
  expect(metrics.every((button) => button.width >= 44 && button.height >= 48)).toBe(true);
  expect(metrics.every((button) => button.bottom <= 844)).toBe(true);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  const more = page.getByRole('button', { name: '설정', exact: true });
  const moreBounds = await more.boundingBox();
  expect(moreBounds!.width).toBeGreaterThanOrEqual(44);
  expect(moreBounds!.height).toBeGreaterThanOrEqual(44);
  expect(moreBounds!.y).toBeGreaterThanOrEqual(0);
  await expect(more).toBeEnabled();
  // Pages scroll inside the view scroller; open a long page and scroll it before the modal.
  // Use a long tabbed page to exercise the shared scrolling shell.
  await openPersonnel(page, 'training');
  const scroller = page.getByTestId('view-scroller');
  await expect(page.getByTestId('training-focus')).toBeVisible();
  await scroller.evaluate((element) => element.scrollTo(0, 240));
  const before = await scroller.evaluate((element) => element.scrollTop);
  expect(before).toBeGreaterThan(0);
  expect(await scroller.evaluate((element) => getComputedStyle(element).scrollbarWidth)).toBe(
    'none',
  );
  // Wheel scrolling remains available without the native scroll thumb.
  await scroller.evaluate((element) => element.scrollTo(0, 0));
  await scroller.hover();
  await page.mouse.wheel(0, 240);
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await scroller.evaluate((element, top) => element.scrollTo(0, top), before);
  await more.focus();
  await more.click();
  const dialog = page.getByRole('dialog', { name: '설정' }),
    close = dialog.getByRole('button', { name: '창 닫기', exact: true });
  await expect(dialog).toBeVisible();
  await expect(close).toBeFocused();
  expect(
    await dialog
      .locator('[data-ui="dialog-body"]')
      .evaluate((element) => getComputedStyle(element).scrollbarWidth),
  ).toBe('none');
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
  await expect(dialog.getByRole('button', { name: '감독 사무실', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: '창 닫기', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await openPersonnel(page, 'players');
  await expect(page.getByText(/^선수단 \d+\/40$/)).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await openLeague(page);
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
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page
    .getByRole('dialog', { name: '설정' })
    .getByRole('button', { name: '게임 슬롯', exact: true })
    .click();
  const slot = page.getByTestId('game-slots').getByRole('listitem', { name: '슬롯 1' });
  await slot.getByText('관리', { exact: true }).click();
  await slot.getByRole('button', { name: '삭제', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '게임 삭제 확인' }),
    close = dialog.getByRole('button', { name: '창 닫기', exact: true }),
    confirm = dialog.getByRole('button', { name: '삭제', exact: true });
  await expect(dialog).toBeVisible();
  await settle(page);
  for (const control of [close, confirm]) {
    const rect = await control.boundingBox();
    expect(rect!.height).toBeGreaterThanOrEqual(44);
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(320);
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(568);
  }
  await close.click();
  await expect(dialog).toHaveCount(0);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test('floating warnings leave the HUD and content fixed on low and phone screens', async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const fixture = createWorld({
    country: 'ENG',
    name: 'Low Screen',
    color: '#24543b',
    seed: 'low-screen-hud',
    level: 'normal' as const,
  });
  // Debt retains its status band; the manager choice floats above the current page.
  fixture.cash = '-1';
  fixture.critical = MANAGER_GONE;
  await page.goto('/');
  // An import before the client is ready is dropped; founding enables once it is (CI 39952590526).
  await expect(page.getByRole('button', { name: '클럽 창단' })).toBeEnabled();
  await page
    .locator('input[type=file]')
    .last()
    .setInputFiles({
      name: 'low-screen.json',
      mimeType: 'application/json',
      buffer: Buffer.from(await encode(fixture)),
    });
  await expect(page.getByTestId('cash-alarm')).toBeVisible();
  const alerts = page.getByTestId('runtime-alerts');
  await expect(alerts).toContainText('감독이 떠났어요');
  expect(
    await alerts.evaluate((element) => ({
      portal: element.parentElement === document.body,
      position: getComputedStyle(element).position,
    })),
  ).toEqual({ portal: true, position: 'fixed' });
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await settle(page);
    const bounds = (await alerts.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    const nav = page.getByRole('navigation', { name: '모바일 게임 메뉴' });
    const bottom = (await nav.isVisible()) ? (await nav.boundingBox())!.y : viewport.height;
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(bottom);
  }
  await settle(page);
  const shell = () =>
    page.evaluate(() => ({
      main: document.querySelector('main')!.scrollTop,
      hud: Math.round(document.querySelector('header')!.getBoundingClientRect().top),
    }));
  // Scrolling a view's element into place, as moving to a board row does, and walking the focus
  // move only the view scroller: the shell around it never scrolls (→WEB-10).
  await page.evaluate(() => {
    const scroller = document.querySelector('[data-testid="view-scroller"]')!;
    scroller.lastElementChild?.scrollIntoView({ block: 'start' });
  });
  expect(await shell()).toEqual({ main: 0, hud: 0 });
  for (let i = 0; i < 25; i++) await page.keyboard.press('Tab');
  expect(await shell()).toEqual({ main: 0, hud: 0 });
  const before = await page.getByTestId('view-scroller').boundingBox();
  await alerts.getByRole('button', { name: '임시 감독으로 계속', exact: true }).click();
  await expect(alerts).toHaveCount(0);
  expect(await page.getByTestId('view-scroller').boundingBox()).toEqual(before);
  expect(await shell()).toEqual({ main: 0, hud: 0 });
});
