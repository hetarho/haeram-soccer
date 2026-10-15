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
  // Seven tabs, staff included and the market inside the squad page, each a 44 px touch target.
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
  await nav.getByRole('button', { name: '구단 방향', exact: true }).click();
  const scroller = page.getByTestId('view-scroller');
  await expect(page.getByTestId('strategy-board')).toBeVisible();
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
  await expect(dialog.getByRole('button', { name: '선수·스태프', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: '창 닫기', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await nav.getByRole('button', { name: '선수·스태프', exact: true }).click();
  await expect(page.getByText(/^선수단 \d+\/26$/)).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
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
    expect(rect!.height).toBeGreaterThanOrEqual(48);
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(320);
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(568);
  }
  await close.click();
  await expect(dialog).toHaveCount(0);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test('the HUD stays at the top when warning bands make the column taller than a low screen', async ({
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
  // In debt and without a manager: two bands sit under the HUD on every view.
  fixture.cash = '-1';
  fixture.critical = MANAGER_GONE;
  await page.goto('/');
  await page
    .locator('input[type=file]')
    .last()
    .setInputFiles({
      name: 'low-screen.json',
      mimeType: 'application/json',
      buffer: Buffer.from(await encode(fixture)),
    });
  await expect(page.getByTestId('cash-alarm')).toBeVisible();
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
});
