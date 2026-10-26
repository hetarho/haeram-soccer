import { watchNext } from './watch';
import { expect, test, type Page } from '@playwright/test';
import { createWorld, advanceToNextMatch } from '../../packages/engine/src/index';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { configureResponsibilities } from './events';
import { expectStablePossessionLayout, horizontalOverflow } from './layout';
import { readPresentationBaselines } from '../fixtures/presentation';
import { GOAL_FEEDBACK_CONFIG } from '../../apps/web/src/ui/goalFeedback';
import {
  WATCH_DEFAULT_SPEED,
  WATCH_MINUTE_MS,
  presentationMs,
  runningLength,
  setPiecePreparations,
} from '../../apps/web/src/ui/presentationClock';
import { textContrast } from './contrast';

const defaultThemeId = readPresentationBaselines().themeEntry.id;

for (const { id: themeId } of readPresentationBaselines().themeRegistry.entries)
  test(`${themeId}: readable match tabs and aligned result icon`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript((themeId) => {
      localStorage.setItem(
        'haeram-soccor:presentation',
        JSON.stringify({ localeId: 'ko-KR', themeId }),
      );
    }, themeId);
    await importResponsibilityCareer(page, goalWorld());
    await watchNext(page);
    const chart = page.getByRole('region', { name: '경기 흐름 그래프', exact: true });
    await expect(chart).toBeVisible();
    for (const tab of await chart.getByRole('tab').all()) {
      await tab.click();
      for (const label of await chart.getByRole('tab').all())
        expect((await label.evaluate(textContrast)).ratio).toBeGreaterThanOrEqual(4.5);
    }
    const difference = await page
      .getByTestId('match-next-action')
      .locator('b')
      .evaluate((label) => {
        const text = [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE)!;
        const range = document.createRange();
        range.selectNode(text);
        const copy = range.getBoundingClientRect();
        const icon = label.querySelector('[data-pixel-icon]')!.getBoundingClientRect();
        return Math.abs(copy.y + copy.height / 2 - icon.y - icon.height / 2);
      });
    expect(difference).toBeLessThanOrEqual(3);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });

for (const width of [360, 390]) {
  test(`fixed pitch ratio ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const world = createWorld({
      country: 'ENG',
      name: 'Mobile Pitch',
      color: '#224466',
      seed: 'mobile-pitch',
      level: 'easy',
    });
    world.settings!.responsibilities.sales = 'delegated';
    await importResponsibilityCareer(page, world);
    const date = await page.getByTestId('game-date').boundingBox();
    const pace = await page
      .getByRole('combobox', { name: '자동 진행 배속', exact: true })
      .boundingBox();
    expect(date!.width).toBeGreaterThan(0);
    expect(date!.x + date!.width).toBeLessThanOrEqual(pace!.x);
    expect(date!.y).toBeLessThan(pace!.y + pace!.height);
    // Calendar metadata sits above the content; transport has its own bottom row.
    expect(date!.y + date!.height).toBeLessThanOrEqual(pace!.y);
    await watchNext(page);
    const canvas = page.getByLabel('22명의 선수와 공으로 표현하는 경기');
    await expect(canvas).toBeVisible();
    for (const height of [844, 740, 920]) {
      await page.setViewportSize({ width, height });
      await expect
        .poll(() =>
          canvas.evaluate((node) => {
            const rect = node.getBoundingClientRect();
            return rect.width / rect.height;
          }),
        )
        .toBeCloseTo(1.9, 2);
      const action = page.getByTestId('match-next-action');
      await expect(action).toBeInViewport();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    }
  });
}

test('mobile result-only continuation preserves the exiting card position', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 390, height: 844 });
  const world = createWorld({
    country: 'ENG',
    name: 'Mobile Events',
    color: '#224466',
    seed: 'intervention-levels',
    level: 'easy',
  });
  const settings = world.settings!;
  settings.mode = 'manual';
  settings.observations.windowOpen = false;
  for (const key of Object.keys(
    settings.responsibilities,
  ) as (keyof typeof settings.responsibilities)[])
    settings.responsibilities[key] = 'delegated';
  await importResponsibilityCareer(page, world);
  await configureResponsibilities(page, { mode: 'automatic' });
  await expect(page.getByRole('button', { name: '자동 진행 시작', exact: true })).toBeVisible();
  await configureResponsibilities(page, { mode: 'manual' });
  await expect(page.getByRole('button', { name: '다음 이벤트', exact: true })).toBeVisible();
  for (let round = 0; round < 2; round++) {
    await page.getByRole('button', { name: '다음 이벤트', exact: true }).click();
    const card = page.getByTestId('event-card').filter({ hasText: '내일 경기' });
    await expect(card).toBeVisible();
    await card.evaluate(async (node) => {
      await Promise.all(node.getAnimations().map((animation) => animation.finished));
      const rect = node.getBoundingClientRect();
      const className = node.className;
      const samples: { x: number; y: number; width: number; height: number }[] = [];
      const observer = new MutationObserver((records) => {
        for (const record of records)
          for (const added of record.addedNodes)
            if (
              added instanceof HTMLElement &&
              added.className === className &&
              added.getAttribute('aria-hidden') === 'true'
            ) {
              const bounds = added.getBoundingClientRect();
              samples.push({
                x: bounds.x,
                y: bounds.y,
                width: bounds.width,
                height: bounds.height,
              });
            }
      });
      observer.observe(document.body, { childList: true });
      Object.assign(window, {
        exitGeometry: {
          before: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          samples,
        },
        exitObserver: observer,
      });
    });
    await card.getByRole('button', { name: '결과만 보고 계속', exact: true }).click();
    await expect(page.getByTestId('event-group')).toHaveCount(0);
    const geometry = await page.evaluate(() => {
      const state = window as unknown as {
        exitGeometry: { before: Record<string, number>; samples: Record<string, number>[] };
        exitObserver: MutationObserver;
      };
      state.exitObserver.disconnect();
      return state.exitGeometry;
    });
    expect(geometry.samples).toHaveLength(1);
    for (const [key, value] of Object.entries(geometry.before))
      expect(Math.abs(geometry.samples[0][key] - value), key).toBeLessThan(2);
    await expect(page.getByRole('button', { name: '다음 이벤트', exact: true })).toBeEnabled();
  }
});

/** An early home goal for presentation checks; later goals follow the current model. */
function goalWorld() {
  const world = createWorld({
    country: 'ENG',
    name: 'Goal Feedback',
    color: '#224466',
    seed: 'goal-feedback-221',
    level: 'easy',
  });
  world.settings!.responsibilities.sales = 'delegated';
  return world;
}

/** Counts every GOAL cue the page mounts, so a rerender that repeated one would show. */
async function countCues(page: Page) {
  await page.evaluate(() => {
    const cues: string[] = [];
    new MutationObserver((records) => {
      for (const record of records)
        for (const added of record.addedNodes)
          if (added instanceof HTMLElement && added.dataset.testid === 'goal-cue')
            cues.push(added.textContent ?? '');
    }).observe(document.body, { childList: true, subtree: true });
    Object.assign(window, { goalCues: cues });
  });
  return () => page.evaluate(() => (window as unknown as { goalCues: string[] }).goalCues);
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
])
  test(`goal cue and ball ownership in the normal view at ${viewport.width}`, async ({ page }) => {
    // Verify the early home goal before entering the browser; later goals and added time come
    // from the current fixture, so a model revision cannot silently stale the UI expectations.
    test.slow();
    await page.emulateMedia({ reducedMotion: viewport.width === 390 ? 'reduce' : 'no-preference' });
    await page.setViewportSize(viewport);
    // Desktop watches in pixel; phones exercise the registered default theme.
    if (viewport.width === 1280)
      await page.addInitScript(() =>
        localStorage.setItem(
          'haeram-soccor:presentation',
          JSON.stringify({ localeId: 'ko-KR', themeId: 'pixel' }),
        ),
      );
    const world = goalWorld();
    const playback = advanceToNextMatch(structuredClone(world))!;
    const expected = playback.record;
    expect(expected.highlights[0]).toMatchObject({ minute: 2, side: 0 });
    expect(expected.highlights.length).toBeGreaterThanOrEqual(3);
    await importResponsibilityCareer(page, world);
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      viewport.width === 1280 ? 'pixel' : defaultThemeId,
    );
    const cues = await countCues(page);
    await watchNext(page);
    // Every ownership state the scoreboard passes through, to show both sides take their turn.
    await page.getByTestId('match-score').evaluate((node) => {
      const states = new Set<string>();
      const read = () =>
        states.add(
          `${node.getAttribute('data-possession')}:${node.getAttribute('data-possession-side') ?? '-'}`,
        );
      read();
      new MutationObserver(read).observe(node, { attributes: true });
      Object.assign(window, { possessionStates: states });
    });
    // Ownership shows without match details or player inspection.
    await expect(page.getByRole('button', { name: '경기 상세', exact: true })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    const badge = page.getByTestId('match-score').getByTestId('possession-cue');
    await expect(badge).toHaveCount(1, { timeout: 10_000 });
    await expect(badge).toHaveAccessibleName('볼 소유');
    await expectStablePossessionLayout(page);
    const badgeBox = (await badge.boundingBox())!;
    expect(badgeBox.x).toBeGreaterThanOrEqual(0);
    expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(viewport.width);
    const cue = page.getByTestId('goal-cue');
    await expect(cue).toBeVisible({
      timeout: (2 * WATCH_MINUTE_MS) / WATCH_DEFAULT_SPEED + 3000,
    });
    await expect(cue).toContainText('GOAL');
    await expect(cue).toContainText('득점');
    const score = page.getByTestId('match-score').locator('strong');
    await expect(score).toHaveText('1 : 0');
    const emphasis = page.getByTestId('match-score').getByTestId('goal-score');
    await expect(emphasis).toHaveText('1');
    // Reduced motion keeps the same hold with a still emphasis.
    const pulse = await emphasis.evaluate((node) => getComputedStyle(node).animationName);
    if (viewport.width === 390) expect(pulse).toBe('none');
    else expect(pulse).toMatch(/goal-pulse/);
    // The presented minute stays put while the cue shows, and the cue clears the corner controls.
    const minute = await page.getByTestId('match-latest-event').locator('span').innerText();
    const cueBox = (await cue.boundingBox())!;
    const canvasBox = (await page.getByLabel('22명의 선수와 공으로 표현하는 경기').boundingBox())!;
    expect(cueBox.x).toBeGreaterThanOrEqual(canvasBox.x);
    expect(cueBox.x + cueBox.width).toBeLessThanOrEqual(canvasBox.x + canvasBox.width);
    expect(cueBox.y).toBeGreaterThanOrEqual(canvasBox.y);
    expect(cueBox.y + cueBox.height).toBeLessThanOrEqual(canvasBox.y + canvasBox.height);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await expect(page.getByTestId('match-latest-event').locator('span')).toHaveText(minute);
    await expect(cue).toHaveCount(0, { timeout: 3000 });
    await expect(score).toHaveText('1 : 0');
    if (viewport.width !== 360) return;
    // Include actual added time and every goal hold using the presentation clock's own rule.
    const restMs =
      presentationMs(
        0,
        runningLength(playback.frames.length),
        16,
        setPiecePreparations(playback.frames),
      ) +
      expected.highlights.length * GOAL_FEEDBACK_CONFIG.holdMs +
      5000;
    test.info().setTimeout(test.info().timeout + restMs);
    await page.getByRole('radio', { name: '16×', exact: true }).click();
    await expect(page.getByText(/90(\+\d+)?′ ·.*경기 종료/)).toBeVisible({ timeout: restMs });
    await expect(score).toHaveText(`${expected.score.home} : ${expected.score.away}`);
    await expect(cue).toHaveCount(0);
    const seen = await cues();
    expect(seen).toHaveLength(expected.highlights.length);
    expect(seen.every((text) => text.startsWith('GOAL'))).toBe(true);
    const states = await page.evaluate(() => [
      ...(window as unknown as { possessionStates: Set<string> }).possessionStates,
    ]);
    expect(states).toEqual(expect.arrayContaining(['carrier:0', 'carrier:1']));
  });
