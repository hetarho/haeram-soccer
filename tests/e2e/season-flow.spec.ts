import { test, expect } from '@playwright/test';

test('advances real days at three paces, stops and restores the saved calendar', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('세계 생성 시드').fill('season-flow');
  await page.getByRole('button', { name: '넉넉한 출발' }).click();
  await page.getByRole('button', { name: '클럽 창단' }).click();
  const date = page.getByTestId('game-date');
  await expect(date).toHaveText('1901년 8월 1일');
  await page.getByRole('button', { name: '하루 진행', exact: true }).click();
  await expect(date).toHaveText('1901년 8월 2일');
  await expect(page.getByTestId('calendar')).toContainText('라운드 0');
  await page.getByRole('button', { name: '2단계' }).click();
  await page.getByRole('button', { name: '자동 진행 시작' }).click();
  await expect(date).toHaveText('1901년 8월 5일');
  await page.getByRole('button', { name: '자동 진행 정지' }).click();
  const stopped = await date.textContent();
  await page.waitForTimeout(1200);
  await expect(date).toHaveText(stopped!);
  await page.reload();
  await expect(date).toHaveText(stopped!);
  await expect(page.getByRole('button', { name: '자동 진행 시작' })).toBeVisible();
  await page.getByRole('button', { name: '3단계' }).click();
  await page.getByRole('button', { name: '자동 진행 시작' }).click();
  await expect(page.getByTestId('calendar')).toContainText('라운드 1');
  await page.getByRole('button', { name: '자동 진행 정지' }).click();
  await page.getByRole('button', { name: '리그', exact: true }).click();
  await expect(page.getByRole('table', { name: '리그 순위표' })).toBeVisible();
  await expect(page.getByRole('table', { name: '리그 순위표' })).toContainText('우리 팀');
  await page.getByRole('tab', { name: '순위 추이', exact: true }).click();
  await expect(page.getByRole('heading', { name: '시즌 순위 추이' })).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: '순위 추이', exact: true })).toContainText(
    'Haeram Athletic',
  );
  await page.getByRole('tab', { name: '일정·결과' }).click();
  await expect(page.getByRole('heading', { name: '같은 라운드, 다른 경기' })).toBeVisible();
  await page.getByLabel('리그 라운드 선택').selectOption({ index: 0 });
  await expect(
    page.getByRole('region', { name: '리그 라운드 결과' }).getByRole('listitem'),
  ).toHaveCount(12);
  await expect(
    page.getByRole('region', { name: '리그 라운드 결과' }).getByLabel('경기 예정'),
  ).toHaveCount(0);
  await page.getByRole('tab', { name: '득점 순위', exact: true }).click();
  await expect(page.getByRole('heading', { name: '득점왕 경쟁' })).toBeVisible();
  await expect(page.getByRole('table', { name: '리그 득점 순위표' })).toBeVisible();
  await page.getByRole('tab', { name: '득점왕 추이', exact: true }).click();
  await expect(page.getByRole('heading', { name: '득점왕 추이' })).toBeVisible();
  await expect(page.getByLabel('득점 추이 선수 선택')).toBeVisible();
});

test('shows independent player decisions and post-match league context', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('세계 생성 시드').fill('motion-observation');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await page.getByRole('button', { name: '다음 경기 관전' }).click();
  await expect(page.getByRole('heading', { name: '90분의 작은 드라마.' })).toBeVisible();
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  await expect(page.getByRole('heading', { name: '경기 뒤의 순위표' })).toHaveCount(0);
  await page.getByRole('button', { name: '선수 판단 보기' }).click();
  await expect(page.getByLabel('살펴볼 선수')).toBeVisible();
  await expect(
    page.getByText('점선은 이 선수가 선택한 이동 목표입니다.', { exact: false }),
  ).toBeVisible();
  await page.getByLabel('살펴볼 선수').selectOption('1:4');
  await page.getByRole('button', { name: '결과 보기' }).click();
  await expect(page.getByText(/90′ ·.*경기 종료/)).toBeVisible();
  await expect(page.getByRole('heading', { name: '경기 뒤의 순위표' })).toBeVisible();
  await expect(page.getByRole('table', { name: '리그 순위표' })).toContainText('우리 팀');
  await page.getByRole('button', { name: '다시 보기', exact: true }).click();
  await expect(page.getByText(/90′ ·.*경기 종료/)).toHaveCount(0);
  await page.getByRole('button', { name: '다음 경기 관전', exact: true }).click();
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  await expect(page.getByRole('heading', { name: '경기 뒤의 순위표' })).toHaveCount(0);
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '경기 뒤의 순위표' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
