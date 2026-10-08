import { expect, test } from '@playwright/test';
import { chooseOption } from './select';

async function start(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
}
async function quick(page: import('@playwright/test').Page, action: string) {
  await page.getByRole('button', { name: '빠른 관여', exact: true }).click();
  const menu = page.getByRole('dialog', { name: '빠른 관여', exact: true });
  await menu.getByRole('button', { name: action, exact: false }).click();
}
for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 1440, height: 1000 },
]) {
  test(`intervenes from the league without losing filters, restarting progress or covering core controls at ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await start(page);
    const launcher = page.getByRole('button', { name: '빠른 관여', exact: true });
    const rect = await launcher.boundingBox();
    expect(rect!.height).toBeGreaterThanOrEqual(44);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(viewport.width);
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(viewport.height);
    if (viewport.width < 760) {
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
        viewport.height + 2,
      );
      const shortcuts = page
        .getByTestId('club-hub')
        .getByRole('button', { name: '자세한 클럽 일지' });
      const bounds = await shortcuts.boundingBox();
      expect(rect!.y).toBeGreaterThanOrEqual(bounds!.y + bounds!.height);
    }
    const nav = page.getByRole('navigation', {
      name: viewport.width < 760 ? '모바일 게임 메뉴' : '게임 메뉴',
      exact: true,
    });
    await nav.getByRole('button', { name: '리그', exact: true }).click();
    await chooseOption(page.getByRole('combobox', { name: '국가', exact: true }), 'FRA');
    const contextUrl = page.url();
    await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
    await quick(page, '훈련·회복');
    const training = page.getByRole('dialog', { name: '선수 성장과 훈련' });
    await training.getByRole('button', { name: '회복 집중' }).click();
    await expect(training.getByRole('status')).toContainText('회복 집중');
    await training.getByRole('button', { name: '훈련 준비 마치기' }).click();
    await expect(launcher).toBeFocused();
    await expect(page).toHaveURL(contextUrl);
    await expect(page.getByRole('combobox', { name: '국가', exact: true })).toHaveAttribute(
      'data-value',
      'FRA',
    );
    await expect(page.getByRole('button', { name: '자동 진행 시작', exact: true })).toBeVisible();
    const date = await page.getByTestId('game-date').innerText();
    await page.waitForTimeout(1200);
    await expect(page.getByTestId('game-date')).toHaveText(date);
    await quick(page, '클럽 투자');
    const business = page.getByRole('dialog', { name: '빠른 클럽 투자' });
    await business.getByRole('button', { name: '시설 투자 검토' }).click();
    const plan = page.getByRole('dialog', { name: '시설 투자 확인' });
    await expect(plan).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(plan).toHaveCount(0);
    await expect(business).toBeVisible();
    await expect(business.getByRole('button', { name: '시설 투자 검토' })).toBeFocused();
    await business.getByRole('button', { name: '보던 화면으로 돌아가기' }).click();
    await quick(page, '선수단·영입');
    await expect(page.getByRole('dialog', { name: '빠른 선수단·영입' })).toContainText('우리 선수');
    await page.getByRole('button', { name: '보던 화면으로 돌아가기' }).click();
    await expect(page.getByRole('button', { name: '5시즌 진행' })).toHaveCount(0);
  });
}

test('prepares a subsequent match while keeping the currently recorded score and playback context', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await page.getByTestId('hub-play').click();
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  const contextUrl = page.url();
  const score = await page.getByTestId('match-score').locator('strong').innerText();
  const date = await page.getByTestId('game-date').innerText();
  await page.getByRole('button', { name: '빠른 관여', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '빠른 관여' })).toContainText('다음 경기부터 적용');
  await page
    .getByRole('dialog', { name: '빠른 관여' })
    .getByRole('button', { name: '전술·선발 준비' })
    .click();
  const preparation = page.getByRole('dialog', { name: '다음 경기 전술과 선발 준비' });
  await preparation.getByRole('tab', { name: '선발 선택' }).click();
  await preparation.getByRole('button', { name: '피로 회복 우선으로 선택' }).click();
  await preparation.getByRole('button', { name: '이 선발로 다음 경기 준비' }).click();
  await expect(preparation.getByRole('status')).toContainText('선발 11명을 저장');
  await preparation.getByRole('button', { name: '준비 마치고 돌아가기' }).click();
  await expect(page).toHaveURL(contextUrl);
  await expect(page.getByTestId('match-score').locator('strong')).toHaveText(score);
  await expect(page.getByTestId('game-date')).toHaveText(date);
  await expect(page.getByRole('button', { name: '재생', exact: true })).toBeVisible();
});
