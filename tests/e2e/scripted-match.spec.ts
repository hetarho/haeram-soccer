import { expect, test } from '@playwright/test';
import { preparedWorld } from '../fixtures/prepared-world';
import { advanceToNextMatch } from '../../packages/engine/src/testing';
import { daysUntilNextMatch } from '../../packages/engine/src/calendar';
import { MATCH_MODEL_RELEASE } from '../../packages/engine/src/match-model-release';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { openWatchAction, openMatchDetails, closeMatchDetails, presentedMinute } from './watch';
import { exportWorld } from './club-identity-helpers';
import {
  WATCH_DEFAULT_SPEED,
  WATCH_MINUTE_MS,
} from '../../apps/web/src/entities/match/lib/presentationClock';

/**
 * Watch to a playing pitch: 3 s on the batch's local Chromium run (T834), which guards the latency.
 * On shared CI runners the journey only checks that the pitch plays, by playwright.config's CI rule
 * that a wait never fails a journey for time: all three browsers missed 3 s (CI 43278670820), and
 * WebKit missed 10 s in all three attempts (CI 43288257211), its canvas appearing only 8.1 s after
 * the watch click while the engine worker settled the match day (1.4 s in local Node).
 */
const PLAYING_BUDGET_MS = process.env.CI ? 30_000 : 3000;
/**
 * The running minute played below within one and a half times its length at the opening speed
 * locally (13.5 s); CI waits by the same rule as above.
 */
const MINUTE_BUDGET_MS = process.env.CI ? 30_000 : (1.5 * WATCH_MINUTE_MS) / WATCH_DEFAULT_SPEED;

/** Actual worker/Canvas/save integration; authored here, run only by the coordinator's batch. */
test('stages a scripted own match ahead of its theatre and retains the Node result', async ({
  page,
}) => {
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  // preparedWorld checks the SHA-256 and schema before returning an independent world.
  const world = preparedWorld('scripted-journey');
  expect(world.matchModel!.revision).toBe(MATCH_MODEL_RELEASE.revision);
  expect(daysUntilNextMatch(world)).toBe(1);
  const reference = structuredClone(world);
  const played = advanceToNextMatch(reference)!;
  expect(played.script).toBeDefined();
  expect(played.frames).toEqual([]);
  expect(played.record.score.home + played.record.score.away).toBeGreaterThan(0);
  await importResponsibilityCareer(page, world);
  const watch = await openWatchAction(page);
  const canvas = page.locator('canvas[data-pickable]');
  const seconds = () => canvas.getAttribute('data-seconds').then((value) => Number(value));
  const start = Date.now();
  await watch.click();
  await expect
    .poll(seconds, { timeout: PLAYING_BUDGET_MS, intervals: [50, 100, 200] })
    .toBeGreaterThan(0);
  expect(Date.now() - start, 'watch to a playing pitch').toBeLessThanOrEqual(PLAYING_BUDGET_MS);
  const speeds = page.getByRole('radiogroup', { name: '관전 속도', exact: true });
  await expect(speeds.getByRole('radio', { name: '2×', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  const minute = await presentedMinute(page),
    before = await seconds();
  // One minute at 2x is nine real seconds; dead-ball beats may shorten it, a goal adds its hold.
  await expect.poll(seconds, { timeout: MINUTE_BUDGET_MS }).toBeGreaterThanOrEqual(before + 60);
  expect(await presentedMinute(page)).not.toBe(minute);

  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  await expect(page.getByTestId('match-score').locator('strong')).toHaveText(
    `${played.record.score.home} : ${played.record.score.away}`,
    { timeout: 1000 },
  );
  // Even if the rest of the picture is still staging, the settled analysis is available now.
  const details = await openMatchDetails(page);
  const report = details.getByRole('region', { name: '경기 분석 리포트', exact: true });
  await expect(report).toBeVisible();
  await report.getByRole('button', { name: '경기 자료', exact: true }).click();
  const material = report.getByRole('region', { name: '경기 자료', exact: true });
  for (const name of ['슛 지도', '히트맵', '패스 연결망', '전술 해설']) {
    const tab = material.getByRole('tab', { name, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(material.getByRole('tabpanel')).toBeVisible();
  }
  await closeMatchDetails(page);
  await expect(page.locator('[data-ui="match-meta"] > span').first()).toContainText('경기 종료', {
    timeout: 60000,
  });

  await page.getByTestId('goal-replay-open').click();
  const pick = page.getByTestId('goal-replay-option').first();
  await expect(pick).toHaveAttribute('data-footage', 'true');
  await pick.click();
  const replay = page.getByTestId('goal-replay-state');
  await expect(replay).toBeVisible();
  const clipStart = await seconds();
  await expect.poll(seconds).toBeGreaterThan(clipStart);
  await replay.getByRole('button', { name: '돌아가기', exact: true }).click();
  await expect(replay).toHaveCount(0);
  await expect(page.locator('[data-ui="match-meta"] > span').first()).toContainText('경기 종료');
  const saved = await exportWorld(page);
  // recordMatch retains the own squad and adds its tenure; playback.record has both squads.
  expect(saved.ownMatches).toEqual(reference.ownMatches);
  expect(saved.ownMatches.at(-1)).toMatchObject({
    id: played.record.id,
    score: played.record.score,
    detail: played.record.detail,
    material: played.record.material,
  });
  expect(saved.calendar).toEqual(reference.calendar);
});
