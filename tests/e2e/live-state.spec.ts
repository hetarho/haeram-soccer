import { openClubhouse, openLeague, resumeLeague, returnToMatch } from './competition-navigation';
import { watchNext } from './watch';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { decode, encode } from '../../apps/web/src/adapters/persistence';
import { createWorld } from '../../packages/engine/src/index';
import type { World } from '../../packages/contracts/src/types';
import { configureResponsibilities, matchReport } from './events';
import { continueSlot } from './slots';
import { chooseOption } from './select';

async function found(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill('live-tabs-quiet');
  await page.getByRole('button', { name: '쉬움' }).click();
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('game-date')).toHaveText('1950년 8월 1일');
}

async function proveLiveLeague(page: Page, observation: 'interleaved' | 'eve-first') {
  // Exercise observation timing without unrelated direct market decisions.
  await found(page);
  await configureResponsibilities(page, {
    responsibilities: { recruitment: 'delegated', sales: 'delegated' },
  });
  const menu = page.getByRole('navigation', { name: '게임 메뉴', exact: true });
  const date = page.getByTestId('game-date');
  await openLeague(page);
  const rankTab = page.getByRole('tab', { name: '팀 기록', exact: true });
  await rankTab.click();
  await page
    .getByRole('group', { name: '팀 기록 보기' })
    .getByRole('button', { name: '순위 추이', exact: true })
    .click();
  await page.evaluate(() => {
    const state = window as typeof window & {
      liveProbe?: { panel: Element | null; canvas: Element | null; flashes: number };
    };
    state.liveProbe = {
      // The tab bar belongs to the league page; the statistics panels stay mounted across pages.
      panel: document.getElementById('season-panel-teams'),
      canvas: document.querySelector('canvas'),
      flashes: 0,
    };
    new MutationObserver(() => {
      if (document.querySelector('[aria-label="세계 처리 진행"]')) state.liveProbe!.flashes++;
    }).observe(document.getElementById('root')!, { childList: true, subtree: true });
  });
  // The bottom transport stays available across management views.
  await expect(page.getByRole('region', { name: '시즌 진행', exact: true })).toBeVisible();
  const mini = page.getByRole('region', { name: '시즌 진행', exact: true });
  await expect(mini.getByRole('button', { name: '자동 진행 시작' })).toBeVisible();
  await menu.getByRole('button', { name: '클럽하우스', exact: true }).click();
  const pace = page.getByRole('combobox', { name: '자동 진행 배속', exact: true });
  await chooseOption(pace, 'x2');
  await expect(pace).toHaveAttribute('data-value', 'x2');
  await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
  // The run has left the founding day. A step that ran late carries the days it owes, so no one
  // day before the match eve is sure to be on screen.
  await expect(date).not.toHaveText('1950년 8월 1일');
  // Looking at the league keeps the run going; the selected statistics view is kept.
  // The clubhouse detour can meet the observation before its second click. Dismiss it through
  // its real control, then reopen the unchanged work in the event order this case exercises.
  const eveDialog = matchReport(page);
  let dismissedEve = false;
  await page.addLocatorHandler(eveDialog, async (dialog) => {
    await dialog.getByRole('button', { name: '창 닫기', exact: true }).click();
    dismissedEve = true;
  });
  try {
    await resumeLeague(page);
  } finally {
    await page.removeLocatorHandler(eveDialog);
  }
  // An observation reached during the detour has legitimately stopped the calendar on its eve.
  // League omits the information row (→WEB-18); the report and its reopen access name their date
  // instead. A navigation-induced stop on any earlier day still fails this check.
  const eveOn = (day: string) =>
    eveDialog.getByRole('heading', { name: `${day} · 경기 준비 보고`, exact: true });
  const reopenOn = (day: string) =>
    page.getByRole('button', { name: `경기 준비 보고 · ${day} · 열기`, exact: true });
  await expect
    .poll(
      async () =>
        (await mini.getByRole('button', { name: '자동 진행 정지' }).isVisible()) ||
        (await eveOn('1950년 8월 7일').isVisible()) ||
        (dismissedEve && (await reopenOn('1950년 8월 7일').isVisible())),
    )
    .toBe(true);
  await expect(rankTab).toHaveAttribute('aria-selected', 'true');
  const playersTab = page.getByRole('tab', { name: '선수 기록', exact: true });
  // Cover both event orders without racing an observed report's background lock.
  if (dismissedEve && observation === 'eve-first') await page.getByTestId('event-pill').click();
  if (observation === 'eve-first') await expect(eveDialog).toBeVisible();
  while (!(await eveDialog.isVisible()))
    try {
      await playersTab.click({ timeout: 1000 });
      break;
    } catch {
      // An arriving match-eve report can take the click before the tab changes.
    }
  const scorerTrend = page
    .getByRole('group', { name: '선수 기록 보기' })
    .getByRole('button', { name: '득점왕 추이', exact: true });
  while (!(await eveDialog.isVisible()))
    try {
      await scorerTrend.click({ timeout: 1000 });
      break;
    } catch {
      // Covered by the eve's backdrop, or not yet actionable: look again.
    }
  if (dismissedEve && observation === 'interleaved') await page.getByTestId('event-pill').click();
  await expect(eveDialog).toBeVisible();
  await expect(eveOn('1950년 8월 7일')).toBeVisible();
  if ((await playersTab.getAttribute('aria-selected')) !== 'true') {
    await eveDialog.getByRole('button', { name: '창 닫기', exact: true }).click();
    await playersTab.click();
    await scorerTrend.click();
    // Browsing a dismissed observation leaves its work and the calendar unchanged.
    await reopenOn('1950년 8월 7일').click();
    await expect(eveOn('1950년 8월 7일')).toBeVisible();
  }
  const eve = page.getByTestId('event-card');
  await expect(eve).toContainText('내일 경기');
  await eve.getByRole('button', { name: '결과만 보고 계속', exact: true }).click();
  // The played-through eve leaves once the run starts its match day. League shows no round
  // (→WEB-18); the clubhouse's season card counts the match at the end.
  await expect(eveOn('1950년 8월 7일')).toHaveCount(0);
  // On a slow browser the run reaches the next match eve before this stop lands (CI WebKit
  // 40245403294): the eve has stopped the clock itself and its backdrop takes the click.
  const stop = mini.getByRole('button', { name: '자동 진행 정지' });
  while (!(await eveDialog.isVisible()))
    try {
      await stop.click({ timeout: 1000 });
      break;
    } catch {
      // Covered by the next eve's backdrop, or not yet actionable: look again.
    }
  if (await eveDialog.isVisible())
    await eveDialog.getByRole('button', { name: '창 닫기', exact: true }).click();
  await expect(page.getByRole('tab', { name: '선수 기록', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('tab', { name: '선수 기록', exact: true }).click();
  await page
    .getByRole('group', { name: '선수 기록 보기' })
    .getByRole('button', { name: '득점 순위', exact: true })
    .click();
  await expect(page.getByRole('table', { name: '리그 득점 순위표' })).toBeVisible();
  await expect(
    page.getByRole('table', { name: '리그 득점 순위표' }).getByRole('row'),
  ).not.toHaveCount(1);
  const probe = await page.evaluate(() => {
    const { liveProbe } = window as typeof window & {
      liveProbe: { panel: Element | null; canvas: Element | null; flashes: number };
    };
    return {
      samePanel: liveProbe.panel === document.getElementById('season-panel-teams'),
      sameCanvas: liveProbe.canvas === document.querySelector('canvas'),
      flashes: liveProbe.flashes,
    };
  });
  expect(probe).toEqual({ samePanel: true, sameCanvas: true, flashes: 0 });
  await rankTab.click();
  await expect(page.getByRole('heading', { name: '시즌 순위 추이' })).toBeVisible();
  // The clubhouse's season card counts the match played through; the stop held before the second.
  await openClubhouse(page);
  await expect(page.getByTestId('game-round')).toHaveText('1');
}

for (const observation of ['interleaved', 'eve-first'] as const)
  test(`keeps league views and nodes across silent progression and updates real scorers (${observation})`, async ({
    page,
  }) => {
    await proveLiveLeague(page, observation);
  });

test('watching a match pauses the calendar and retains playback across page switches', async ({
  page,
}) => {
  await found(page);
  await watchNext(page, { manual: true });
  await expect(
    page.getByTestId('match-theatre').getByRole('heading', { name: '매치데이' }),
  ).toBeVisible();
  const date = page.getByTestId('game-date');
  const matchDay = await date.textContent();
  // The theatre has no season clock; the calendar waits while we watch.
  await expect(page.getByRole('region', { name: '시즌 진행', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('mini-clock')).toHaveCount(0);
  // Browser back leaves the observation in place; next-event repeatedly reopens its report.
  const theatre = page.getByTestId('match-theatre');
  await page.goBack();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  const upcoming = page.getByRole('region', { name: '다음 경기', exact: true });
  await expect(upcoming.getByRole('button', { name: '관전 이어보기' })).toHaveCount(0);
  const report = page.getByRole('dialog', { name: '관전 이어보기', exact: true });
  const round = await page.getByTestId('game-round').innerText();
  await expect(report).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^관전 이어보기/ })).toHaveCount(0);
  for (let reopen = 0; reopen < 2; reopen++) {
    await page.getByRole('button', { name: '다음 이벤트', exact: true }).click();
    await expect(report).toBeVisible();
    await expect(report.getByTestId('resume-match-card')).toContainText('MATCH · 관전 중');
    await expect(page.getByTestId('game-date')).toHaveText(matchDay!);
    await expect(page.getByTestId('game-round')).toHaveText(round);
    await report.getByRole('button', { name: '창 닫기', exact: true }).click();
    await expect(report).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^관전 이어보기/ })).toHaveCount(0);
  }
  await page.getByRole('button', { name: '다음 이벤트', exact: true }).click();
  await report.getByRole('button', { name: '관전 이어보기', exact: true }).click();
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
  await openLeague(page);
  await expect(page.getByRole('tab', { name: '순위표', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  // The match has no menu entry; retrace the league entry through the clubhouse.
  await expect(menu.getByRole('button', { name: '경기', exact: true })).toHaveCount(0);
  await returnToMatch(page);
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
  await expect(page.getByTestId('home-watch')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '전술·선발 준비', exact: true })).toBeVisible();
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
  await page.getByRole('button', { name: '설정', exact: true }).click();
  const menu = page.getByRole('dialog', { name: '설정' });
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
  const rest = sheet.getByRole('listitem').filter({ hasText: '휴식일 부여 요청' });
  await expect(rest).toContainText('분위기 −2');
  await expect(rest).toContainText('전원 피로 −6');
  await expect(rest).toContainText('즉시 반영 · 재요청 4라운드 후');
  await sheet
    .getByRole('listitem')
    .filter({ hasText: '수석코치에게 회복 훈련 제안' })
    .getByRole('button', { name: '열기', exact: true })
    .click();
  // The sheet closes and 훈련 opens the assistant's sheet with 회복 first; nothing has changed yet
  // (→WEB-44, STAFF-19).
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/training$/);
  const training = page.getByRole('dialog', { name: '수석코치 훈련 제안' });
  await expect(training.getByRole('listitem').first()).toContainText('회복 훈련');
  await expect(training.getByTestId('training-call-assistant')).toContainText('하드 트레이닝');
  await training.getByRole('button', { name: /^회복 훈련 강행/ }).click();
  await expect(training).toBeHidden();
  await expect(page.getByTestId('training-focus')).toContainText('지금 회복 · 구단주 지시');
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  expect((await exportWorld(page)).trainingOrders?.assistant?.focus).toBe('recovery');
});
