import { expect, test } from '@playwright/test';
import { createWorld, advanceDays, operate } from '../../packages/engine/src/index';
import {
  nextOwnFixture,
  todayStamp,
  currentDay,
  fixtureDay,
} from '../../packages/engine/src/calendar';
import { pendingDecisions } from '../../packages/engine/src/stopping';
import { importResponsibilityCareer, pendingAcquisitionCareer } from './responsibility-fixtures';
import { horizontalOverflow } from './layout';
import { configureResponsibilities, matchReport, reviewInOffice } from './events';
import { leaveOffice } from './office';

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
    await expect(page.getByRole('combobox', { name: '자동 진행 배속', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: '진행 모드', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '다음 이벤트', exact: true })).toHaveCount(0);
    await configureResponsibilities(page, { mode: 'manual' });
    await expect(page.getByRole('button', { name: '다음 이벤트', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '자동 진행 시작', exact: true })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: '자동 진행 배속', exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByRole('button', { name: '시즌 진행 도구', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '설정' })).not.toContainText('한 라운드 진행');
    await page.keyboard.press('Escape');
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await configureResponsibilities(page, { mode: 'automatic' });
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
    await expect(page.getByTestId('game-date')).toHaveText(todayStamp(expected));
    dates.push(
      ...(await page.evaluate(
        () => (window as unknown as { observedDates: string[] }).observedDates,
      )),
    );
    expect(dates.every((date) => date === todayStamp(expected))).toBe(true);
    // Exit animations retain inert copies; only the live report owns a pending match eve.
    const group = matchReport(page).getByTestId('event-group');
    await expect(group).toContainText('내일 경기');
    await group.getByRole('button', { name: '결과만 보고 계속', exact: true }).click();
    await expect(group).toHaveCount(0);
    const nextEvent = page.getByRole('button', { name: '다음 이벤트', exact: true });
    await expect(nextEvent).toBeEnabled();
    const date = await page.getByTestId('game-date').innerText();
    await page.waitForTimeout(1200);
    await expect(page.getByTestId('game-date')).toHaveText(date);
    await expect(nextEvent).toBeEnabled();
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
    // The decisions wait in the owner office's tray, not in the match eve (→WEB-39).
    await expect(group.getByRole('button', { name: '검토하기', exact: true })).toHaveCount(0);
    const next = page.getByRole('button', { name: '다음 이벤트', exact: true });
    const result = group.getByRole('button', { name: '결과만 보고 계속', exact: true });
    // Next-event remains a report-reopen action; the unresolved decisions block settlement.
    await expect(next).toBeEnabled();
    await expect(result).toBeDisabled();
    for (const left of [1, 0]) {
      const request = await reviewInOffice(page);
      await request.getByRole('button', { name: '거절', exact: true }).click();
      await expect(page).toHaveURL(/\/journal$/);
      await next.click();
      await expect(group).toContainText('내일 경기');
      await expect(next).toBeEnabled();
      if (left) await expect(result).toBeDisabled();
      else await expect(result).toBeEnabled();
    }
    await expect(group).toContainText('내일 경기');
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });
}

for (const authority of ['direct', 'delegated'] as const) {
  test(`manual entry enables match report with all business ${authority}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const w = createWorld({
      country: 'ENG',
      name: `Mandatory ${authority}`,
      color: '#224466',
      seed: `mandatory-${authority}`,
      level: 'easy',
    });
    for (const key of Object.keys(w.settings!.responsibilities) as (keyof NonNullable<
      typeof w.settings
    >['responsibilities'])[])
      w.settings!.responsibilities[key] = authority;
    w.settings!.observations.matchEve = false;
    await importResponsibilityCareer(page, w);
    const date = await page.getByTestId('game-date').innerText();
    await configureResponsibilities(page, { mode: 'manual' });
    await expect(page.getByRole('button', { name: '다음 이벤트', exact: true })).toBeVisible();
    const { openOffice } = await import('./events');
    const office = await openOffice(page);
    await expect(
      office
        .getByRole('group', { name: '경기 전날 보고', exact: true })
        .getByRole('button', { name: '보고받기', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    // Opening and leaving the office advances no manual day.
    await leaveOffice(page);
    await expect(page.getByTestId('game-date')).toHaveText(date);
  });
}
