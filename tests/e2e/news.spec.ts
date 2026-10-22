import { gameHud } from './layout';
import { advanceOneRound } from './season-progression';
import { expect, test, type Page } from '@playwright/test';
import { advanceRound, clubNews, createWorld, operate } from '../../packages/engine/src/index';
import { chooseLevel } from './events';
import { horizontalOverflow, settle } from './layout';

const founding = (seed: string) => ({
  country: 'ENG' as const,
  name: 'Haeram Athletic',
  color: '#bf7956',
  seed,
  level: 'easy' as const,
});
/** A seed whose first round brings a celebrated achievement (the club's first win). */
const seed = (() => {
  for (let i = 0; i < 60; i++) {
    const w = createWorld(founding(`news-celebrate-${i}`));
    // As the test plays it: the staff run the club at level 4 (→WEB-45).
    operate(w, {
      type: 'settings',
      settings: {
        ...w.settings!,
        responsibilities: {
          manager: 'delegated',
          staff: 'delegated',
          contracts: 'delegated',
          recruitment: 'delegated',
          sales: 'delegated',
          academy: 'delegated',
          sponsors: 'delegated',
        },
        observations: { matchEve: false, windowOpen: false },
      },
    });
    advanceRound(w, undefined, false);
    if (clubNews(w).some((item) => item.celebrate)) return `news-celebrate-${i}`;
  }
  throw new Error('No seed in range wins its first round');
})();

async function found(page: Page) {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill(seed);
  await page.getByRole('button', { name: '쉬움', exact: false }).click();
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  // Nothing but the test's own steps may stop the clock or open a card: level 4 stops only for
  // money and leaves offers to the staff.
  await chooseLevel(page, 4);
}
async function playRound(page: Page) {
  await advanceOneRound(page);
  await expect(page.getByTestId('game-round')).toHaveText('1');
}
const newsButton = (page: Page) => page.getByTestId('communications-button');

test('keeps the club name and compact cash readable in a 360 px HUD', async ({ page }) => {
  await found(page);
  // The name sits next to the HUD calendar line.
  const name = gameHud(page).getByText('Haeram Athletic', {
    exact: true,
  });
  expect(
    await name.evaluate(
      (el) => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1,
    ),
  ).toBe(true);
  // The money notation on every viewport (→WEB-67); label and title keep the exact amount.
  expect(await page.getByTestId('hud-cash').innerText()).toMatch(/^£[\d,]+$/);
  await expect(page.getByTestId('hud-cash')).toHaveAttribute('aria-label', /\d+s \d+d/);
  await expect(page.getByTestId('hud-cash')).toHaveAttribute('title', /\d+s \d+d/);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  // The desktop HUD reads the same way: no second, fully written amount beside it.
  await page.setViewportSize({ width: 1280, height: 800 });
  expect(await page.getByTestId('hud-cash').innerText()).toMatch(/^운영 자금\s*£[\d,]+$/);
});

test('celebrates in one lower line, with headlines collected in the clock news button', async ({
  page,
}) => {
  // A first round can queue several celebrations, each shown for a few seconds.
  test.setTimeout(60000);
  await found(page);
  await expect(newsButton(page)).toHaveAttribute('aria-label', /^알림·뉴스/);
  await playRound(page);
  const banner = page.getByTestId('celebration');
  await expect(banner).toContainText('축하합니다');
  // The banner stays clear of the HUD and the clock row.
  const status = banner.getByRole('status');
  // Measure after the entry animation (the first one listed) has settled.
  await status.evaluate((el) => el.getAnimations()[0]?.finished);
  const clock = (await page.getByRole('region', { name: '시즌 진행' }).boundingBox())!;
  const card = (await status.boundingBox())!;
  const button = (await newsButton(page).boundingBox())!;
  expect(card.y + card.height).toBeLessThanOrEqual(clock.y);
  // A phone keeps the view readable: one 44 px line above transport and navigation.
  expect(card.height).toBeLessThanOrEqual(44);
  expect(card.y).toBeGreaterThanOrEqual(button.y + button.height);
  const navigation = (await page
    .getByRole('navigation', { name: '모바일 게임 메뉴' })
    .boundingBox())!;
  expect(card.y + card.height).toBeLessThanOrEqual(navigation.y);
  // Every queued celebration (a first win, a hat-trick…) clears on its own.
  await expect(banner).toHaveCount(0, { timeout: 25000 });
  await expect(newsButton(page)).toHaveAttribute('aria-label', /새 소식 \d+개/);
  await newsButton(page).click();
  const sheet = page.getByRole('dialog', { name: '알림·뉴스', exact: true });
  await sheet.getByRole('tab', { name: /^뉴스/ }).click();
  await expect(sheet).toContainText('창단 첫 공식전 승리');
  await sheet.getByRole('button', { name: '창 닫기', exact: true }).click();
  await expect(newsButton(page)).toHaveAttribute('aria-label', /^알림·뉴스/);
});

test('"뉴스 표시 안 함" files achievements behind the news button without a banner', async ({
  page,
}) => {
  await found(page);
  await page.getByRole('button', { name: /^알림·뉴스/ }).click();
  const inbox = page.getByRole('dialog', { name: '알림·뉴스', exact: true });
  await inbox.getByLabel(/뉴스 표시 안 함/).check();
  await inbox.getByRole('button', { name: '닫기', exact: true }).click();
  await playRound(page);
  await expect(newsButton(page)).toHaveAttribute('aria-label', /새 소식 \d+개/);
  await expect(page.getByTestId('celebration')).toHaveCount(0);
  // The choice is per browser and shared with the news tab.
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  await newsButton(page).click();
  await page
    .getByRole('dialog', { name: '알림·뉴스', exact: true })
    .getByRole('tab', { name: /^뉴스/ })
    .click();
  await expect(
    page.getByRole('dialog', { name: '알림·뉴스', exact: true }).getByLabel(/뉴스 표시 안 함/),
  ).toBeChecked();
});

for (const width of [390, 1280]) {
  test(`shares one notification/news dialog with independent read counts and keyboard tabs at ${width}px`, async ({
    page,
  }) => {
    await found(page);
    await page.setViewportSize({ width, height: 844 });
    await playRound(page);
    const trigger = newsButton(page);
    await expect(trigger).toHaveCount(1);
    await expect(page.locator('header').getByTestId('communications-button')).toBeVisible();
    await settle(page);
    const triggerBox = (await trigger.boundingBox())!;
    const clockBox = (await page
      .getByRole('region', { name: '시즌 진행', exact: true })
      .boundingBox())!;
    expect(triggerBox.y + triggerBox.height).toBeLessThanOrEqual(clockBox.y);
    expect(triggerBox.width).toBeGreaterThanOrEqual(44);
    expect(triggerBox.height).toBeGreaterThanOrEqual(44);
    await expect(trigger).toBeInViewport();
    await expect(page.getByRole('button', { name: /^알림·결정/ })).toHaveCount(0);
    const address = page.url();
    await trigger.click();
    const sheet = page.getByRole('dialog', { name: '알림·뉴스', exact: true });
    const notifications = sheet.getByRole('tab', { name: /^알림·결정/ });
    const news = sheet.getByRole('tab', { name: /^뉴스/ });
    await expect(notifications).toHaveAttribute('aria-selected', 'true');
    const fresh = await news.textContent();
    expect(fresh).toMatch(/뉴스\d+/);
    const unread = await notifications.textContent();
    expect(unread).toMatch(/알림·결정\d+/);
    await sheet.getByRole('button', { name: '닫기', exact: true }).click();
    await trigger.click();
    await expect(news).toHaveText(fresh!);
    await notifications.focus();
    await notifications.press('ArrowRight');
    await expect(news).toBeFocused();
    await expect(news).toHaveAttribute('aria-selected', 'true');
    await expect(sheet.getByTestId('news-item').first()).toBeVisible();
    await expect(sheet.getByRole('button', { name: '모두 읽음' })).toHaveCount(0);
    await sheet.getByRole('button', { name: '기록', exact: true }).click();
    for (const item of await sheet.getByTestId('news-item').all())
      await expect(item).toContainText('기록');
    await news.focus();
    await news.press('Home');
    await expect(notifications).toBeFocused();
    await expect(notifications).toHaveText(unread!);
    await expect(news).toHaveText('뉴스');
    await sheet.getByRole('button', { name: '모두 읽음', exact: true }).click();
    await expect(notifications).toHaveText('알림·결정');
    await sheet.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(trigger).toHaveAccessibleName('알림·뉴스');
    await expect(trigger).toBeFocused();
    await expect(page).toHaveURL(address);
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await page
      .getByRole('dialog', { name: '설정' })
      .getByRole('button', { name: '알림·뉴스', exact: true })
      .click();
    await expect(sheet).toHaveCount(1);
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await sheet.getByRole('tab', { name: /^뉴스/ }).click();
    await settle(page);
    await page.screenshot({ path: test.info().outputPath(`news-dialog-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
}
