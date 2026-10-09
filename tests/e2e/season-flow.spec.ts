import { chooseOption } from './select';
import { test, expect } from '@playwright/test';
import { horizontalOverflow } from './layout';
import { stopOnlyFor } from './events';

test('advances real days at three paces, stops and restores the saved calendar', async ({
  page,
}) => {
  // The paces are measured against match eves; offers from other clubs must not stop them.
  await stopOnlyFor(page, ['match']);
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill('season-flow');
  await page.getByRole('button', { name: '넉넉한 출발' }).click();
  await page.getByRole('button', { name: '클럽 창단' }).click();
  const date = page.getByTestId('game-date');
  await expect(date).toHaveText('1901년 8월 1일');
  const pace = (label: string) =>
    page.getByRole('button', { name: `${label} 속도로 자동 진행`, exact: true });
  // The daily pace starts the clock; stopping after the first tick advances exactly one real day.
  await pace('1초에 하루').click();
  await expect(date).toHaveText('1901년 8월 2일');
  await page.getByRole('button', { name: '자동 진행 정지' }).click();
  await expect(date).toHaveText('1901년 8월 2일');
  await expect(page.getByTestId('calendar')).toContainText('라운드 0');
  await pace('1초에 3일').click();
  await expect(pace('1초에 3일')).toHaveAttribute('aria-pressed', 'true');
  await expect(date).toHaveText('1901년 8월 5일');
  await page.getByRole('button', { name: '자동 진행 정지' }).click();
  const stopped = await date.textContent();
  await page.waitForTimeout(1200);
  await expect(date).toHaveText(stopped!);
  await page.reload();
  await expect(date).toHaveText(stopped!);
  await expect(page.getByRole('button', { name: '자동 진행 시작' })).toBeVisible();
  // A five-day step lands on the eve of our first match and the clock stops there.
  await pace('1초에 5일').click();
  const eve = page.getByTestId('event-card');
  await expect(eve).toContainText('내일 경기');
  await expect(date).toHaveText('1901년 8월 7일');
  await expect(page.getByRole('button', { name: '자동 진행 시작' })).toBeVisible();
  await expect(page.getByTestId('calendar')).toContainText('라운드 0');
  // Playing the match through as a result keeps going until the following match eve.
  await eve.getByRole('button', { name: '결과만 보고 계속', exact: true }).click();
  await expect(page.getByTestId('calendar')).toContainText('라운드 1');
  await expect(eve).toContainText('내일 경기');
  await expect(date).not.toHaveText('1901년 8월 7일');
  await expect(page.getByRole('button', { name: '자동 진행 시작' })).toBeVisible();
  await page.getByRole('button', { name: '리그', exact: true }).click();
  await expect(page.getByRole('table', { name: '리그 순위표' })).toBeVisible();
  await expect(page.getByRole('table', { name: '리그 순위표' })).toContainText('우리 팀');
  await page.getByRole('tab', { name: '순위 추이', exact: true }).click();
  await expect(page.getByRole('heading', { name: '시즌 순위 추이' })).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: '순위 추이', exact: true })).toContainText(
    'Haeram Athletic',
  );
  await page.getByRole('tab', { name: '라운드 결과', exact: true }).click();
  await expect(page.getByRole('heading', { name: '같은 라운드, 다른 경기' })).toBeVisible();
  await chooseOption(page.getByRole('combobox', { name: '리그 라운드 선택', exact: true }), {
    index: 0,
  });
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
  await expect(
    page.getByRole('combobox', { name: '득점 추이 선수 선택', exact: true }),
  ).toBeVisible();
});

test('shows independent player decisions and post-match league context', async ({ page }) => {
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill('motion-observation');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await page.getByRole('button', { name: '다음 경기 관전' }).click();
  await expect(
    page.getByTestId('match-theatre').getByRole('heading', { name: '매치데이' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  await expect(page.getByRole('heading', { name: '경기 뒤의 순위표' })).toHaveCount(0);
  await page.getByRole('button', { name: '경기 상세', exact: true }).click();
  await page.getByRole('button', { name: '선수 판단 보기' }).click();
  await expect(page.getByRole('combobox', { name: '살펴볼 선수', exact: true })).toBeVisible();
  await expect(
    page.getByText('점선은 이 선수가 선택한 이동 목표입니다.', { exact: false }),
  ).toBeVisible();
  await chooseOption(page.getByRole('combobox', { name: '살펴볼 선수', exact: true }), '1:4');
  await page.getByRole('button', { name: '결과 보기' }).click();
  await expect(page.getByText(/90′ ·.*경기 종료/)).toBeVisible();
  await expect(page.getByRole('heading', { name: '경기 뒤의 순위표' })).toBeVisible();
  await expect(page.getByRole('table', { name: '리그 순위표' })).toContainText('우리 팀');
  await page.getByRole('button', { name: '다시 보기', exact: true }).click();
  await expect(page.getByText(/90′ ·.*경기 종료/)).toHaveCount(0);
  const beforeNext = await page.getByTestId('game-date').innerText();
  await page.getByRole('button', { name: '다음 경기 관전', exact: true }).click();
  await expect(page.getByTestId('game-date')).not.toHaveText(beforeNext);
  await expect(page.getByTestId('match-next-action')).toBeEnabled();
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  await expect(page.getByRole('heading', { name: '경기 뒤의 순위표' })).toHaveCount(0);
  await page.getByRole('button', { name: '경기 상세', exact: true }).click();
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '경기 뒤의 순위표' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});
