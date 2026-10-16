import { advanceOneRound } from './season-progression';
import { delegateSales } from './events';
import { expect, test } from '@playwright/test';
import { horizontalOverflow, settle } from './layout';
test('serves a real static application entry', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('club-founding')).toBeVisible();
  await expect(page.getByRole('heading', { name: '당신의 클럽, 첫 시즌.' })).toBeVisible();
  await expect(page.getByRole('button', { name: '클럽 창단' })).toBeEnabled();
});
test('creates, computes and reloads through the bundled worker', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByText('Haeram Athletic', { exact: true }).first()).toBeVisible();
  await advanceOneRound(page);
  await expect(page.getByTestId('calendar')).toHaveText(/1950\/51 · 라운드 1$/);
  // A round is lived one day at a time, one revision each (→LEAGUE-11): the page names the
  // revision it reached.
  const shown = /· r(\d+) ·/.exec((await page.getByTestId('save-status').textContent()) ?? '');
  const revision = Number(shown?.[1]);
  expect(revision).toBeGreaterThan(0);
  await expect(page.getByTestId('save-status')).toContainText(`저장 완료 · r${revision} ·`);
  await page.reload();
  await expect(page.getByTestId('calendar')).toHaveText(/1950\/51 · 라운드 1$/);
  await expect(page.getByTestId('calendar')).toBeVisible();
});
test('observes event-backed metrics, historical locks and responsive navigation', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await delegateSales(page);
  await page.getByRole('button', { name: '다음 경기 관전' }).click();
  await expect(
    page.getByTestId('match-theatre').getByRole('heading', { name: '매치데이' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '결과 보기' }).click();
  await expect(page.getByText(/90′ ·.*경기 종료/)).toBeVisible();
  await page.getByRole('button', { name: '경기 상세', exact: true }).click();
  await expect(page.getByText('유효 슈팅', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '컵 대회' }).click();
  await expect(page.getByText(/유러피언컵은 5년 후\(1955\/56\) 창설돼요/)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileMenu = page.getByRole('navigation', { name: '모바일 게임 메뉴' });
  await expect(mobileMenu).toBeVisible();
  // The match view has no tab: it opens only from a watch action. The owner's three levers sit
  // right of home: 사람 (players, market and staff), 훈련 and 방향.
  const tabs = [
    '리그',
    '컵 대회',
    '클럽 기록실',
    '클럽 홈',
    '선수단·스태프',
    '훈련·육성',
    '구단 운영',
  ];
  await expect(mobileMenu.getByRole('button')).toHaveCount(tabs.length);
  expect(
    await mobileMenu
      .getByRole('button')
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label'))),
  ).toEqual(tabs);
  await settle(page);
  for (const label of tabs) {
    const bounds = await mobileMenu.getByRole('button', { name: label, exact: true }).boundingBox();
    expect(bounds, label).not.toBeNull();
    expect(bounds!.width, label).toBeGreaterThanOrEqual(44);
    expect(bounds!.height, label).toBeGreaterThanOrEqual(44);
    expect(bounds!.x, label).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width, label).toBeLessThanOrEqual(390);
    expect(bounds!.y + bounds!.height, label).toBeLessThanOrEqual(844);
  }
  const menuButton = page.getByRole('button', { name: '전체 메뉴', exact: true });
  const menuBounds = await menuButton.boundingBox();
  expect(menuBounds).not.toBeNull();
  expect(menuBounds!.height).toBeGreaterThanOrEqual(44);
  expect(menuBounds!.y).toBeGreaterThanOrEqual(0);
  await menuButton.click();
  const allMenu = page.getByRole('dialog', { name: '전체 메뉴' });
  await expect(allMenu).toBeVisible();
  // Tab destinations live in the tab bar; the menu lists none of them.
  for (const label of ['선수단·스태프', '훈련·육성', '구단 운영'])
    await expect(allMenu.getByRole('button', { name: label, exact: true })).toHaveCount(0);
  await allMenu.getByRole('button', { name: '창 닫기', exact: true }).click();
  await expect(allMenu).toHaveCount(0);
  // The phone tab reads 사람; its page opens on 선수 with the squad count.
  await expect(mobileMenu.getByRole('button', { name: '선수단·스태프', exact: true })).toHaveText(
    '선수단',
  );
  await mobileMenu.getByRole('button', { name: '선수단·스태프', exact: true }).click();
  await expect(page.getByRole('heading', { name: '선수단·스태프', level: 2 })).toBeVisible();
  const peopleTabs = page.getByRole('tablist', { name: '선수단·스태프 보기' }).getByRole('tab');
  await expect(peopleTabs).toHaveText(['선수', '이적시장', '감독', '스태프']);
  await expect(peopleTabs.first()).toHaveAttribute('aria-selected', 'true');
  // A delegated premium sale can change the squad before kickoff; the heading must match
  // the actual cards rather than the founding count.
  const rosterCount = await page.locator('[class*="rosterCards"] article').count();
  expect(rosterCount).toBeGreaterThanOrEqual(14);
  await expect(page.getByText(`선수단 ${rosterCount}/26`, { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/people$/);
  await mobileMenu.getByRole('button', { name: '훈련·육성', exact: true }).click();
  await expect(page.getByRole('heading', { name: '훈련·육성', level: 2 })).toBeVisible();
  await expect(page.getByRole('tablist', { name: '훈련·육성 보기' }).getByRole('tab')).toHaveText([
    '1군 훈련',
    '유소년',
  ]);
  await expect(page).toHaveURL(/\/training$/);
  await mobileMenu.getByRole('button', { name: '리그', exact: true }).click();
  await expect(page.getByRole('tab', { name: '순위표', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('tab', { name: '순위표', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '국가', exact: true })).toBeVisible();
  await expect(
    page.getByRole('table', { name: '리그 순위표' }).getByRole('columnheader'),
  ).toHaveText([
    '순위',
    '클럽',
    'OVR',
    '승점',
    '경기',
    '승',
    '무',
    '패',
    '득',
    '실',
    // Movement and recent form are desktop columns; points stay visible at phone width.
    '득실',
  ]);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});
