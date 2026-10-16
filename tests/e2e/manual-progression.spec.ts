import { expect, test } from '@playwright/test';
import { createWorld, advanceDays, operate } from '../../packages/engine/src/index';
import {
  nextOwnFixture,
  seasonDate,
  currentDay,
  fixtureDay,
} from '../../packages/engine/src/calendar';
import { pendingDecisions } from '../../packages/engine/src/stopping';
import {
  closeSettingsOutcome,
  importResponsibilityCareer,
  pendingAcquisitionCareer,
} from './responsibility-fixtures';
import { horizontalOverflow } from './layout';

for (const width of [1280, 390]) {
  test(`exclusive-controls ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const w = createWorld({
      country: 'ENG',
      name: 'Manual Controls',
      color: '#224466',
      seed: 'intervention-levels',
      level: 'easy',
    });
    await importResponsibilityCareer(page, w);
    await expect(page.getByRole('button', { name: '자동 진행 시작', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /속도 선택$/ })).toHaveCount(4);
    await expect(page.getByRole('button', { name: '다음 이벤트', exact: true })).toHaveCount(0);
    await page.getByRole('combobox', { name: '진행 모드', exact: true }).selectOption('manual');
    await closeSettingsOutcome(page);
    await expect(page.getByRole('button', { name: '다음 이벤트', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '자동 진행 시작', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /속도 선택$/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '시즌 진행 도구', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '전체 메뉴', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '전체 메뉴' })).not.toContainText(
      '한 라운드 진행',
    );
    await page.keyboard.press('Escape');
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await page.getByRole('combobox', { name: '진행 모드', exact: true }).selectOption('automatic');
    await closeSettingsOutcome(page);
    await expect(page.getByRole('button', { name: '자동 진행 시작', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '다음 이벤트', exact: true })).toHaveCount(0);
  });

  test(`next-match-eve-with-all-delegated ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const w = createWorld({
      country: 'ENG',
      name: 'Manual Eve',
      color: '#224466',
      seed: 'intervention-levels',
      level: 'easy',
    });
    for (const key of Object.keys(w.settings!.responsibilities) as (keyof NonNullable<
      typeof w.settings
    >['responsibilities'])[])
      w.settings!.responsibilities[key] = 'delegated';
    w.settings!.mode = 'manual';
    w.settings!.observations.windowOpen = false;
    const fixture = nextOwnFixture(w)!;
    const expected = structuredClone(w);
    while (currentDay(expected) < fixtureDay(fixture) - 1)
      advanceDays(expected, 1, undefined, false);
    await importResponsibilityCareer(page, w);
    const dates: string[] = [];
    await page.getByTestId('game-date').evaluate((element) => {
      (window as unknown as { observedDates: string[] }).observedDates = [];
      new MutationObserver(() =>
        (window as unknown as { observedDates: string[] }).observedDates.push(element.textContent!),
      ).observe(element, { childList: true, subtree: true, characterData: true });
    });
    await page.getByRole('button', { name: '다음 이벤트', exact: true }).click();
    await expect(page.getByTestId('game-date')).toHaveText(seasonDate(expected));
    dates.push(
      ...(await page.evaluate(
        () => (window as unknown as { observedDates: string[] }).observedDates,
      )),
    );
    expect(dates.every((date) => date === seasonDate(expected))).toBe(true);
    const group = page.getByTestId('event-group');
    await expect(group).toContainText('내일 경기');
    await group.getByRole('button', { name: '결과만 보고 계속', exact: true }).click();
    await expect(group).toHaveCount(0);
    const date = await page.getByTestId('game-date').innerText();
    await page.waitForTimeout(1200);
    await expect(page.getByTestId('game-date')).toHaveText(date);
    await expect(page.getByRole('button', { name: '다음 이벤트', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: '자동 진행 정지', exact: true })).toHaveCount(0);
  });

  test(`same-date-event-group ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const w = pendingAcquisitionCareer();
    w.settings!.mode = 'manual';
    // Place the two real pending negotiations alongside the real match-eve observation.
    while (currentDay(w) < fixtureDay(nextOwnFixture(w)!) - 1) advanceDays(w, 1, undefined, false);
    expect(pendingDecisions(w).length).toBeGreaterThanOrEqual(2);
    for (const item of w.inbox || []) operate(w, { type: 'read-inbox', id: item.id });
    await importResponsibilityCareer(page, w);
    const group = page.getByTestId('event-group');
    await expect(group).toContainText('내일 경기');
    const reject = group.getByRole('button', { name: '거절', exact: true });
    await expect(reject).toHaveCount(2);
    const next = page.getByRole('button', { name: '다음 이벤트', exact: true });
    await expect(next).toBeDisabled();
    await reject.first().click();
    await expect(reject).toHaveCount(1);
    await expect(next).toBeDisabled();
    await reject.first().click();
    await expect(reject).toHaveCount(0);
    await expect(next).toBeEnabled();
    await expect(group).toContainText('내일 경기');
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });
}
