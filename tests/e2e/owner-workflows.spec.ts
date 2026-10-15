import { expect, test, type Page } from '@playwright/test';
import { settle } from './layout';

async function found(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill('owner-workflow-regression');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
}
const nav = (page: Page) => page.getByRole('navigation', { name: '모바일 게임 메뉴' });
async function openOperations(page: Page) {
  await nav(page).getByRole('button', { name: '구단 방향', exact: true }).click();
  await expect(page.getByTestId('strategy-board')).toBeVisible();
}

test('keeps selected candidates and returns from the exact recruitment policy', async ({
  page,
}) => {
  await found(page);
  await nav(page).getByRole('button', { name: '선수·스태프', exact: true }).click();
  await page.getByRole('tab', { name: '이적시장', exact: true }).click();
  const desk = page.getByRole('region', { name: '선수 영입 데스크' });
  const roles = desk.getByRole('group', { name: '영입 포지션 선택' });
  await roles.getByRole('button', { name: 'GK', exact: true }).click();
  for (const card of await desk.getByRole('article').all())
    await card.getByRole('button', { name: '비교', exact: true }).click();
  await expect(desk.getByRole('button', { name: '선택한 2명 비교' })).toBeEnabled();
  await desk.getByRole('button', { name: /^영입 기조/ }).click();
  const scouting = page.getByRole('region', { name: '영입', exact: true });
  await expect(scouting.getByRole('radiogroup', { name: '영입 기조' })).toBeVisible();
  const back = page.getByRole('button', { name: '← 돌아가기 · 이적시장', exact: true });
  await expect(back).toBeInViewport();
  await back.click();
  await expect(page.getByRole('tab', { name: '이적시장', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(roles.getByRole('button', { name: 'GK', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(desk.getByRole('button', { name: '선택한 2명 비교' })).toBeEnabled();
  await page.goBack();
  await expect(page.getByTestId('strategy-board')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('tab', { name: '이적시장', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('retains an unapplied academy investment through a detour and discards it explicitly', async ({
  page,
}) => {
  await found(page);
  await nav(page).getByRole('button', { name: '훈련·육성', exact: true }).click();
  await page.getByRole('tab', { name: '유소년', exact: true }).click();
  await page.getByRole('button', { name: /^유소년 투자 · 유입 방식/ }).click();
  const youth = page.getByRole('region', { name: '유소년', exact: true });
  await youth.getByRole('radio', { name: '유소년 투자 육성 강화', exact: true }).click();
  const draft = page.getByTestId('strategy-draft');
  await expect(draft).toContainText('유소년 투자 기본 운영 → 육성 강화');
  await page.getByRole('button', { name: '← 돌아가기 · 유소년', exact: true }).click();
  await expect(page.getByRole('tab', { name: '유소년', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await openOperations(page);
  await expect(draft).toContainText('유소년 투자 기본 운영 → 육성 강화');
  await expect(
    youth.getByRole('radio', { name: '유소년 투자 기본 운영', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await draft.getByRole('button', { name: '되돌리기', exact: true }).click();
  await expect(draft).toHaveCount(0);
  await nav(page).getByRole('button', { name: '훈련·육성', exact: true }).click();
  await openOperations(page);
  await expect(draft).toHaveCount(0);
});

test('a different game never inherits the first career policy draft', async ({ page }) => {
  await found(page);
  await openOperations(page);
  const youth = page.getByRole('region', { name: '유소년', exact: true });
  await youth.getByRole('button', { name: /아카데미 아이들을/ }).click();
  await youth.getByRole('radio', { name: '유소년 투자 육성 강화', exact: true }).click();
  await expect(page.getByTestId('strategy-draft')).toBeVisible();
  await page.getByRole('button', { name: '전체 메뉴', exact: true }).click();
  await page
    .getByRole('dialog', { name: '전체 메뉴' })
    .getByRole('button', { name: '게임 슬롯', exact: true })
    .click();
  await page
    .getByTestId('game-slots')
    .getByRole('listitem', { name: '슬롯 2 · 빈 슬롯' })
    .getByRole('button', { name: '새 게임' })
    .click();
  await page.getByLabel('클럽 이름').fill('Second Workflow Club');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toContainText('Second Workflow Club', {
    timeout: 30000,
  });
  await openOperations(page);
  await settle(page);
  await expect(page.getByTestId('strategy-draft')).toHaveCount(0);
  await expect(page.getByTestId('area-summary-youth')).toContainText('기본 운영');
  await expect(page.getByRole('button', { name: /^← 돌아가기/ })).toHaveCount(0);
});
