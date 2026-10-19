import { chooseOption } from './select';
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

test('mobile clock exposes every pace as a touch target and advances at the chosen speed', async ({
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
  const pace = (label: string) =>
    controls.getByRole('button', { name: `${label} 속도 선택`, exact: true });
  const daily = pace('1초에 하루'),
    double = pace('0.5초에 하루'),
    five = pace('0.2초에 하루'),
    ten = pace('0.1초에 하루'),
    toggle = controls.getByRole('button', { name: '자동 진행 시작', exact: true }),
    stop = controls.getByRole('button', { name: '자동 진행 정지', exact: true }),
    level = controls.getByRole('button', { name: '위임·진행 설정', exact: true });
  await settle(page);
  // Play and the intervention level are full touch targets; the paces are smaller chips in a
  // track, each still answering taps across the track's height.
  for (const [control, min] of [
    [toggle, 44],
    [level, 44],
    [daily, 32],
    [double, 32],
    [five, 32],
    [ten, 32],
  ] as const) {
    const rect = await control.boundingBox();
    expect(rect!.width).toBeGreaterThanOrEqual(min);
    expect(rect!.height).toBeGreaterThanOrEqual(min);
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(360);
    expect(rect!.y + rect!.height).toBeLessThan(740);
  }
  const toggleBox = (await toggle.boundingBox())!;
  for (const chip of [daily, double, five, ten]) {
    const rect = (await chip.boundingBox())!;
    expect(rect.height).toBeLessThan(toggleBox.height);
    const edge = await chip.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const x = bounds.x + bounds.width / 2;
      return [bounds.top - 4, bounds.bottom + 4].map((y) =>
        element.contains(document.elementFromPoint(x, y)),
      );
    });
    expect(edge).toEqual([true, true]);
  }
  await expect(daily).toHaveAttribute('aria-pressed', 'true');
  // A pace tap only sets the pace (→WEB-18): the date stays until play.
  await daily.click();
  await page.waitForTimeout(1500);
  await expect(date).toHaveText('1950년 8월 1일');
  // Play starts the clock; stopping after the first tick advances exactly one day.
  await toggle.click();
  await expect(date).toHaveText('1950년 8월 2일');
  await stop.click();
  await expect(date).toHaveText('1950년 8월 2일');
  // x2 is a day every half second: it moves on and stops with the owner, short of the match eve.
  await double.click();
  await expect(double).toHaveAttribute('aria-pressed', 'true');
  await expect(daily).toHaveAttribute('aria-pressed', 'false');
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
  await ten.click();
  await expect(ten).toHaveAttribute('aria-pressed', 'true');
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
    .getByRole('button', { name: '위임·진행 설정', exact: true })
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
  await clock.getByRole('button', { name: '0.1초에 하루 속도 선택', exact: true }).click();
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
    const recruitment = page.getByTestId('decision-owner-recruitment'),
      sale = page.getByTestId('decision-owner-sales');
    await expect(recruitment).not.toHaveAttribute('data-auto', 'true');
    await recruitment.getByRole('button', { name: /위임·진행 설정 열기/ }).click();
    await expect(dialog.getByRole('combobox', { name: '선수 영입', exact: true })).toHaveAttribute(
      'data-value',
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
    await closeSettingsOutcome(page);
    await expect(recruitment).toHaveAttribute('data-auto', 'true');
    await expect(sale).not.toHaveAttribute('data-auto', 'true');
    await recruitment.getByRole('button', { name: /위임·진행 설정 열기/ }).click();
    await chooseOption(dialog.getByRole('combobox', { name: '선수 영입', exact: true }), 'direct');
    await dialog.getByRole('button', { name: '변경 버리기', exact: true }).click();
    await expect(dialog.getByRole('combobox', { name: '선수 영입', exact: true })).toHaveAttribute(
      'data-value',
      'delegated',
    );
    await dialog.getByRole('button', { name: '닫기', exact: true }).click();
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
      'manual',
    );
    await expect(dialog.getByLabel('경기 전날 이벤트', { exact: true })).not.toBeChecked();
    await dialog.getByRole('button', { name: '경기 전날 이벤트 켜기', exact: true }).click();
    await expect(dialog.getByLabel('경기 전날 이벤트', { exact: true })).toBeChecked();
    await dialog.getByRole('button', { name: '적용', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await closeSettingsOutcome(page);
    await page.getByTestId('intervention-trigger').click();
    await expect(dialog.getByRole('combobox', { name: '진행 모드', exact: true })).toHaveAttribute(
      'data-value',
      'manual',
    );
    await dialog.getByLabel('경기 전날 이벤트', { exact: true }).click();
    await expect(dialog.getByLabel('경기 전날 이벤트', { exact: true })).toBeChecked();
    await expect(dialog).toContainText('수동 모드에는 경기 이벤트가 필요해요');
    await dialog.getByRole('button', { name: '닫기', exact: true }).click();
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
