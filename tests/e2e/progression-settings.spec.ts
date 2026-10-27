import { chooseOption, selectOptions } from './select';
import { createWorld, advanceDays } from '../../packages/engine/src/index';
import { importResponsibilityCareer, pendingAcquisitionCareer } from './responsibility-fixtures';
import { expect, test, type Page } from '@playwright/test';
import { chooseLevel, configureResponsibilities, dismissSettingsToast, openOffice } from './events';
import { horizontalOverflow, settle } from './layout';
import { leaveOffice } from './office';
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
    notifications = page.getByTestId('communications-button');
  await settle(page);
  const toggleBox = (await toggle.boundingBox())!;
  for (const control of [toggle, pace]) {
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
  expect(dateBox.y + dateBox.height).toBeLessThan(toggleBox.y);
  await expect(page.getByTestId('intervention-trigger')).toHaveCount(0);
  expect(toggleBox.y + toggleBox.height).toBeLessThanOrEqual(
    (await page.getByRole('navigation', { name: '모바일 게임 메뉴' }).boundingBox())!.y,
  );
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
  // Play starts the clock. The owner's stop first shows the days computed ahead at the pace, at
  // most three at x1, and management stays locked until they are shown (→WEB-18/97).
  await toggle.click();
  await expect(page.getByRole('button', { name: /진행 방식 변경/ })).toBeDisabled();
  await expect(date).toHaveText('1950년 8월 2일');
  await stop.click();
  await expect(page.getByRole('button', { name: /진행 방식 변경/ })).toBeEnabled();
  const stopped = await date.innerText();
  expect(['1950년 8월 2일', '1950년 8월 3일', '1950년 8월 4일', '1950년 8월 5일']).toContain(
    stopped,
  );
  await page.waitForTimeout(1200);
  await expect(date).toHaveText(stopped);
  // x10 runs on to the eve of our first match, computing nothing past it, and the clock stops
  // there; choosing the pace alone leaves the date.
  await chooseOption(pace, 'x10');
  await expect(pace).toHaveAttribute('data-value', 'x10');
  await expect(date).toHaveText(stopped);
  await toggle.click();
  const eve = page.getByTestId('event-card');
  await expect(eve).toContainText('내일 경기');
  await expect(date).toHaveText('1950년 8월 7일');
  await expect(toggle).toBeVisible();
  // The card decides the match only; whether eves stop lives in the intervention dialog (→WEB-71).
  await expect(eve.getByRole('checkbox')).toHaveCount(0);
  const eveDialog = page.getByRole('dialog', { name: 'NEXT MATCH', exact: true });
  await expect(eveDialog).toBeVisible();
  await eveDialog.getByRole('button', { name: '창 닫기', exact: true }).click();
  await expect(eve).toHaveCount(0);
  await page.getByTestId('event-pill').click();
  await expect(eveDialog).toBeVisible();
  for (const name of ['관전하기 ▶', '결과만 보고 계속']) {
    const action = eve.getByRole('button', { name, exact: true });
    await action.scrollIntoViewIfNeeded();
    const rect = await action.boundingBox();
    expect(rect!.height, name).toBeGreaterThanOrEqual(44);
    expect(rect!.x, name).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width, name).toBeLessThanOrEqual(360);
    expect(rect!.y + rect!.height, name).toBeLessThanOrEqual(740);
  }
  await eve.getByRole('button', { name: '결과만 보고 계속', exact: true }).click();
  await expect(page.getByTestId('game-round')).toHaveText('1');
  await expect(eve).toContainText('내일 경기');
  await expect(toggle).toBeVisible();
});

for (const [width, height] of [
  [360, 740],
  [390, 844],
  [1280, 800],
]) {
  test(`an own match day at x10 passes at the pace without a hold or animation and without moving the controls ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await foundQuiet(page);
    // Without the match-eve stop, x10 runs straight into our first match day (→WEB-18).
    await configureResponsibilities(page, {
      responsibilities: { recruitment: 'delegated', sales: 'delegated' },
      observations: { matchEve: false },
    });
    const controls = page.getByRole('region', { name: '시즌 진행', exact: true });
    await chooseOption(
      controls.getByRole('combobox', { name: '자동 진행 배속', exact: true }),
      'x10',
    );
    await settle(page);
    // Play/pause, the pace dropdown, the mode change button, its text and the card never move.
    const pinned = [
      '[data-progress-mode]',
      '[data-testid="progression-mode"]',
      '[aria-label="자동 진행 배속"]',
      '[data-ui="season-transport"] [role="group"] > button',
      '[data-home-part="fixture"]',
    ];
    const boxes = () =>
      page.evaluate(
        (selectors) =>
          selectors.map((selector) => {
            const r = document.querySelector(selector)!.getBoundingClientRect();
            return [r.x, r.y, r.width, r.height].map(Math.round);
          }),
        pinned,
      );
    const before = await boxes();
    const transport = (await controls.boundingBox())!;
    await controls.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
    // Catch the frame our first match day is shown, then the frame the day after it is.
    const seen = await page.waitForFunction(
      (selectors) => {
        if (document.querySelector('[data-testid="game-round"]')?.textContent !== '1')
          return undefined;
        return {
          at: performance.now(),
          date: document.querySelector('[data-testid="game-date"]')?.textContent,
          boxes: selectors.map((selector) => {
            const r = document.querySelector(selector)!.getBoundingClientRect();
            return [r.x, r.y, r.width, r.height].map(Math.round);
          }),
          transport: document.querySelector('[data-ui="season-transport"]')!.getBoundingClientRect()
            .height,
        };
      },
      pinned,
      { polling: 'raf', timeout: 20_000 },
    );
    const matchDay = (await seen.jsonValue())!;
    expect(matchDay.boxes).toEqual(before);
    expect(Math.round(matchDay.transport)).toBe(Math.round(transport.height));
    const next = await page.waitForFunction(
      (date) =>
        document.querySelector('[data-testid="game-date"]')?.textContent !== date
          ? performance.now()
          : 0,
      matchDay.date,
      { polling: 'raf', timeout: 20_000 },
    );
    // No ≥ 2 s hold: the next day follows within the pace and a step's own time, not a moment.
    expect((await next.jsonValue()) - matchDay.at).toBeLessThan(1500);
    await controls.getByRole('button', { name: '자동 진행 정지', exact: true }).click();
    expect(await boxes()).toEqual(before);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
}

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
  await page.getByRole('button', { name: '자동 진행 정지', exact: true }).click();
  const settings = await openOffice(page);
  const background = settings.getByRole('region', { name: '자동 모드의 백그라운드 진행' });
  await expect(
    background.getByRole('combobox', { name: '자리 비운 동안 진행 한도' }),
  ).toHaveAttribute('data-value', 'season');
  await background.getByLabel('부재 중에도 업무 계속').uncheck();
  await leaveOffice(page);
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
    const clocks = JSON.parse(localStorage.getItem('haeram-soccor:clock') || '{}');
    clocks[worldId] = {
      ...clocks[worldId],
      running: true,
      pace: 'x1',
      at: Date.now() - 600_000,
    };
    localStorage.setItem('haeram-soccor:clock', JSON.stringify(clocks));
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
  await configureResponsibilities(page, { responsibilities: { sales: 'direct' } });
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
  await expect(page.getByTestId('game-round')).toHaveText('1');
});

for (const themeId of ['standard', 'pixel']) {
  test(`${themeId} mode shortcut confirms, cancels and remembers both directions without advancing`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.addInitScript(
      (themeId) =>
        localStorage.setItem(
          'haeram-soccor:presentation',
          JSON.stringify({ themeId, localeId: 'ko-KR' }),
        ),
      themeId,
    );
    await foundQuiet(page);
    const date = page.getByTestId('game-date');
    const before = await date.innerText();
    const shortcut = page.getByRole('button', { name: /진행 방식 변경/ });
    const modeLabel = page.getByTestId('progression-mode');
    const modeGeometry = async () => ({
      button: await shortcut.boundingBox(),
      label: await modeLabel.boundingBox(),
    });
    const beforeMode = await modeGeometry();
    expect(beforeMode.label!.x).toBeGreaterThanOrEqual(
      beforeMode.button!.x + beforeMode.button!.width,
    );
    await expect(shortcut).toHaveAttribute('data-ui', 'primary');
    const dialog = page.getByRole('dialog', { name: '게임 진행 방식이 변경됩니다.', exact: true });
    await shortcut.click();
    await expect(dialog).toContainText('수동 모드로 바꾸면 경기 전날 보고를 켭니다');
    await dialog.getByRole('checkbox', { name: '다시 보지 않기' }).check();
    await dialog.getByRole('button', { name: '취소', exact: true }).click();
    await expect(page.getByTestId('progression-mode')).toHaveText('AUTO');
    await shortcut.click();
    await expect(dialog.getByRole('checkbox')).not.toBeChecked();
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: '수동 모드로 변경', exact: true }).click();
    await expect(page.getByTestId('progression-mode')).toHaveText('MANUAL');
    const afterMode = await modeGeometry();
    expect(afterMode.button!.x).toBe(beforeMode.button!.x);
    expect(afterMode.button!.width).toBe(beforeMode.button!.width);
    expect(afterMode.label!.width).toBe(beforeMode.label!.width);
    await expect(date).toHaveText(before);
    await expect(page.getByRole('button', { name: '다음 이벤트', exact: true })).toBeVisible();
    const outcome = page.getByTestId('action-outcome');
    await expect(outcome).toBeVisible();
    await outcome.getByRole('button', { name: /^(확인|알림 닫기)$/ }).click();
    await shortcut.click();
    await expect(page.getByTestId('progression-mode')).toHaveText('AUTO');
    await expect(dialog).toHaveCount(0);
    await expect(date).toHaveText(before);
    await expect(page.getByRole('button', { name: '자동 진행 시작', exact: true })).toBeVisible();
    await expect(page.getByTestId('save-status')).toContainText('저장 완료');
    await page.reload();
    await shortcut.click();
    await expect(page.getByTestId('progression-mode')).toHaveText('MANUAL');
    await expect(dialog).toHaveCount(0);
    await expect(date).toHaveText(before);
  });
}

for (const width of [390, 1280]) {
  test(`office bulk report choices include observations and preserve mode ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const w = createWorld({
      name: '보고 통일',
      country: 'ENG',
      color: '#224466',
      seed: 'office-bulk',
      level: 'easy',
    });
    for (const key of Object.keys(w.settings!.responsibilities) as (keyof NonNullable<
      typeof w.settings
    >['responsibilities'])[])
      w.settings!.responsibilities[key] = 'delegated';
    w.settings!.mode = 'manual';
    w.settings!.observations = { matchEve: true, windowOpen: true };
    await importResponsibilityCareer(page, w);
    // The office hides the calendar, so its date is read before entering (→WEB-39).
    const date = await page.getByTestId('game-date').innerText();
    const office = await openOffice(page);
    const bulk = office.getByRole('group', { name: '전체 보고·위임 설정', exact: true });
    const rows = office.getByRole('region', { name: '보고·위임 설정', exact: true });
    const allDelegated = bulk.getByRole('button', { name: '전체 위임', exact: true });
    const report = rows.getByRole('group', { name: '경기 전날 보고', exact: true });
    const delegatedDialog = page.getByRole('dialog', { name: '위임하겠습니다.', exact: true });
    // Business already matches: the confirmation must still include both changed reports.
    await allDelegated.click();
    await expect(delegatedDialog).toContainText('경기 전날 보고');
    await expect(delegatedDialog).toContainText('이적시장 개장 보고');
    await expect(delegatedDialog).toContainText('스태프가 경기를 치르고');
    await delegatedDialog.getByRole('button', { name: '취소', exact: true }).click();
    await expect(report.getByRole('button', { name: '보고받기', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(allDelegated).toHaveAttribute('aria-pressed', 'false');
    await allDelegated.click();
    // The outgoing layer must never reappear after a paint without it. Track both the live
    // dialog and its detached exit copy, which inherits this attribute.
    await delegatedDialog.evaluate((dialog) => {
      const layer = dialog.parentElement!;
      layer.setAttribute('data-office-exit', '');
      const samples: boolean[] = [];
      let goneAt: number | undefined;
      const target = window as typeof window & { officeExitFrames?: Promise<boolean[]> };
      target.officeExitFrames = new Promise((resolve) => {
        const frame = () => {
          const present = !!document.querySelector('[data-office-exit]');
          samples.push(present);
          if (present) goneAt = undefined;
          else goneAt ??= performance.now();
          if (goneAt !== undefined && performance.now() - goneAt >= 300) resolve(samples);
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
    });
    await delegatedDialog.getByRole('button', { name: '위임하기', exact: true }).click();
    const frames = await page.evaluate(
      () => (window as typeof window & { officeExitFrames: Promise<boolean[]> }).officeExitFrames,
    );
    const gone = frames.indexOf(false);
    expect(gone).toBeGreaterThanOrEqual(0);
    expect(frames.slice(gone)).not.toContain(true);
    await expect(rows.locator('button[aria-pressed="true"]')).toHaveText(Array(9).fill('위임'));
    await expect(allDelegated).toHaveAttribute('aria-pressed', 'true');
    await dismissSettingsToast(page);
    await bulk.getByRole('button', { name: '전체 보고받기', exact: true }).click();
    const reportDialog = page.getByRole('dialog', { name: '보고받겠습니다.', exact: true });
    await expect(reportDialog).toContainText('경기 전날 보고');
    await expect(reportDialog).toContainText('선수 영입');
    await reportDialog.getByRole('button', { name: '보고받기', exact: true }).click();
    await expect(rows.locator('button[aria-pressed="true"]')).toHaveText(Array(9).fill('보고받기'));
    await expect(bulk.getByRole('button', { name: '전체 보고받기', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    // Outside the office the mode and the calendar stand as they were.
    await leaveOffice(page);
    await expect(page.getByRole('region', { name: '시즌 진행', exact: true })).toContainText(
      'MANUAL',
    );
    await expect(
      page
        .getByRole('region', { name: '시즌 진행', exact: true })
        .getByRole('button', { name: '진행 방식 변경', exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId('game-date')).toHaveText(date);
    await expect(page.getByTestId('save-status')).toContainText('저장 완료');
    await page.reload();
    await openOffice(page);
    await expect(rows.locator('button[aria-pressed="true"]')).toHaveText(Array(9).fill('보고받기'));
    await leaveOffice(page);
    await expect(page.getByRole('region', { name: '시즌 진행', exact: true })).toContainText(
      'MANUAL',
    );
    await expect(
      page
        .getByRole('region', { name: '시즌 진행', exact: true })
        .getByRole('button', { name: '진행 방식 변경', exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId('game-date')).toHaveText(date);
  });
  test(`office authority confirmation and pending handover ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const w = pendingAcquisitionCareer();
    await importResponsibilityCareer(page, w);
    const office = await openOffice(page);
    await expect(page).toHaveURL(/view=office/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const choice = office.getByRole('group', { name: '선수 영입', exact: true });
    await choice.getByRole('button', { name: '위임', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '위임하겠습니다.', exact: true });
    await expect(dialog.locator('[data-facility-art="staff"]')).toBeVisible();
    await expect(dialog.getByRole('region', { name: '대기 업무 이관 미리보기' })).toContainText(
      '선수 영입',
    );
    await dialog.getByRole('button', { name: '취소', exact: true }).click();
    await expect(choice.getByRole('button', { name: '보고받기', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await choice.getByRole('button', { name: '위임', exact: true }).click();
    await dialog.getByRole('button', { name: '위임하기', exact: true }).click();
    await expect(choice.getByRole('button', { name: '위임', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const toast = page.getByTestId('action-outcome');
    await expect(toast).toHaveText('설정을 적용했어요');
    // The office has no bottom controls: the toast sits at the bottom of the screen (→WEB-36/39).
    const box = (await toast.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await expect(toast).toHaveCount(0, { timeout: 6000 });
    await choice.getByRole('button', { name: '보고받기', exact: true }).click();
    const direct = page.getByRole('dialog', { name: '보고받겠습니다.', exact: true });
    await expect(direct.locator('[data-facility-art="manager"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(choice.getByRole('button', { name: '위임', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
}
test('manual can keep match eve disabled and stop at the next result', async ({ page }) => {
  await foundQuiet(page);
  await chooseLevel(page, 4);
  await configureResponsibilities(page, { mode: 'manual' });
  await configureResponsibilities(page, { observations: { matchEve: false } });
  await page.getByRole('button', { name: '다음 이벤트', exact: true }).click();
  await expect(page.getByTestId('game-round')).toHaveText('1');
  await expect(page.getByRole('dialog', { name: 'NEXT MATCH', exact: true })).toHaveCount(0);
  const office = await openOffice(page);
  await expect(
    office
      .getByRole('group', { name: '경기 전날 보고', exact: true })
      .getByRole('button', { name: '위임', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  await expect(office).toBeVisible();
  await leaveOffice(page);
  await expect(page.getByRole('region', { name: '시즌 진행', exact: true })).toContainText(
    'MANUAL',
  );
  await expect(
    page
      .getByRole('region', { name: '시즌 진행', exact: true })
      .getByRole('button', { name: '진행 방식 변경', exact: true }),
  ).toBeVisible();
});

for (const themeId of ['standard', 'pixel']) {
  test(`${themeId} dismissed NEXT MATCH reopens without settling until an explicit choice`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.addInitScript(
      (themeId) =>
        localStorage.setItem(
          'haeram-soccor:presentation',
          JSON.stringify({ themeId, localeId: 'ko-KR' }),
        ),
      themeId,
    );
    await foundQuiet(page);
    await chooseLevel(page, 4);
    await configureResponsibilities(page, { mode: 'manual' });
    await page.getByRole('button', { name: '다음 이벤트', exact: true }).click();
    const report = page.getByRole('dialog', { name: 'NEXT MATCH', exact: true });
    await expect(report).toBeVisible();
    const date = await page.getByTestId('game-date').innerText();
    const fixture = await report.getByRole('heading', { level: 3 }).innerText();
    const round = await page.getByTestId('game-round').innerText();
    for (let reopen = 0; reopen < 2; reopen++) {
      await report.getByRole('button', { name: '창 닫기', exact: true }).click();
      await expect(report).toHaveCount(0);
      await expect(page.getByText('NEXT MATCH · 보고 확인', { exact: true })).toHaveCount(0);
      await expect(page.getByTestId('game-date')).toHaveText(date);
      await page.getByRole('button', { name: '다음 이벤트', exact: true }).click();
      await expect(report).toBeVisible();
      await expect(report.getByRole('heading', { level: 3 })).toHaveText(fixture);
      await expect(page.getByTestId('game-date')).toHaveText(date);
      await expect(page.getByTestId('game-round')).toHaveText(round);
    }
    await report.getByRole('button', { name: '결과만 보고 계속', exact: true }).click();
    await expect(page.getByTestId('game-round')).toHaveText('1');
    await expect(report).toHaveCount(0);
    await expect(page.getByRole('button', { name: '다음 이벤트', exact: true })).toBeVisible();
  });
}
