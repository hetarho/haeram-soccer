import { test, expect } from '@playwright/test';
import { stopOnlyFor } from './events';

async function found(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill('live-tabs-regression');
  await page.getByRole('button', { name: '넉넉한 출발' }).click();
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('game-date')).toHaveText('1901년 8월 1일');
}

test('keeps league views and nodes across silent progression from home and updates real scorers', async ({
  page,
}) => {
  // Only the match eve may stop the clock here, so an incoming offer cannot interrupt it.
  await stopOnlyFor(page, ['match']);
  await found(page);
  const menu = page.getByRole('navigation', { name: '게임 메뉴', exact: true });
  const date = page.getByTestId('game-date');
  await menu.getByRole('button', { name: '리그', exact: true }).click();
  const rankTab = page.getByRole('tab', { name: '순위 추이', exact: true });
  await rankTab.click();
  await page.evaluate(() => {
    const state = window as typeof window & {
      liveProbe?: { panel: Element | null; canvas: Element | null; flashes: number };
    };
    state.liveProbe = {
      // The tab bar belongs to the league page; the statistics panels stay mounted across pages.
      panel: document.getElementById('season-panel-rank'),
      canvas: document.querySelector('canvas'),
      flashes: 0,
    };
    new MutationObserver(() => {
      if (document.querySelector('[aria-label="세계 처리 진행"]')) state.liveProbe!.flashes++;
    }).observe(document.getElementById('root')!, { childList: true, subtree: true });
  });
  // The full clock lives on home; elsewhere it is a buttons-only control.
  await expect(page.getByRole('region', { name: '시즌 진행', exact: true })).toHaveCount(0);
  const mini = page.getByTestId('mini-clock');
  await expect(mini.getByRole('button', { name: '자동 진행 시작' })).toBeVisible();
  await menu.getByRole('button', { name: '클럽 홈', exact: true }).click();
  const threeDays = page.getByRole('button', { name: '1초에 3일 속도로 자동 진행', exact: true });
  await threeDays.click();
  await expect(threeDays).toHaveAttribute('aria-pressed', 'true');
  await expect(date).toHaveText('1901년 8월 4일');
  // Looking at the league keeps the run going; the selected statistics view is kept.
  await menu.getByRole('button', { name: '리그', exact: true }).click();
  await expect(mini.getByRole('button', { name: '자동 진행 정지' })).toBeVisible();
  await expect(rankTab).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: '득점왕 추이', exact: true }).click();
  // It stops by itself on the eve of our match, whichever view is open; away from home the
  // event waits as a small pill until it is opened.
  const pill = page.getByTestId('event-pill');
  await expect(pill).toContainText('내일 경기');
  await expect(date).toHaveText('1901년 8월 7일');
  await pill.click();
  const eve = page.getByTestId('event-card');
  await expect(eve).toContainText('내일 경기');
  await eve.getByRole('button', { name: '결과만 보고 계속', exact: true }).click();
  await expect(page.getByTestId('calendar')).toContainText('라운드 1');
  await mini.getByRole('button', { name: '자동 진행 정지' }).click();
  await expect(page.getByRole('tab', { name: '득점왕 추이', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('tab', { name: '득점 순위', exact: true }).click();
  await expect(page.getByRole('table', { name: '리그 득점 순위표' })).toBeVisible();
  await expect(
    page.getByRole('table', { name: '리그 득점 순위표' }).getByRole('row'),
  ).not.toHaveCount(1);
  const probe = await page.evaluate(() => {
    const { liveProbe } = window as typeof window & {
      liveProbe: { panel: Element | null; canvas: Element | null; flashes: number };
    };
    return {
      samePanel: liveProbe.panel === document.getElementById('season-panel-rank'),
      sameCanvas: liveProbe.canvas === document.querySelector('canvas'),
      flashes: liveProbe.flashes,
    };
  });
  expect(probe).toEqual({ samePanel: true, sameCanvas: true, flashes: 0 });
  await rankTab.click();
  await expect(page.getByRole('heading', { name: '시즌 순위 추이' })).toBeVisible();
});

test('watching a match pauses the calendar and retains playback across page switches', async ({
  page,
}) => {
  // Only the match eve may stop the clock here, so an offer card cannot cover home's controls.
  await stopOnlyFor(page, ['match']);
  await found(page);
  await page.getByRole('button', { name: '다음 경기 관전' }).click();
  await expect(
    page.getByTestId('match-theatre').getByRole('heading', { name: '매치데이' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  const date = page.getByTestId('game-date');
  const matchDay = await date.textContent();
  // The theatre carries the buttons-only clock; the calendar waits while we watch.
  await expect(page.getByRole('region', { name: '시즌 진행', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('mini-clock')).toBeVisible();
  // Home leads back to the unfinished match instead of starting another.
  const theatre = page.getByTestId('match-theatre');
  await theatre.getByRole('button', { name: '홈', exact: true }).click();
  await expect(page.getByTestId('hub-play')).toHaveAccessibleName('경기로 돌아가기');
  await page.getByTestId('hub-play').click();
  await expect(theatre.getByRole('heading', { name: '매치데이' })).toBeVisible();
  await expect(date).toHaveText(matchDay!);
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  await page.waitForTimeout(1500);
  await expect(date).toHaveText(matchDay!);
  await page.getByRole('button', { name: '경기 상세', exact: true }).click();
  const timeline = page.getByRole('slider', { name: '경기 시간', exact: true });
  const before = Number(await timeline.inputValue());
  await page.evaluate(() => {
    (window as typeof window & { liveCanvas?: Element | null }).liveCanvas =
      document.querySelector('canvas');
  });
  const menu = page.getByRole('navigation', { name: '게임 메뉴', exact: true });
  await menu.getByRole('button', { name: '리그', exact: true }).click();
  await expect(page.getByRole('tab', { name: '개요', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  // The match has no menu entry; going back returns to it while its playback lasts.
  await expect(menu.getByRole('button', { name: '경기', exact: true })).toHaveCount(0);
  await page.goBack();
  await expect(timeline).toBeVisible();
  expect(Number(await timeline.inputValue())).toBeGreaterThanOrEqual(before);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { liveCanvas?: Element | null }).liveCanvas ===
        document.querySelector('canvas'),
    ),
  ).toBe(true);
  await expect(date).toHaveText(matchDay!);
  // The theatre's back control leads home, where the full clock is.
  await theatre.getByRole('button', { name: '홈', exact: true }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await expect(page.getByTestId('hub-play')).toHaveAccessibleName('다음 경기 관전');
  await expect(page.getByRole('region', { name: '시즌 진행', exact: true })).toBeVisible();
});
