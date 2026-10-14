import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { decode, encode } from '../../apps/web/src/adapters/persistence';
import { createWorld } from '../../packages/engine/src/index';
import type { World } from '../../packages/contracts/src/types';
import { continueSlot } from './slots';

async function found(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill('live-tabs-quiet');
  await page.getByRole('button', { name: '쉬움' }).click();
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('game-date')).toHaveText('1950년 8월 1일');
}

test('keeps league views and nodes across silent progression from home and updates real scorers', async ({
  page,
}) => {
  // New clubs stop on match eves (level 2); this seed brings no offer before day 16.
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
  const double = page.getByRole('button', { name: '0.5초에 하루 속도로 자동 진행', exact: true });
  await double.click();
  await expect(double).toHaveAttribute('aria-pressed', 'true');
  await expect(date).toHaveText('1950년 8월 3일');
  // Looking at the league keeps the run going; the selected statistics view is kept.
  await menu.getByRole('button', { name: '리그', exact: true }).click();
  await expect(mini.getByRole('button', { name: '자동 진행 정지' })).toBeVisible();
  await expect(rankTab).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: '득점왕 추이', exact: true }).click();
  // It stops by itself on the eve of our match, whichever view is open; away from home the
  // event waits as a small pill until it is opened.
  const pill = page.getByTestId('event-pill');
  await expect(pill).toContainText('내일 경기');
  await expect(date).toHaveText('1950년 8월 7일');
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

/** Puts a world in slot 1, to continue from the slot screen. */
async function seed(page: Page, w: World) {
  const raw = await encode(w, 1, 0);
  await page.addInitScript((raw) => {
    if (localStorage.getItem('haeram-soccor:manifest')) return;
    const envelope = JSON.parse(raw);
    localStorage.setItem('haeram-soccor:slot:a', raw);
    localStorage.setItem(
      'haeram-soccor:manifest',
      JSON.stringify({
        slot: 0,
        worldId: envelope.worldId,
        generation: envelope.generation,
        parentGeneration: envelope.parentGeneration,
      }),
    );
  }, raw);
}

async function exportWorld(page: Page): Promise<World> {
  await page.getByRole('button', { name: '전체 메뉴', exact: true }).click();
  const menu = page.getByRole('dialog', { name: '전체 메뉴' });
  const downloading = page.waitForEvent('download');
  await menu.getByRole('button', { name: '기록 내보내기', exact: true }).click();
  const raw = await readFile((await (await downloading).path())!, 'utf8');
  await menu.getByRole('button', { name: '창 닫기', exact: true }).click();
  return (await decode(raw)).world;
}

test("the fatigue remedy opens the assistant's training sheet with 회복 ready, and an order sets it", async ({
  page,
}) => {
  const w = createWorld({
    country: 'ENG',
    name: 'Haeram Athletic',
    color: '#bf7956',
    seed: 'fatigue-remedy',
    level: 'easy' as const,
  });
  for (const player of w.players) player.fatigue = 55;
  // The owner forced 하드 트레이닝; left to his rule the assistant would rest them (→CLUB-13).
  w.trainingOrders = { assistant: { focus: 'hard', rounds: 4, forced: true } };
  await seed(page, w);
  await page.goto('/');
  await continueSlot(page);
  const state = page.getByRole('region', { name: '팀 상태' });
  await state.getByRole('button', { name: /^피로 .* 대처 방법 보기$/ }).click();
  const sheet = page.getByRole('dialog', { name: '피로 관리' });
  await sheet
    .getByRole('listitem')
    .filter({ hasText: '수석코치에게 회복 훈련 제안' })
    .getByRole('button', { name: '열기', exact: true })
    .click();
  // The sheet closes and the assistant's card in 코치진 opens with 회복 first; nothing has changed
  // yet (→WEB-44, STAFF-19).
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/people\?view=coaches$/);
  const training = page.getByRole('dialog', { name: '수석코치 훈련 제안' });
  await expect(training.getByRole('listitem').first()).toContainText('회복 훈련');
  await expect(training.getByTestId('training-call-assistant')).toContainText('하드 트레이닝');
  await training.getByRole('button', { name: /^회복 훈련 강행/ }).click();
  await expect(training).toBeHidden();
  await expect(page.getByTestId('coach-call-assistant')).toContainText('회복 훈련 · 구단주 지시');
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  expect((await exportWorld(page)).trainingOrders?.assistant?.focus).toBe('recovery');
});
