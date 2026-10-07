import { test, expect } from '@playwright/test';

async function found(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill('live-tabs-regression');
  await page.getByRole('button', { name: '넉넉한 출발' }).click();
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('game-date')).toHaveText('1901년 8월 1일');
}

test('runs silently across statistics tabs, keeps nodes and selected views, and updates real scorers', async ({
  page,
}) => {
  await found(page);
  await page.getByRole('button', { name: '리그', exact: true }).click();
  await page.getByRole('tab', { name: '순위 추이', exact: true }).click();
  await page.evaluate(() => {
    const state = window as typeof window & {
      liveProbe?: { tab: Element | null; canvas: Element | null; flashes: number };
    };
    state.liveProbe = {
      tab: document.getElementById('season-tab-rank'),
      canvas: document.querySelector('canvas'),
      flashes: 0,
    };
    new MutationObserver(() => {
      if (document.querySelector('[aria-label="세계 처리 진행"]')) state.liveProbe!.flashes++;
    }).observe(document.getElementById('root')!, { childList: true, subtree: true });
  });
  await page.getByRole('button', { name: '2단계' }).click();
  await page.getByRole('button', { name: '자동 진행 시작' }).click();
  await expect(page.getByTestId('game-date')).toHaveText('1901년 8월 4일');
  await page.getByRole('tab', { name: '득점왕 추이', exact: true }).click();
  await expect(page.getByTestId('calendar')).toContainText('라운드 1');
  await page.getByRole('button', { name: '자동 진행 정지' }).click();
  await page.getByRole('tab', { name: '득점 순위', exact: true }).click();
  await expect(page.getByRole('table', { name: '리그 득점 순위표' })).toBeVisible();
  await expect(
    page.getByRole('table', { name: '리그 득점 순위표' }).getByRole('row'),
  ).not.toHaveCount(1);
  const probe = await page.evaluate(() => {
    const { liveProbe } = window as typeof window & {
      liveProbe: { tab: Element | null; canvas: Element | null; flashes: number };
    };
    return {
      sameTab: liveProbe.tab === document.getElementById('season-tab-rank'),
      sameCanvas: liveProbe.canvas === document.querySelector('canvas'),
      flashes: liveProbe.flashes,
    };
  });
  expect(probe).toEqual({ sameTab: true, sameCanvas: true, flashes: 0 });
  await page.getByRole('tab', { name: '순위 추이', exact: true }).click();
  await expect(page.getByRole('heading', { name: '시즌 순위 추이' })).toBeVisible();
});

test('observes a whole match before immediately chaining the next, and retains playback across tabs', async ({
  page,
}) => {
  await found(page);
  await page.getByRole('button', { name: '다음 경기 관전' }).click();
  await expect(page.getByRole('heading', { name: '90분의 작은 드라마.' })).toBeVisible();
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  const date = page.getByTestId('game-date');
  const first = await date.textContent();
  await page.getByRole('button', { name: '자동 진행 시작' }).click();
  await page.waitForTimeout(2200);
  await expect(date).toHaveText(first!);
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  await expect(date).not.toHaveText(first!);
  const second = await date.textContent();
  await page.waitForTimeout(1500);
  await expect(date).toHaveText(second!);
  await expect(page.getByRole('button', { name: '자동 진행 정지' })).toBeVisible();
  await page.getByRole('button', { name: '자동 진행 정지' }).click();
  await page.getByRole('button', { name: '경기 상세', exact: true }).click();
  const timeline = page.getByRole('slider', { name: '경기 시간', exact: true });
  const before = Number(await timeline.inputValue());
  await page.evaluate(() => {
    (window as typeof window & { liveCanvas?: Element | null }).liveCanvas =
      document.querySelector('canvas');
  });
  await page.getByRole('tab', { name: '순위표', exact: true }).click();
  await page.getByRole('tab', { name: '경기', exact: true }).click();
  await expect(timeline).toBeVisible();
  expect(Number(await timeline.inputValue())).toBeGreaterThanOrEqual(before);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { liveCanvas?: Element | null }).liveCanvas ===
        document.querySelector('canvas'),
    ),
  ).toBe(true);
  await expect(
    page.getByText('관전 모드 · 현재 경기 종료 후 다음 경기를 바로 시작합니다'),
  ).toBeVisible();
});
