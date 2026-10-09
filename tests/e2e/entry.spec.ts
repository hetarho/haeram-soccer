import { expect, test } from '@playwright/test';
import { horizontalOverflow, settle } from './layout';
test('serves a real static application entry', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('club-founding')).toBeVisible();
  await expect(page.getByRole('heading', { name: '작은 클럽의, 큰 내일.' })).toBeVisible();
  await expect(page.getByRole('button', { name: '클럽 창단' })).toBeEnabled();
});
test('creates, computes and reloads through the bundled worker', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByText('Haeram Athletic', { exact: true }).first()).toBeVisible();
  await page
    .getByTestId('club-hub')
    .getByRole('button', { name: '시즌 상세', exact: true })
    .click();
  const journal = page.getByRole('dialog', { name: '시즌 상세와 클럽 소식' });
  await journal.getByRole('button', { name: '한 라운드 진행', exact: true }).click();
  await expect(page.getByTestId('calendar')).toHaveText(/1901\/02 · 라운드 1$/);
  await expect(page.getByTestId('save-status')).toContainText('저장 완료 · r1');
  await journal.getByRole('button', { name: '창 닫기' }).click();
  await page.reload();
  await expect(page.getByTestId('calendar')).toHaveText(/1901\/02 · 라운드 1$/);
  await expect(page.getByTestId('calendar')).toBeVisible();
});
test('observes event-backed metrics, historical locks and responsive navigation', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await page.getByRole('button', { name: '다음 경기 관전' }).click();
  await expect(
    page.getByTestId('match-theatre').getByRole('heading', { name: '매치데이' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '결과 보기' }).click();
  await expect(page.getByText(/90′ ·/)).toBeVisible();
  await page.getByRole('button', { name: '경기 상세', exact: true }).click();
  await expect(page.getByText('유효 슈팅', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '유럽 무대' }).click();
  await expect(page.getByText('54년 후 창설 예정')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileMenu = page.getByRole('navigation', { name: '모바일 게임 메뉴' });
  await expect(mobileMenu).toBeVisible();
  // The match view has no tab: it opens only from a watch action.
  const tabs = ['리그', '유럽 무대', '역사 보관함', '클럽 홈', '선수단', '이적 시장', '구단 운영'];
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
  await allMenu.getByRole('button', { name: '선수단', exact: true }).click();
  await expect(allMenu).toHaveCount(0);
  await expect(page.getByRole('button', { name: '선수단 18/26' })).toBeVisible();
  await mobileMenu.getByRole('button', { name: '리그', exact: true }).click();
  await expect(page.getByRole('tab', { name: '개요', exact: true })).toHaveAttribute(
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
