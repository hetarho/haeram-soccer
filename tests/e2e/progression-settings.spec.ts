import { expect, test } from '@playwright/test';
import { stopOnlyFor } from './events';
import { settle } from './layout';

test('mobile clock exposes every pace as a touch target and advances the chosen days', async ({
  page,
}) => {
  // The paces are measured against match eves; offers from other clubs must not stop them.
  await stopOnlyFor(page, ['match']);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  const date = page.getByTestId('game-date');
  await expect(date).toHaveText('1901년 8월 1일');
  const controls = page.getByRole('region', { name: '시즌 진행', exact: true });
  const pace = (label: string) =>
    controls.getByRole('button', { name: `${label} 속도로 자동 진행`, exact: true });
  const daily = pace('1초에 하루'),
    threeDays = pace('1초에 3일'),
    fiveDays = pace('1초에 5일'),
    toggle = controls.getByRole('button', { name: '자동 진행 시작', exact: true }),
    stop = controls.getByRole('button', { name: '자동 진행 정지', exact: true });
  for (const control of [toggle, daily, threeDays, fiveDays]) {
    const rect = await control.boundingBox();
    expect(rect!.width).toBeGreaterThanOrEqual(44);
    expect(rect!.height).toBeGreaterThanOrEqual(44);
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(360);
    expect(rect!.y + rect!.height).toBeLessThan(740);
  }
  await expect(daily).toHaveAttribute('aria-pressed', 'true');
  // A pace tap starts the clock; stopping after the first tick advances exactly one day.
  await daily.click();
  await expect(date).toHaveText('1901년 8월 2일');
  await stop.click();
  await expect(date).toHaveText('1901년 8월 2일');
  await threeDays.click();
  await expect(threeDays).toHaveAttribute('aria-pressed', 'true');
  await expect(daily).toHaveAttribute('aria-pressed', 'false');
  await expect(date).not.toHaveText('1901년 8월 2일');
  await stop.click();
  // A three-day step moves up to three days and ends early on a day club news arrives.
  const stepped = await date.innerText();
  expect(['1901년 8월 3일', '1901년 8월 4일', '1901년 8월 5일', '1901년 8월 6일']).toContain(
    stepped,
  );
  await page.waitForTimeout(1200);
  await expect(date).toHaveText(stepped);
  // A five-day step lands on the eve of our first match and the clock stops there.
  await fiveDays.click();
  await expect(fiveDays).toHaveAttribute('aria-pressed', 'true');
  const eve = page.getByTestId('event-card');
  await expect(eve).toContainText('내일 경기');
  await expect(date).toHaveText('1901년 8월 7일');
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
  // On a phone the clock row keeps its room for the date; the levels open from the HUD menu.
  await expect(
    page
      .getByRole('region', { name: '시즌 진행', exact: true })
      .getByRole('button', { name: /^개입 수준/ }),
  ).toHaveCount(0);
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
  let dialog = page.getByRole('dialog', { name: '개입 수준' });
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
  const nav = page.getByRole('navigation', { name: '모바일 게임 메뉴' });
  await nav.getByRole('button', { name: '선수단', exact: true }).click();
  await page
    .getByRole('group', { name: '선수단 메뉴' })
    .getByRole('button', { name: '스태프', exact: true })
    .click();
  const delegation = page.getByRole('region', { name: '스태프 위임' });
  for (const label of ['훈련 방향', '유소년 승격·방출', '영입 제안 응대', '후원 계약'])
    await expect(delegation.getByRole('checkbox', { name: new RegExp(`^${label}`) })).toBeChecked();
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  // The level survives a reload.
  await entry();
  dialog = page.getByRole('dialog', { name: '개입 수준' });
  await expect(level(4)).toHaveAttribute('aria-checked', 'true');
  await dialog.getByRole('button', { name: '창 닫기', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await nav.getByRole('button', { name: '클럽 홈', exact: true }).click();
  await expect(date).toHaveText('1901년 8월 1일');
  // Without match stops, the 3-day pace plays straight through the first match day.
  await page.getByRole('button', { name: '1초에 3일 속도로 자동 진행', exact: true }).click();
  await expect(page.getByTestId('calendar')).toContainText('라운드 1');
  await expect(page.getByRole('button', { name: '자동 진행 정지', exact: true })).toBeVisible();
  await expect(page.getByTestId('event-card')).toHaveCount(0);
  await page.getByRole('button', { name: '자동 진행 정지', exact: true }).click();
});

test('visibility events pause the shared clock only while hidden and resume on return', async ({
  page,
}) => {
  await stopOnlyFor(page, ['match']);
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  const date = page.getByTestId('game-date');
  await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
  await expect(date).toHaveText('1901년 8월 2일');
  // Headless engines keep pages visible; exercise the real browser listener with its hidden input.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const paused = await date.textContent();
  await page.waitForTimeout(1200);
  await expect(date).toHaveText(paused!);
  // Hiding pauses ticks without ending the run.
  await expect(page.getByRole('button', { name: '자동 진행 정지', exact: true })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(date).not.toHaveText(paused!);
  await page.getByRole('button', { name: '자동 진행 정지', exact: true }).click();
  await expect(page.getByRole('button', { name: '자동 진행 시작', exact: true })).toBeVisible();
});
