import { openPersonnel } from './personnel-navigation';
import { openCups, openLeague } from './competition-navigation';
import { closeMatchDetails, openMatchDetails, watchNext } from './watch';
import { advanceOneRound } from './season-progression';
import { delegateSales } from './events';
import { chooseOption } from './select';
import { expect, test } from '@playwright/test';
import { horizontalOverflow, settle } from './layout';
import { clubSections } from './office';
import { startCareer, startFlow } from './start';
test('serves a real static application entry', async ({ page }) => {
  await page.goto('/');
  await expect(startFlow(page)).toBeVisible();
  await expect(page.getByRole('heading', { name: '어떤 구단주인가요?' })).toBeVisible();
  await expect(startFlow(page).getByRole('button', { name: '다음 →', exact: true })).toBeEnabled();
});
test('creates, computes and reloads through the bundled worker', async ({ page }) => {
  await page.goto('/');
  const club = await startCareer(page);
  await expect(page.getByText(club, { exact: true }).first()).toBeVisible();
  await advanceOneRound(page);
  await expect(page.getByTestId('calendar')).toHaveAttribute('data-season', '1930');
  await expect(page.getByTestId('game-round')).toHaveText('1');
  // A round is lived one day at a time, one revision each (→LEAGUE-11): the page names the
  // revision it reached.
  const shown = /· r(\d+) ·/.exec((await page.getByTestId('save-status').textContent()) ?? '');
  const revision = Number(shown?.[1]);
  expect(revision).toBeGreaterThan(0);
  await expect(page.getByTestId('save-status')).toContainText(`저장 완료 · r${revision} ·`);
  await page.reload();
  await expect(page.getByTestId('calendar')).toHaveAttribute('data-season', '1930');
  await expect(page.getByTestId('game-round')).toHaveText('1');
  await expect(page.getByTestId('calendar')).toBeVisible();
});
test('observes event-backed metrics, historical locks and responsive navigation', async ({
  page,
}) => {
  await page.goto('/');
  await startCareer(page);
  await delegateSales(page);
  await watchNext(page, { manual: true });
  await expect(
    page.getByTestId('match-theatre').getByRole('heading', { name: '매치데이' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '결과 보기' }).click();
  await expect(page.getByText(/90(\+\d+)?′ ·.*경기 종료/)).toBeVisible();
  const details = await openMatchDetails(page);
  await expect(details.getByText('유효 슈팅', { exact: true })).toBeVisible();
  await closeMatchDetails(page);
  await openCups(page);
  await chooseOption(page.getByRole('combobox', { name: '컵 대회', exact: true }), 'ucl');
  await expect(page.getByText('1955/56 시즌에 창설돼요.', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileMenu = page.getByRole('navigation', { name: '모바일 게임 메뉴' });
  await expect(mobileMenu).toBeVisible();
  // Six entries; 팀 sits immediately before the market (→WEB-10), all six in view at once.
  const tabs = ['리그', '컵', '클럽하우스', '팀', '이적시장', '기록'];
  await expect(mobileMenu.getByRole('button')).toHaveCount(tabs.length);
  expect(
    await mobileMenu.evaluate((bar) => bar.scrollWidth - bar.clientWidth),
    'the bottom bar scrolls no entry out of view',
  ).toBeLessThanOrEqual(0);
  expect(
    await mobileMenu
      .getByRole('button')
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label'))),
  ).toEqual(tabs);
  await settle(page);
  for (const label of tabs) {
    await mobileMenu.getByRole('button', { name: label, exact: true }).scrollIntoViewIfNeeded();
    const bounds = await mobileMenu.getByRole('button', { name: label, exact: true }).boundingBox();
    expect(bounds, label).not.toBeNull();
    expect(bounds!.width, label).toBeGreaterThanOrEqual(44);
    expect(bounds!.height, label).toBeGreaterThanOrEqual(44);
    expect(bounds!.x, label).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width, label).toBeLessThanOrEqual(390);
    expect(bounds!.y + bounds!.height, label).toBeLessThanOrEqual(844);
  }
  const menuButton = page.getByRole('button', { name: '설정', exact: true });
  const menuBounds = await menuButton.boundingBox();
  expect(menuBounds).not.toBeNull();
  expect(menuBounds!.height).toBeGreaterThanOrEqual(44);
  expect(menuBounds!.y).toBeGreaterThanOrEqual(0);
  await menuButton.click();
  const allMenu = page.getByRole('dialog', { name: '설정' });
  await expect(allMenu).toBeVisible();
  // Tab destinations live in the tab bar and the office behind home; the menu lists none of them.
  for (const label of ['선수단·스태프', '훈련·육성', '구단 운영', '구단주 사무실'])
    await expect(allMenu.getByRole('button', { name: label, exact: true })).toHaveCount(0);
  await allMenu.getByRole('button', { name: '창 닫기', exact: true }).click();
  await expect(allMenu).toHaveCount(0);
  // First-team work opens on the roster with its real squad count, under no local tabs.
  await openPersonnel(page, 'players');
  await expect(mobileMenu.getByRole('button', { name: '팀', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(clubSections(page)).toHaveCount(0);
  await expect(page.getByRole('tablist', { name: '감독 사무실', exact: true })).toHaveCount(0);
  // A delegated premium sale can change the squad before kickoff; the heading must match
  // the actual cards rather than the founding count.
  const rosterCount = await page.locator('[class*="rosterCards"] article').count();
  expect(rosterCount).toBeGreaterThanOrEqual(14);
  await expect(page.getByText(`선수단 ${rosterCount}/40`, { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/first-team\?view=players$/);
  await openPersonnel(page, 'training');
  await expect(page.getByTestId('training-focus')).toBeVisible();
  await expect(page).toHaveURL(/\/training$/);
  await openLeague(page);
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
