import { expect, test, type Page } from '@playwright/test';
import { advanceRound, clubNews, createWorld } from '../../packages/engine/src/index';
import { stopOnlyFor } from './events';
import { horizontalOverflow } from './layout';

const founding = (seed: string) => ({
  country: 'ENG' as const,
  name: 'Haeram Athletic',
  color: '#bf7956',
  seed,
  difficulty: 2 as const,
});
/** A seed whose first round brings a celebrated achievement (the club's first win). */
const seed = (() => {
  for (let i = 0; i < 60; i++) {
    const w = createWorld(founding(`news-celebrate-${i}`));
    advanceRound(w, undefined, false);
    if (clubNews(w).some((item) => item.celebrate)) return `news-celebrate-${i}`;
  }
  throw new Error('No seed in range wins its first round');
})();

async function found(page: Page) {
  // Nothing but the test's own steps may stop the clock or open a card.
  await stopOnlyFor(page, []);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill(seed);
  await page.getByRole('button', { name: '넉넉한 출발', exact: false }).click();
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
}
async function playRound(page: Page) {
  await page
    .getByTestId('club-hub')
    .getByRole('button', { name: '시즌 상세', exact: true })
    .click();
  const journal = page.getByRole('dialog', { name: '시즌 상세와 클럽 소식' });
  await journal.getByRole('button', { name: '한 라운드 진행', exact: true }).click();
  await expect(page.getByTestId('calendar')).toHaveText(/라운드 1$/);
  await journal.getByRole('button', { name: '창 닫기', exact: true }).click();
}
const newsButton = (page: Page) => page.getByTestId('news-button');

test('keeps the club name and compact cash readable in a 360 px HUD', async ({ page }) => {
  await found(page);
  // The name sits next to the HUD calendar line.
  const name = page.getByTestId('calendar').locator('..').getByText('Haeram Athletic', {
    exact: true,
  });
  expect(
    await name.evaluate(
      (el) => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1,
    ),
  ).toBe(true);
  // Whole pounds on a phone; the cash sheet and the label keep shillings and pence.
  expect(await page.getByTestId('hud-cash').innerText()).toMatch(/^£[\d,]+$/);
  await expect(page.getByTestId('hud-cash')).toHaveAttribute('aria-label', /\d+s \d+d/);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test('celebrates above the news button, which then holds the headline as NEW', async ({ page }) => {
  await found(page);
  await expect(newsButton(page)).toHaveAttribute('aria-label', '클럽 뉴스');
  await playRound(page);
  const banner = page.getByTestId('celebration');
  await expect(banner).toContainText('축하합니다');
  // The banner stays clear of the HUD and the clock row.
  const status = banner.getByRole('status');
  // Measure after the entry animation (the first one listed) has settled.
  await status.evaluate((el) => el.getAnimations()[0]?.finished);
  const clock = (await page.getByRole('region', { name: '시즌 진행' }).boundingBox())!;
  const card = (await status.boundingBox())!;
  expect(card.y).toBeGreaterThan(clock.y + clock.height);
  expect(card.y + card.height).toBeLessThanOrEqual((await newsButton(page).boundingBox())!.y);
  await expect(banner).toHaveCount(0, { timeout: 8000 });
  await expect(newsButton(page)).toHaveAttribute('aria-label', /새 소식 \d+개/);
  await newsButton(page).click();
  const sheet = page.getByRole('dialog', { name: '클럽 뉴스' });
  await expect(sheet).toContainText('창단 첫 공식전 승리');
  await sheet.getByRole('button', { name: '창 닫기', exact: true }).click();
  await expect(newsButton(page)).toHaveAttribute('aria-label', '클럽 뉴스');
});

test('"뉴스 표시 안 함" files achievements behind the news button without a banner', async ({
  page,
}) => {
  await found(page);
  await page.getByRole('button', { name: /^소식함/ }).click();
  const inbox = page.getByRole('dialog', { name: '소식함' });
  await inbox.getByLabel(/뉴스 표시 안 함/).check();
  await inbox.getByRole('button', { name: '닫기', exact: true }).click();
  await playRound(page);
  await expect(newsButton(page)).toHaveAttribute('aria-label', /새 소식 \d+개/);
  await expect(page.getByTestId('celebration')).toHaveCount(0);
  // The choice is per browser and shared with the news sheet.
  await page.reload();
  await newsButton(page).click();
  await expect(
    page.getByRole('dialog', { name: '클럽 뉴스' }).getByLabel(/뉴스 표시 안 함/),
  ).toBeChecked();
});
