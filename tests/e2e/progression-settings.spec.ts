import { chooseOption, selectOptions } from './select';
import { createWorld, advanceDays } from '../../packages/engine/src/index';
import { continueSlot } from './slots';
import {
  closeSettingsOutcome,
  importResponsibilityCareer,
  pendingAcquisitionCareer,
} from './responsibility-fixtures';
import { expect, test, type Page } from '@playwright/test';
import { chooseLevel, configureResponsibilities } from './events';
import { horizontalOverflow, settle } from './layout';
import { closeMarketPanel, marketInfo } from './market';

/**
 * Founds a club whose first offers arrive only after its second match eve, so a new club's level 2
 * stops on match eves alone in these tests.
 */
async function foundQuiet(page: Page) {
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill('intervention-levels');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
}

test('mobile clock keeps actions in one row and advances at the dropdown pace', async ({
  page,
}) => {
  // The paces are measured against match eves.
  await page.setViewportSize({ width: 360, height: 740 });
  await foundQuiet(page);
  await configureResponsibilities(page, {
    responsibilities: { recruitment: 'delegated', sales: 'delegated' },
  });
  const date = page.getByTestId('game-date');
  await expect(date).toHaveText('1950년 8월 1일');
  const controls = page.getByRole('region', { name: '시즌 진행', exact: true });
  const pace = controls.getByRole('combobox', { name: '자동 진행 배속', exact: true });
  const toggle = controls.getByRole('button', { name: '자동 진행 시작', exact: true }),
    stop = controls.getByRole('button', { name: '자동 진행 정지', exact: true }),
    settings = controls.getByRole('button', { name: '위임·진행 설정', exact: true }),
    notifications = page.getByTestId('communications-button');
  await settle(page);
  const toggleBox = (await toggle.boundingBox())!;
  for (const control of [toggle, pace, settings]) {
    const rect = (await control.boundingBox())!;
    expect(rect.width).toBeGreaterThanOrEqual(44);
    expect(rect.height).toBeGreaterThanOrEqual(44);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(360);
    expect(rect.y + rect.height).toBeLessThan(740);
    expect(rect.y).toBeCloseTo(toggleBox.y, 0);
    expect(rect.height).toBeCloseTo(toggleBox.height, 0);
  }
  await expect(notifications).toBeVisible();
  expect(await notifications.evaluate((element) => !!element.closest('header'))).toBe(true);
  const dateBox = (await date.boundingBox())!;
  expect(dateBox.x + dateBox.width).toBeLessThanOrEqual(toggleBox.x);
  expect(dateBox.y).toBeLessThan(toggleBox.y + toggleBox.height);
  expect(dateBox.y + dateBox.height).toBeGreaterThan(toggleBox.y);
  await expect(controls.getByRole('combobox', { name: '진행 모드', exact: true })).toHaveCount(0);
  const options = await selectOptions(pace);
  expect(options.map((option) => option.value)).toEqual(['x1', 'x2', 'x5', 'x10']);
  for (const [index, hint] of [
    '1초에 하루',
    '0.5초에 하루',
    '0.2초에 하루',
    '0.1초에 하루',
  ].entries())
    expect(options[index].label).toContain(hint);
  await expect(pace).toHaveAttribute('data-value', 'x1');
  // Selecting a pace only sets the pace (→WEB-18): the date stays until play.
  await chooseOption(pace, 'x1');
  await page.waitForTimeout(1500);
  await expect(date).toHaveText('1950년 8월 1일');
  // Play starts the clock; stopping after the first tick advances exactly one day.
  await toggle.click();
  await expect(date).toHaveText('1950년 8월 2일');
  await stop.click();
  await expect(date).toHaveText('1950년 8월 2일');
  // x2 is a day every half second: it moves on and stops with the owner, short of the match eve.
  await chooseOption(pace, 'x2');
  await expect(pace).toHaveAttribute('data-value', 'x2');
  await expect(date).toHaveText('1950년 8월 2일');
  await toggle.click();
  // A late step carries the day it owes with it (→WEB-18), so a slow runner may skip 8월 3일.
  await expect(date).not.toHaveText('1950년 8월 2일');
  await stop.click();
  // A day step already in flight when the owner stops still lands; read the date once it rests.
  let stepped = await date.innerText();
  await expect
    .poll(async () => {
      const before = stepped;
      await page.waitForTimeout(400);
      stepped = await date.innerText();
      return stepped === before;
    })
    .toBe(true);
  expect(['1950년 8월 3일', '1950년 8월 4일', '1950년 8월 5일']).toContain(stepped);
  await page.waitForTimeout(1200);
  await expect(date).toHaveText(stepped);
  // x10 runs on to the eve of our first match and the clock stops there.
  await chooseOption(pace, 'x10');
  await expect(pace).toHaveAttribute('data-value', 'x10');
  await toggle.click();
  const eve = page.getByTestId('event-card');
  await expect(eve).toContainText('내일 경기');
  await expect(date).toHaveText('1950년 8월 7일');
  await expect(toggle).toBeVisible();
  // The card decides the match only; whether eves stop lives in the intervention dialog (→WEB-71).
  await expect(eve.getByRole('checkbox')).toHaveCount(0);
  const navTop = (await page.getByRole('navigation', { name: '모바일 게임 메뉴' }).boundingBox())!
    .y;
  for (const name of ['관전하기 ▶', '결과만 보고 계속']) {
    const rect = await eve.getByRole('button', { name, exact: true }).boundingBox();
    expect(rect!.height, name).toBeGreaterThanOrEqual(44);
    expect(rect!.x, name).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width, name).toBeLessThanOrEqual(360);
    expect(rect!.y + rect!.height, name).toBeLessThanOrEqual(navTop);
  }
  await eve.getByRole('button', { name: '결과만 보고 계속', exact: true }).click();
  await expect(page.getByTestId('calendar')).toContainText('라운드 1');
  await expect(eve).toContainText('내일 경기');
  await expect(toggle).toBeVisible();
});

test('the central settings dialog pauses, restores focus and persists applied ownership on reload', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await foundQuiet(page);
  await chooseLevel(page, 4);
  const trigger = page.getByTestId('intervention-trigger');
  await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '위임·진행 설정', exact: true });
  await expect(dialog).toBeVisible();
  const date = await page.getByTestId('game-date').innerText();
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('game-date')).toHaveText(date);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  await trigger.click();
  for (const label of [
    '감독 인사',
    '스태프 인사',
    '선수 계약',
    '선수 영입',
    '선수 매각',
    '유소년 승격·방출',
    '스폰서 계약',
  ])
    await expect(dialog.getByRole('combobox', { name: label, exact: true })).toHaveAttribute(
      'data-value',
      'delegated',
    );
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test('a hidden tab plays on like an idle game, names the date in its title, and can pause instead', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  // Level 4 stops only for money, so a slow browser that reaches the first match plays it through.
  await chooseLevel(page, 4);
  const date = page.getByTestId('game-date');
  await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
  await expect(date).toHaveText('1950년 8월 2일');
  // Headless engines keep pages visible; exercise the real browser listener with its hidden input.
  const setHidden = (hidden: boolean) =>
    page.evaluate((hidden) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
  await setHidden(true);
  const hidden = await date.textContent();
  // The clock keeps its pace behind other windows and the tab title tells the date (→WEB-64).
  await expect(date).not.toHaveText(hidden!);
  await expect(page).toHaveTitle(/^▶ 1950년 \d+월 \d+일 · Haeram Athletic$/);
  await setHidden(false);
  await expect(page).toHaveTitle('Haeram — Football Archives');
  await expect(page.getByRole('button', { name: '자동 진행 정지', exact: true })).toBeVisible();

  // The owner may choose the old behaviour: hiding pauses ticks without ending the run.
  await page.getByRole('button', { name: '전체 메뉴', exact: true }).click();
  await page
    .getByRole('dialog', { name: '전체 메뉴' })
    // The menu row's name also carries its hint line.
    .getByRole('button', { name: /^위임·진행 설정/ })
    .click();
  const settings = page.getByRole('dialog', { name: '위임·진행 설정' });
  const background = settings.getByRole('region', { name: '자동 모드의 백그라운드 진행' });
  await expect(
    background.getByRole('combobox', { name: '자리 비운 동안 진행 한도' }),
  ).toHaveAttribute('data-value', 'season');
  await background.getByLabel('다른 탭에서도 계속 진행').uncheck();
  await settings.getByRole('button', { name: '적용', exact: true }).click();
  await closeSettingsOutcome(page);
  await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
  await setHidden(true);
  // A day already being played when the tab hid still lands; after it the clock stays still.
  let paused = '';
  await expect
    .poll(
      async () => {
        const before = await date.textContent();
        await page.waitForTimeout(1200);
        paused = (await date.textContent())!;
        return paused === before;
      },
      { timeout: 15000 },
    )
    .toBe(true);
  await expect(page.getByRole('button', { name: '자동 진행 정지', exact: true })).toBeVisible();
  await setHidden(false);
  await expect(date).not.toHaveText(paused);
  await page.getByRole('button', { name: '자동 진행 정지', exact: true }).click();
  await expect(page.getByRole('button', { name: '자동 진행 시작', exact: true })).toBeVisible();
});

test('a page that closed with the clock running plays the time away on return and sums it up', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await chooseLevel(page, 4);
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  // The owner left the clock running at x1 and came back ten minutes later; the away limit is
  // a month, so 30 of the 600 owed days are played.
  const worldId = await page.evaluate(
    () => JSON.parse(localStorage.getItem('haeram-soccor:manifest')!).worldId as string,
  );
  // Written as the next page starts, after the leaving page stored its own (stopped) clock.
  await page.addInitScript((worldId) => {
    localStorage.setItem(
      'haeram-soccor:background',
      JSON.stringify({ hidden: true, away: 'month' }),
    );
    localStorage.setItem(
      'haeram-soccor:clock',
      JSON.stringify({ [worldId]: { running: true, pace: 'x1', at: Date.now() - 600_000 } }),
    );
  }, worldId);
  await page.reload();
  const summary = page.getByRole('dialog', { name: '자리를 비운 동안' });
  await expect(summary).toBeVisible({ timeout: 30000 });
  await expect(summary).toContainText('1950년 8월 1일 →');
  await expect(summary).toContainText(/\d+경기 · \d+승 \d+무 \d+패|경기 없음/);
  await expect(summary).toContainText('리그 순위');
  await expect(summary).toContainText('계속 진행 중');
  const days = Number((await summary.innerText()).match(/· (\d+)일/)![1]);
  expect(days).toBeGreaterThanOrEqual(30);
  expect(days).toBeLessThan(40);
  await summary.getByRole('button', { name: '확인', exact: true }).click();
  await expect(summary).toHaveCount(0);
  await expect(page.getByRole('button', { name: '자동 진행 정지', exact: true })).toBeVisible();
});

test('deciding the event that stopped a running clock plays on (→WEB-42)', async ({ page }) => {
  await foundQuiet(page);
  // Level 1 stops for every event kind, so the first one the clock meets stops it.
  await chooseLevel(page, 4);
  await page.getByTestId('intervention-trigger').click();
  const settings = page.getByRole('dialog', { name: '위임·진행 설정', exact: true });
  await chooseOption(settings.getByRole('combobox', { name: '선수 매각', exact: true }), 'direct');
  await settings.getByRole('button', { name: '적용', exact: true }).click();
  await closeSettingsOutcome(page);
  const clock = page.getByRole('region', { name: '시즌 진행', exact: true });
  await chooseOption(clock.getByRole('combobox', { name: '자동 진행 배속', exact: true }), 'x10');
  const play = clock.getByRole('button', { name: '자동 진행 시작', exact: true }),
    stop = clock.getByRole('button', { name: '자동 진행 정지', exact: true }),
    card = page.getByTestId('event-card');
  await play.click();
  for (let i = 0; i < 10; i++) {
    await expect(card).toBeVisible({ timeout: 20000 });
    await expect(play).toBeVisible();
    const text = await card.innerText();
    if (text.includes('내일 경기')) {
      await card.getByRole('button', { name: '결과만 보고 계속', exact: true }).click();
      await expect(stop).toBeVisible();
      continue;
    }
    // The last event waiting is decided (확인, or 거절 for an offer): the clock runs again
    // without play.
    const others = Number(/남은 이벤트 (\d+)개/.exec(text)?.[1] ?? 1);
    const read = card.getByRole('button', { name: '확인', exact: true });
    await (
      (await read.count()) ? read : card.getByRole('button', { name: '거절', exact: true })
    ).click();
    if (others > 1) continue;
    await expect(stop).toBeVisible();
    await stop.click();
    return;
  }
  throw new Error('No event other than a match eve stopped the clock');
});

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`central-responsibilities-explicit-apply ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await foundQuiet(page);
    const date = await page.getByTestId('game-date').textContent();
    await page.getByTestId('intervention-trigger').click();
    const dialog = page.getByRole('dialog', { name: '위임·진행 설정', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('combobox', { name: '진행 모드', exact: true })).toBeInViewport();
    const stops = dialog.getByRole('checkbox', {
      name: /^(경기 전날 이벤트|이적시장 개장 이벤트)$/,
    });
    const stopBounds = await stops.evaluateAll((inputs) =>
      inputs.map((input) => {
        const rect = input.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }),
    );
    expect(stopBounds).toHaveLength(2);
    expect(stopBounds[1].y).toBeGreaterThanOrEqual(stopBounds[0].y + stopBounds[0].height);
    expect(stopBounds[0].width).toBeCloseTo(stopBounds[1].width, 0);
    expect(stopBounds[0].x).toBeCloseTo(stopBounds[1].x, 0);
    for (const rect of stopBounds) {
      expect(rect.width).toBeGreaterThanOrEqual(44);
      expect(rect.height).toBeGreaterThanOrEqual(44);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width);
    }
    await stops.first().focus();
    await expect(stops.first()).toBeFocused();
    await expect(dialog.locator('footer button')).toHaveText(['닫기', '적용']);
    await expect(dialog.getByRole('button', { name: '변경 버리기', exact: true })).toHaveCount(0);
    const sections = await dialog.locator('section[aria-label]').evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element);
        return {
          name: element.getAttribute('aria-label'),
          top: element.getBoundingClientRect().top,
          bottom: element.getBoundingClientRect().bottom,
          paddingTop: parseFloat(style.paddingTop),
        };
      }),
    );
    expect(sections.map((section) => section.name)).toEqual([
      '시간 진행 방식',
      '업무 위임',
      '자동 모드의 백그라운드 진행',
    ]);
    for (let i = 1; i < sections.length; i++) {
      expect(sections[i].top - sections[i - 1].bottom).toBeGreaterThanOrEqual(16);
      expect(sections[i].paddingTop).toBeGreaterThanOrEqual(16);
    }
    if (viewport.width === 390) {
      await expect(dialog.getByRole('button', { name: '적용', exact: true })).toBeInViewport();
      await settle(page);
      await page.screenshot({ path: '.tmp/responsibility-settings-390.png' });
    }
    for (const [label, value] of [
      ['감독 인사', 'direct'],
      ['스태프 인사', 'delegated'],
      ['선수 계약', 'direct'],
      ['선수 영입', 'direct'],
      ['선수 매각', 'direct'],
      ['유소년 승격·방출', 'delegated'],
      ['스폰서 계약', 'delegated'],
    ])
      await expect(dialog.getByRole('combobox', { name: label, exact: true })).toHaveAttribute(
        'data-value',
        value,
      );
    await chooseOption(
      dialog.getByRole('combobox', { name: '선수 영입', exact: true }),
      'delegated',
    );
    await dialog.getByRole('button', { name: '닫기', exact: true }).click();
    await page.getByRole('button', { name: '선수단·스태프', exact: true }).click();
    await page.getByRole('tab', { name: '이적시장', exact: true }).click();
    // Who decides recruitment and sales sits in the market's information panel (→WEB-43/45).
    await marketInfo(page);
    const recruitment = page.getByTestId('decision-owner-recruitment'),
      sale = page.getByTestId('decision-owner-sales');
    await expect(recruitment).not.toHaveAttribute('data-auto', 'true');
    await recruitment.getByRole('button', { name: /위임·진행 설정 열기/ }).click();
    await expect(dialog.getByRole('combobox', { name: '선수 영입', exact: true })).toHaveAttribute(
      'data-value',
      'direct',
    );
    await expect(dialog.getByRole('button', { name: '적용', exact: true })).toBeDisabled();
    await chooseOption(
      dialog.getByRole('combobox', { name: '선수 영입', exact: true }),
      'delegated',
    );
    await expect(dialog.getByRole('button', { name: '적용', exact: true })).toBeEnabled();
    await settle(page);
    const bounds = await dialog.evaluate((element) => ({
      width: element.clientWidth,
      scroll: element.scrollWidth,
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
    }));
    expect(bounds.scroll).toBeLessThanOrEqual(bounds.width + 1);
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(viewport.width);
    await dialog.getByRole('button', { name: '적용', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    // The outcome card waits until every sheet has closed, the information panel included.
    await closeMarketPanel(page, '영입 정보');
    await closeSettingsOutcome(page);
    await marketInfo(page);
    await expect(recruitment).toHaveAttribute('data-auto', 'true');
    await expect(sale).not.toHaveAttribute('data-auto', 'true');
    await recruitment.getByRole('button', { name: /위임·진행 설정 열기/ }).click();
    await chooseOption(dialog.getByRole('combobox', { name: '선수 영입', exact: true }), 'direct');
    await dialog.getByRole('button', { name: '닫기', exact: true }).click();
    await recruitment.getByRole('button', { name: /위임·진행 설정 열기/ }).click();
    await expect(dialog.getByRole('combobox', { name: '선수 영입', exact: true })).toHaveAttribute(
      'data-value',
      'delegated',
    );
    await dialog.getByRole('button', { name: '닫기', exact: true }).click();
    await closeMarketPanel(page, '영입 정보');
    await expect(page.getByTestId('game-date')).toHaveText(date!);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });
  test(`manual-settings-invariant ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await foundQuiet(page);
    await page.getByTestId('intervention-trigger').click();
    const dialog = page.getByRole('dialog', { name: '위임·진행 설정', exact: true });
    await dialog.getByLabel('경기 전날 이벤트', { exact: true }).uncheck();
    await chooseOption(dialog.getByRole('combobox', { name: '진행 모드', exact: true }), 'manual');
    await expect(dialog).toContainText('수동 모드에는 경기 이벤트가 필요해요');
    await expect(dialog.getByRole('button', { name: '적용', exact: true })).toBeDisabled();
    await expect(dialog.getByLabel('경기 전날 이벤트', { exact: true })).not.toBeChecked();
    await dialog.getByRole('button', { name: '닫기', exact: true }).click();
    await page.getByTestId('intervention-trigger').click();
    await expect(dialog.getByRole('combobox', { name: '진행 모드', exact: true })).toHaveAttribute(
      'data-value',
      'automatic',
    );
    await expect(dialog.getByLabel('경기 전날 이벤트', { exact: true })).toBeChecked();
    await expect(dialog.getByRole('button', { name: '적용', exact: true })).toBeDisabled();
    await dialog.getByLabel('경기 전날 이벤트', { exact: true }).uncheck();
    await chooseOption(dialog.getByRole('combobox', { name: '진행 모드', exact: true }), 'manual');
    await expect(dialog.getByLabel('경기 전날 이벤트', { exact: true })).not.toBeChecked();
    await dialog.getByRole('button', { name: '경기 전날 이벤트 켜기', exact: true }).click();
    await expect(dialog.getByRole('button', { name: '적용', exact: true })).toBeEnabled();
    await chooseOption(
      dialog.getByRole('combobox', { name: '진행 모드', exact: true }),
      'automatic',
    );
    await expect(dialog.getByLabel('경기 전날 이벤트', { exact: true })).toBeChecked();
    await expect(
      dialog.getByRole('combobox', { name: '스태프 인사', exact: true }),
    ).toHaveAttribute('data-value', 'delegated');
    await chooseOption(dialog.getByRole('combobox', { name: '진행 모드', exact: true }), 'manual');
    await dialog.getByRole('button', { name: '적용', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await closeSettingsOutcome(page);
    await page.getByTestId('intervention-trigger').click();
    await expect(dialog.getByRole('combobox', { name: '진행 모드', exact: true })).toHaveAttribute(
      'data-value',
      'manual',
    );
    await expect(dialog.getByLabel('경기 전날 이벤트', { exact: true })).toBeChecked();
    await expect(dialog.getByRole('region', { name: '업무 위임', exact: true })).toBeVisible();
    await expect(dialog.getByRole('combobox', { name: '선수 영입', exact: true })).toBeEnabled();
    await expect(
      dialog.getByRole('region', { name: '자동 모드의 백그라운드 진행', exact: true }),
    ).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: '적용', exact: true })).toBeDisabled();
    await dialog.getByLabel('경기 전날 이벤트', { exact: true }).click();
    await expect(dialog.getByLabel('경기 전날 이벤트', { exact: true })).toBeChecked();
    await expect(dialog).toContainText('수동 모드에는 경기 이벤트가 필요해요');
    await chooseOption(
      dialog.getByRole('combobox', { name: '진행 모드', exact: true }),
      'automatic',
    );
    await expect(dialog.getByLabel('경기 전날 이벤트', { exact: true })).toBeChecked();
    await expect(
      dialog.getByRole('combobox', { name: '스태프 인사', exact: true }),
    ).toHaveAttribute('data-value', 'delegated');
    await dialog.getByRole('button', { name: '닫기', exact: true }).click();
  });
  test(`settings dismissal discards all unapplied choices ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await foundQuiet(page);
    const dialog = page.getByRole('dialog', { name: '위임·진행 설정', exact: true });
    for (const method of ['footer', 'header', 'escape', 'backdrop']) {
      await page.getByTestId('intervention-trigger').click();
      await dialog.getByLabel('이적시장 개장 이벤트', { exact: true }).check();
      await dialog.getByRole('button', { name: '전체 위임', exact: true }).click();
      await dialog.getByLabel('다른 탭에서도 계속 진행', { exact: true }).uncheck();
      await chooseOption(dialog.getByRole('combobox', { name: '자리 비운 동안 진행 한도' }), 'off');
      await chooseOption(
        dialog.getByRole('combobox', { name: '진행 모드', exact: true }),
        'manual',
      );
      await expect(dialog.getByRole('region', { name: '업무 위임', exact: true })).toBeVisible();
      await expect(
        dialog.getByRole('region', { name: '자동 모드의 백그라운드 진행', exact: true }),
      ).toHaveCount(0);
      await chooseOption(
        dialog.getByRole('combobox', { name: '진행 모드', exact: true }),
        'automatic',
      );
      await expect(dialog.getByLabel('다른 탭에서도 계속 진행', { exact: true })).not.toBeChecked();
      await expect(
        dialog.getByRole('combobox', { name: '자리 비운 동안 진행 한도' }),
      ).toHaveAttribute('data-value', 'off');
      await chooseOption(
        dialog.getByRole('combobox', { name: '진행 모드', exact: true }),
        'manual',
      );
      if (method === 'footer')
        await dialog.getByRole('button', { name: '닫기', exact: true }).click();
      else if (method === 'header') await dialog.getByRole('button', { name: '창 닫기' }).click();
      else if (method === 'escape') await page.keyboard.press('Escape');
      else {
        await settle(page);
        const bounds = (await dialog.boundingBox())!;
        expect(bounds.y).toBeGreaterThan(0);
        await page.mouse.click(viewport.width / 2, bounds.y / 2);
      }
      await expect(dialog).toHaveCount(0);
      await page.getByTestId('intervention-trigger').click();
      await expect(
        dialog.getByRole('combobox', { name: '진행 모드', exact: true }),
      ).toHaveAttribute('data-value', 'automatic');
      await expect(dialog.getByLabel('이적시장 개장 이벤트', { exact: true })).not.toBeChecked();
      await expect(
        dialog.getByRole('combobox', { name: '선수 영입', exact: true }),
      ).toHaveAttribute('data-value', 'direct');
      await expect(dialog.getByLabel('다른 탭에서도 계속 진행', { exact: true })).toBeChecked();
      await expect(
        dialog.getByRole('combobox', { name: '자리 비운 동안 진행 한도' }),
      ).toHaveAttribute('data-value', 'season');
      await expect(dialog.getByRole('button', { name: '적용', exact: true })).toBeDisabled();
      await dialog.getByRole('button', { name: '닫기', exact: true }).click();
    }
  });
  test(`central-responsibilities-explicit-apply pending handover ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await importResponsibilityCareer(page, pendingAcquisitionCareer());
    await page.getByTestId('intervention-trigger').click();
    const dialog = page.getByRole('dialog', { name: '위임·진행 설정', exact: true });
    await chooseOption(
      dialog.getByRole('combobox', { name: '선수 영입', exact: true }),
      'delegated',
    );
    await expect(dialog.getByRole('region', { name: '대기 업무 이관 미리보기' })).toContainText(
      '대기 중인 선수 영입 2건도 위임됩니다.',
    );
    await dialog.getByRole('button', { name: '적용', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await closeSettingsOutcome(page);
    await expect(page.getByTestId('event-card')).toHaveCount(0);
    await page.getByTestId('intervention-trigger').click();
    await expect(dialog.getByRole('combobox', { name: '선수 영입', exact: true })).toHaveAttribute(
      'data-value',
      'delegated',
    );
    await expect(dialog.getByRole('region', { name: '대기 업무 이관 미리보기' })).toHaveCount(0);
  });
}

test('central-responsibilities-explicit-apply readonly viewer', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await foundQuiet(page);
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  const viewer = await context.newPage();
  try {
    await viewer.setViewportSize({ width: 390, height: 844 });
    await viewer.goto('/');
    await continueSlot(viewer);
    await viewer.getByTestId('intervention-trigger').click();
    const dialog = viewer.getByRole('dialog', { name: '위임·진행 설정', exact: true });
    await expect(dialog).toContainText('읽기 전용 상태에서는 설정을 적용할 수 없어요.');
    await expect(dialog.getByRole('status')).toBeInViewport();
    await viewer.screenshot({ path: '.tmp/responsibility-settings-readonly-390.png' });
    await expect(dialog.getByRole('combobox', { name: '선수 영입', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: '적용', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: '닫기', exact: true })).toBeEnabled();
    await dialog.getByRole('button', { name: '닫기', exact: true }).click();
  } finally {
    await viewer.close();
  }
});

test('restored match eve uses actual match actions instead of acknowledging the observation', async ({
  page,
}) => {
  const w = createWorld({
    country: 'ENG',
    name: 'Restored Eve',
    color: '#224466',
    seed: 'restored-eve',
    level: 'easy',
  });
  for (const key of Object.keys(w.settings!.responsibilities) as (keyof NonNullable<
    typeof w.settings
  >['responsibilities'])[])
    w.settings!.responsibilities[key] = 'delegated';
  advanceDays(w, 6, undefined, false);
  await importResponsibilityCareer(page, w);
  const card = page.getByTestId('event-card');
  await expect(card).toContainText('내일 경기');
  await expect(card.getByRole('button', { name: '관전하기 ▶', exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: '확인', exact: true })).toHaveCount(0);
  await card.getByRole('button', { name: '결과만 보고 계속', exact: true }).click();
  await expect(page.getByTestId('calendar')).toContainText('라운드 1');
});
