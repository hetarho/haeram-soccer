import { expect, test } from '@playwright/test';
import { stopOnlyFor } from './events';
import { horizontalOverflow, settle } from './layout';

test('mobile clock exposes every pace as a touch target and advances at the chosen speed', async ({
  page,
}) => {
  // The paces are measured against match eves; offers from other clubs must not stop them.
  await stopOnlyFor(page, ['match']);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  const date = page.getByTestId('game-date');
  await expect(date).toHaveText('1950년 8월 1일');
  const controls = page.getByRole('region', { name: '시즌 진행', exact: true });
  const pace = (label: string) =>
    controls.getByRole('button', { name: `${label} 속도로 자동 진행`, exact: true });
  const daily = pace('1초에 하루'),
    double = pace('0.5초에 하루'),
    five = pace('0.2초에 하루'),
    ten = pace('0.1초에 하루'),
    toggle = controls.getByRole('button', { name: '자동 진행 시작', exact: true }),
    stop = controls.getByRole('button', { name: '자동 진행 정지', exact: true }),
    level = controls.getByRole('button', { name: /^개입 수준/ });
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
  // A pace tap starts the clock; stopping after the first tick advances exactly one day.
  await daily.click();
  await expect(date).toHaveText('1950년 8월 2일');
  await stop.click();
  await expect(date).toHaveText('1950년 8월 2일');
  // x2 is a day every half second: it moves on and stops with the owner, short of the match eve.
  await double.click();
  await expect(double).toHaveAttribute('aria-pressed', 'true');
  await expect(daily).toHaveAttribute('aria-pressed', 'false');
  await expect(date).toHaveText('1950년 8월 3일');
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
  const eve = page.getByTestId('event-card');
  await expect(eve).toContainText('내일 경기');
  await expect(date).toHaveText('1950년 8월 7일');
  await expect(toggle).toBeVisible();
  await expect(
    eve.getByRole('checkbox', { name: '다음부터 경기는 안 보고 자동 진행', exact: true }),
  ).not.toBeChecked();
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

test('mobile intervention levels set clock stops and staff delegation, and persist', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill('intervention-levels');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  const date = page.getByTestId('game-date');
  // The clock row shows the level on phones too; the HUD menu still opens the full sheet.
  const trigger = page
    .getByRole('region', { name: '시즌 진행', exact: true })
    .getByRole('button', { name: /^개입 수준/ });
  await expect(trigger).toHaveAccessibleName('개입 수준 · 중요한 결정만');
  await expect(trigger).toContainText('개입 2');
  await settle(page);
  const entry = async () => {
    await page.getByRole('button', { name: '전체 메뉴', exact: true }).click();
    const opener = page
      .getByRole('dialog', { name: '전체 메뉴' })
      .getByRole('button', { name: '개입 수준 설정', exact: true });
    const box = (await opener.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    await opener.click();
  };
  await entry();
  let dialog = page.getByRole('dialog', { name: '개입 수준', exact: true });
  const levels = dialog.getByRole('radiogroup', { name: '개입 수준' });
  const level = (n: number) => levels.getByRole('radio', { name: new RegExp(`^${n}\\. `) });
  await expect(levels.getByRole('radio')).toHaveCount(4);
  await expect(level(1)).toHaveAccessibleName(/^1\. 모든 결정 확인/);
  await expect(level(2)).toHaveAccessibleName(/^2\. 중요한 결정만/);
  await expect(level(3)).toHaveAccessibleName(/^3\. 이적만 직접/);
  await expect(level(4)).toHaveAccessibleName(/^4\. 운영진에 모두 맡기기/);
  // First run: level 2 stops for match eves, window openings, bids, offers, youth intake and cash.
  await expect(level(2)).toHaveAttribute('aria-checked', 'true');
  await dialog.getByText('이벤트별 세부 설정', { exact: true }).click();
  const stop = (label: string) =>
    dialog.getByRole('checkbox', { name: `${label}에서 멈춤`, exact: true });
  const expected: [string, boolean][] = [
    ['경기 전날', true],
    ['이적시장 개장', true],
    ['이적시장 마감', false],
    ['이적 협상 응답', true],
    ['우리 선수 영입 제안', true],
    ['유소년 입단', true],
    ['스태프 보고', false],
    ['자금·후원 경고', true],
  ];
  for (const [label, on] of expected)
    if (on) await expect(stop(label)).toBeChecked();
    else await expect(stop(label)).not.toBeChecked();
  // Level 4 hands everything to the staff, including offers and sponsors; only cash warnings stop.
  await level(4).click();
  await expect(level(4)).toHaveAttribute('aria-checked', 'true');
  for (const [label] of expected)
    if (label === '자금·후원 경고') await expect(stop(label)).toBeChecked();
    else await expect(stop(label)).not.toBeChecked();
  await dialog.getByRole('button', { name: '창 닫기', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toHaveAccessibleName('개입 수준 · 운영진에 모두 맡기기');
  await expect(trigger).toContainText('개입 4');
  const nav = page.getByRole('navigation', { name: '모바일 게임 메뉴' });
  await nav.getByRole('button', { name: '스태프', exact: true }).click();
  await page.getByRole('tab', { name: '위임', exact: true }).click();
  const delegation = page.getByRole('region', { name: '스태프 위임' });
  for (const label of ['훈련 방향', '유소년 승격·방출', '영입 제안 응대', '후원 계약'])
    await expect(delegation.getByRole('checkbox', { name: new RegExp(`^${label}`) })).toBeChecked();
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  // The level survives a reload.
  await entry();
  dialog = page.getByRole('dialog', { name: '개입 수준', exact: true });
  await expect(level(4)).toHaveAttribute('aria-checked', 'true');
  await dialog.getByRole('button', { name: '창 닫기', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await nav.getByRole('button', { name: '클럽 홈', exact: true }).click();
  await expect(date).toHaveText('1950년 8월 1일');
  // Without match stops, x10 plays straight through the first match day.
  await page.getByRole('button', { name: '0.1초에 하루 속도로 자동 진행', exact: true }).click();
  await expect(page.getByTestId('calendar')).toContainText('라운드 1');
  await expect(page.getByRole('button', { name: '자동 진행 정지', exact: true })).toBeVisible();
  await expect(page.getByTestId('event-card')).toHaveCount(0);
  await page.getByRole('button', { name: '자동 진행 정지', exact: true }).click();
});

test('the phone clock picks the intervention level from a popover without stopping', async ({
  page,
}) => {
  // Only match eves stop: a custom mix until a level is chosen.
  await stopOnlyFor(page, ['match']);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  const date = page.getByTestId('game-date');
  const clock = page.getByRole('region', { name: '시즌 진행', exact: true });
  const trigger = clock.getByRole('button', { name: /^개입 수준/ });
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAccessibleName('개입 수준 · 사용자 지정');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await settle(page);
  // "▶ · 1 3 5 · 개입" stays one row: nothing spills out of it and the date is not cut.
  const row = await clock.evaluate((section) => {
    const box = section.getBoundingClientRect();
    const date = section.querySelector<HTMLElement>('[data-testid="game-date"]')!;
    return {
      overflow: section.scrollWidth - section.clientWidth,
      dateCut: date.scrollWidth - date.clientWidth,
      outside: Array.from(section.querySelectorAll('button'))
        .map((button) => button.getBoundingClientRect())
        .filter((rect) => rect.left < box.left || rect.right > box.right).length,
    };
  });
  expect(row).toEqual({ overflow: 0, dateCut: 0, outside: 0 });
  const play = (await clock.getByRole('button', { name: '자동 진행 시작' }).boundingBox())!;
  const anchor = (await trigger.boundingBox())!;
  expect(anchor.height).toBe(play.height);
  expect(anchor.width).toBeGreaterThanOrEqual(44);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // Opening the popover never pauses the running clock; Escape hands focus back.
  await clock.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
  await expect(date).toHaveText('1950년 8월 2일');
  await trigger.click();
  const popover = page.getByRole('dialog', { name: '개입 수준 빠른 선택', exact: true });
  await expect(popover).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const opened = await date.innerText();
  await expect(date).not.toHaveText(opened);
  await page.keyboard.press('Escape');
  await expect(popover).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await clock.getByRole('button', { name: '자동 진행 정지', exact: true }).click();

  await trigger.click();
  await expect(popover).toBeVisible();
  await settle(page);
  const box = (await popover.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y).toBeGreaterThan(anchor.y + anchor.height);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  expect(Math.abs(box.x + box.width - (anchor.x + anchor.width))).toBeLessThanOrEqual(1);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  const levels = popover.getByRole('radiogroup', { name: '개입 수준', exact: true });
  const level = (n: number) => levels.getByRole('radio', { name: new RegExp(`^${n}\\. `) });
  await expect(levels.getByRole('radio')).toHaveCount(4);
  await expect(levels.getByRole('radio', { checked: true })).toHaveCount(0);
  await expect(popover).toContainText('사용자 지정 상태');
  // Focus starts on the first level and the arrow keys move between levels.
  await expect(level(1)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(level(2)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(level(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(level(4)).toBeFocused();
  // Choosing applies the level and closes the popover, handing focus back to the trigger.
  await page.keyboard.press('Enter');
  await expect(popover).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAccessibleName('개입 수준 · 운영진에 모두 맡기기');
  await expect(trigger).toContainText('개입 4');
  // A tap on another level applies it at once, delegation included.
  await trigger.click();
  await expect(level(4)).toHaveAttribute('aria-checked', 'true');
  await level(2).click();
  await expect(popover).toHaveCount(0);
  await expect(trigger).toHaveAccessibleName('개입 수준 · 중요한 결정만');
  await trigger.click();
  await expect(level(2)).toHaveAttribute('aria-checked', 'true');
  await level(4).click();
  await expect(trigger).toHaveAccessibleName('개입 수준 · 운영진에 모두 맡기기');
  // An outside tap closes it without a choice.
  await trigger.click();
  await expect(popover).toBeVisible();
  await date.click();
  await expect(popover).toHaveCount(0);

  // The detail button opens the full sheet with the same level checked.
  await trigger.click();
  await popover.getByRole('button', { name: '세부 설정…', exact: true }).click();
  await expect(popover).toHaveCount(0);
  const dialog = page.getByRole('dialog', { name: '개입 수준', exact: true });
  await expect(dialog.getByRole('radio', { name: /^4\. / })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await dialog.getByRole('button', { name: '창 닫기', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  await expect(trigger).toHaveAccessibleName('개입 수준 · 운영진에 모두 맡기기');
});

test('a hidden tab plays on like an idle game, names the date in its title, and can pause instead', async ({
  page,
}) => {
  await stopOnlyFor(page, ['match']);
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
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
  await expect(page).toHaveTitle(/^▶ 1950년 8월 \d+일 · Haeram Athletic$/);
  await setHidden(false);
  await expect(page).toHaveTitle('Haeram — Football Archives');
  await expect(page.getByRole('button', { name: '자동 진행 정지', exact: true })).toBeVisible();

  // The owner may choose the old behaviour: hiding pauses ticks without ending the run.
  await page.getByRole('button', { name: '전체 메뉴', exact: true }).click();
  await page
    .getByRole('dialog', { name: '전체 메뉴' })
    .getByRole('button', { name: '개입 수준 설정', exact: true })
    .click();
  const settings = page.getByRole('dialog', { name: '개입 수준' });
  const background = settings.getByRole('region', { name: '백그라운드 진행' });
  await expect(
    background.getByRole('radio', { name: '최대 한 시즌', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await background.getByLabel('다른 탭을 보거나 창을 내려도 계속 진행').uncheck();
  await settings.getByRole('button', { name: '설정 완료', exact: true }).click();
  await setHidden(true);
  const paused = await date.textContent();
  await page.waitForTimeout(1200);
  await expect(date).toHaveText(paused!);
  await expect(page.getByRole('button', { name: '자동 진행 정지', exact: true })).toBeVisible();
  await setHidden(false);
  await expect(date).not.toHaveText(paused!);
  await page.getByRole('button', { name: '자동 진행 정지', exact: true }).click();
  await expect(page.getByRole('button', { name: '자동 진행 시작', exact: true })).toBeVisible();
});

test('a page that closed with the clock running plays the time away on return and sums it up', async ({
  page,
}) => {
  await stopOnlyFor(page, []);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
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
