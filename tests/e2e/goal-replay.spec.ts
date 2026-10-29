import { watchNext } from './watch';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { advanceToNextMatch, createWorld } from '../../packages/engine/src/index';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { horizontalOverflow } from './layout';
import { committedRaw, openRecordedMatch } from './club-identity-helpers';
import { GOAL_FEEDBACK_CONFIG, goalInstants } from '../../apps/web/src/ui/goalFeedback';
import {
  GOAL_REPLAY_CONFIG,
  replayGoals,
  startGoalReplay,
  type ReplayGoal,
} from '../../apps/web/src/ui/goalReplay';
import {
  presentationSamples,
  WATCH_DEFAULT_SPEED,
  WATCH_MINUTE_MS,
} from '../../apps/web/src/ui/presentationClock';

/** The mobile presentation journey's fixture: an early home goal, then more on the current model. */
function goalWorld() {
  const world = createWorld({
    country: 'ENG',
    name: 'Goal Feedback',
    color: '#224466',
    // As tests/e2e/mobile-match-presentation.spec.ts: on match-model revision 10 goal-feedback-2's
    // first match opens 1′ home, then 65′ and 67′ home, 72′ away, 88′ home and 90′ away.
    seed: 'goal-feedback-2',
    level: 'easy',
  });
  world.settings!.responsibilities.sales = 'delegated';
  return world;
}

async function savedRaw(page: Page) {
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  return (await committedRaw(page))!;
}

/** Counts every GOAL cue the page mounts, so a celebration repeated on return would show. */
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
  return () => page.evaluate(() => (window as unknown as { goalCues: string[] }).goalCues.length);
}

/**
 * Records every presented running second the frame loop writes on the pitch from now on, in order,
 * so a journey reads the exact instant a clip left and the first one it returned to rather than
 * two samples with the original clock running between them.
 */
async function presentedTrail(canvas: Locator) {
  await canvas.evaluate((element) => {
    const trail = [element.getAttribute('data-seconds') ?? ''];
    // Each write's value is the next write's old value, the last one's the attribute itself.
    new MutationObserver((records) => {
      records.forEach((_, i) =>
        trail.push(records[i + 1]?.oldValue ?? element.getAttribute('data-seconds') ?? ''),
      );
    }).observe(element, {
      attributes: true,
      attributeFilter: ['data-seconds'],
      attributeOldValue: true,
    });
    Object.assign(window, { presentedTrail: trail });
  });
  return () =>
    canvas
      .page()
      .evaluate(() => (window as unknown as { presentedTrail: string[] }).presentedTrail);
}

test('a seen goal replays its build-up and returns to the original viewing', async ({ page }) => {
  test.slow();
  await page.setViewportSize({ width: 360, height: 740 });
  const world = goalWorld();
  const playback = advanceToNextMatch(structuredClone(world))!;
  const { samples } = presentationSamples(playback.frames);
  const starts: number[] = [];
  for (const sample of samples) starts[sample.frame] ??= sample.time;
  const goals = goalInstants(playback.record, playback.frames, starts);
  const picks = replayGoals(goals, playback.frames, goals.length);
  expect(goals.length).toBeGreaterThanOrEqual(3);
  expect(goals[0]).toMatchObject({ side: 0, home: 1, away: 0 });
  expect(playback.record.highlights[0]!.minute).toBeLessThanOrEqual(5);
  // A watched match keeps every goal's footage, the last one's included.
  expect(picks.every((pick) => pick.footage)).toBe(true);
  const clipOf = (pick: ReplayGoal) =>
    startGoalReplay(goals, playback.frames, pick, {
      matchId: playback.record.id,
      clock: { seconds: 0, next: 0 },
      sampleIndex: 0,
      paused: false,
      speed: WATCH_DEFAULT_SPEED,
      finished: false,
    })!;
  const opening = clipOf(picks[0]!);
  // A clip's build-up in real ms at its opening speed, with room for the page to keep up.
  const clipMs =
    (GOAL_REPLAY_CONFIG.leadSeconds * WATCH_MINUTE_MS) / 60 / GOAL_REPLAY_CONFIG.speed + 5000;

  await importResponsibilityCareer(page, world);
  const cues = await countCues(page);
  // Manual mode: leaving the match starts no unattended play, so saves change only by commands.
  await watchNext(page, { manual: true });
  const theatre = page.getByTestId('match-theatre');
  const settled = await savedRaw(page);
  const date = await theatre.getByTestId('game-date').innerText();
  const canvas = page.getByLabel('22명의 선수와 공으로 표현하는 경기');
  // The presented running second, which the frame loop writes on the canvas each frame.
  const presented = () => canvas.getAttribute('data-seconds');
  const seconds = async () => Number(await presented());
  const score = page.getByTestId('match-score').locator('strong');
  const cue = page.getByTestId('goal-cue');
  const open = page.getByTestId('goal-replay-open');
  const state = page.getByTestId('goal-replay-state');
  const picker = page.getByRole('dialog', { name: '골 장면 다시보기', exact: true });
  const options = picker.getByTestId('goal-replay-option');
  const speed = (value: number) => page.getByRole('radio', { name: `${value}×`, exact: true });

  // Nothing is on offer before a goal has been presented, nor while its cue still shows.
  await expect(cue).toBeVisible({
    timeout: (playback.record.highlights[0]!.minute * WATCH_MINUTE_MS) / WATCH_DEFAULT_SPEED + 3000,
  });
  await expect(open).toHaveCount(0);
  await expect(cue).toHaveCount(0, { timeout: GOAL_FEEDBACK_CONFIG.holdMs + 2000 });
  await expect(open).toBeVisible();
  // A reachable touch target inside the pitch, which keeps its shape on a phone.
  const openBox = (await open.boundingBox())!;
  const canvasBox = (await canvas.boundingBox())!;
  expect(openBox.height).toBeGreaterThanOrEqual(44);
  expect(openBox.x).toBeGreaterThanOrEqual(canvasBox.x);
  expect(openBox.x + openBox.width).toBeLessThanOrEqual(canvasBox.x + canvasBox.width);
  expect(openBox.y + openBox.height).toBeLessThanOrEqual(canvasBox.y + canvasBox.height);
  expect(canvasBox.width / canvasBox.height).toBeCloseTo(1.9, 1);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  expect(await cues()).toBe(1);

  // The original viewing: a chosen speed, paused at an instant by the existing scrubber.
  await speed(4).click();
  await page.getByRole('button', { name: '경기 상세', exact: true }).click();
  const scrubber = page.getByRole('slider', { name: '경기 시간', exact: true });
  const target = Number(await scrubber.inputValue()) + 1;
  await scrubber.fill(String(target));
  await expect.poll(presented).toBe(samples[target]!.time.toFixed(2));
  const original = await presented();
  await page.waitForTimeout(400);
  expect(await presented()).toBe(original);
  expect(Number(original)).toBeLessThan(goals[1]!.seconds);

  // Only the seen goal is offered, with its order, minute, side, scorer and running score.
  await open.click();
  await expect(picker).toBeVisible();
  await expect(options).toHaveCount(1);
  await expect(options.first()).toContainText(`1. ${playback.frames[picks[0]!.frame]!.label}′`);
  await expect(options.first()).toContainText('1 : 0');
  if (goals[0]!.scorer) await expect(options.first()).toContainText(goals[0]!.scorer);
  for (const later of goals.slice(1))
    if (later.scorer && later.scorer !== goals[0]!.scorer)
      await expect(picker).not.toContainText(later.scorer);
  // Closing the picker changes nothing.
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  expect(await presented()).toBe(original);

  // Automatic return: the clip plays its build-up at 1x through the goal and its hold.
  await open.click();
  await options.first().click();
  await expect(state).toBeVisible();
  await expect(state).toContainText('다시보기');
  await expect(theatre).toContainText('다시보기 ·');
  await expect(speed(GOAL_REPLAY_CONFIG.speed)).toHaveAttribute('aria-checked', 'true');
  await expect.poll(seconds).toBeLessThan(goals[0]!.seconds);
  expect(await seconds()).toBeGreaterThanOrEqual(opening.from - 0.01);
  await expect(score).toHaveText('0 : 0');
  const stateBox = (await state.boundingBox())!;
  expect(stateBox.height).toBeGreaterThanOrEqual(44);
  expect(stateBox.x + stateBox.width).toBeLessThanOrEqual(canvasBox.x + canvasBox.width);
  await expect(cue).toBeVisible({ timeout: clipMs });
  await expect(score).toHaveText('1 : 0');
  await expect(state).toHaveCount(0, { timeout: GOAL_FEEDBACK_CONFIG.holdMs + 3000 });
  // Exactly the original instant, still paused at its speed, without another celebration.
  await expect.poll(presented).toBe(original);
  await expect(speed(4)).toHaveAttribute('aria-checked', 'true');
  await page.waitForTimeout(400);
  expect(await presented()).toBe(original);
  expect(await cues()).toBe(2);
  await expect(score).toHaveText('1 : 0');
  await expect(open).toBeVisible();
  // The clip neither finished nor revealed the live match.
  await expect(page.getByTestId('match-next-action')).toHaveAccessibleName('결과 보기');

  // Manual return before the goal: the same exact instant and no cue.
  await open.click();
  await options.first().click();
  await expect(state).toBeVisible();
  await state.getByRole('button', { name: '돌아가기', exact: true }).click();
  await expect(state).toHaveCount(0);
  await expect.poll(presented).toBe(original);
  await expect(speed(4)).toHaveAttribute('aria-checked', 'true');
  expect(await cues()).toBe(2);

  // From running play the clip returns to its entry instant, with no catch-up of the clip's time.
  // The original clock rightly runs on while the picker opens and again once the clip has
  // returned, a dead-ball beat's rush and still beat faster than running play (→WEB-32), so the
  // entry and the return are read from the presented instants themselves, not two samples apart.
  await speed(4).click();
  await expect.poll(seconds).toBeGreaterThan(Number(original));
  await open.click();
  const trail = await presentedTrail(canvas);
  await options.first().click();
  await expect(cue).toBeVisible({ timeout: clipMs });
  await expect(state).toHaveCount(0, { timeout: GOAL_FEEDBACK_CONFIG.holdMs + 3000 });
  const shown = await trail();
  // The clip opens by going back to its build-up: the instant before is the original's entry.
  const opened = shown.findIndex((value, i) => i > 0 && Number(value) < Number(shown[i - 1]));
  expect(opened).toBeGreaterThan(0);
  const entry = shown[opened - 1]!;
  expect(Number(entry)).toBeGreaterThan(Number(original));
  expect(Number(shown[opened])).toBeGreaterThanOrEqual(opening.from - 0.01);
  // It plays up to its goal and holds there, never past it, until it returns.
  const held = goals[0]!.seconds.toFixed(2);
  const back = shown.findIndex((value, i) => i > opened && Number(value) > Number(held));
  expect(back).toBeGreaterThan(opened);
  expect(shown.slice(opened, back)).toContain(held);
  // The first instant back is exactly the entry: none of the clip's time is caught up.
  expect(shown[back]).toBe(entry);
  // Then the original runs on from there at its own speed.
  await expect.poll(seconds).toBeGreaterThan(Number(entry));
  await expect(speed(4)).toHaveAttribute('aria-checked', 'true');
  expect(await cues()).toBe(3);
  // Presentation only: no save, result or date changes.
  expect(await savedRaw(page)).toBe(settled);
  await expect(theatre.getByTestId('game-date')).toHaveText(date);

  // A final-minute goal of the completed match replays without completing it again.
  await page.getByTestId('match-next-action').click();
  await expect(page.getByTestId('match-next-action')).toHaveAccessibleName('홈으로');
  const finished = await savedRaw(page);
  const finishedDate = await theatre.getByTestId('game-date').innerText();
  await open.click();
  await expect(options).toHaveCount(goals.length);
  await options.last().click();
  await expect(state).toBeVisible();
  await expect(page.getByTestId('match-next-action')).toHaveAccessibleName('홈으로');
  await expect(state).toHaveCount(0, { timeout: clipMs + GOAL_FEEDBACK_CONFIG.holdMs });
  await expect(score).toHaveText(`${playback.record.score.home} : ${playback.record.score.away}`);
  await expect(page.getByTestId('match-next-action')).toHaveAccessibleName('홈으로');
  expect(await savedRaw(page)).toBe(finished);
  await expect(theatre.getByTestId('game-date')).toHaveText(finishedDate);

  // A minute-only archived record offers its goals by the existing moment navigation.
  await page.getByTestId('match-next-action').click();
  const record = await openRecordedMatch(page);
  await expect(record).toBeVisible();
  const archivedSave = await savedRaw(page);
  await record.getByTestId('goal-replay-open').click();
  await expect(picker).toBeVisible();
  await expect(options).toHaveCount(goals.length);
  for (const option of await options.all())
    await expect(option).toHaveAttribute('data-footage', 'false');
  await expect(picker.getByTestId('goal-replay-unavailable')).toBeVisible();
  const second = playback.record.highlights.filter((goal) => goal.action === '골')[1]!;
  await options.nth(1).click();
  await expect(picker).toHaveCount(0);
  await expect(record.getByTestId('goal-replay-state')).toHaveCount(0);
  await expect(record.getByTestId('match-latest-event').locator('span')).toHaveText(
    `${second.minute}′`,
  );
  // The existing seek pauses there and changes nothing.
  const archived = record.getByLabel('22명의 선수와 공으로 표현하는 경기');
  const at = await archived.getAttribute('data-seconds');
  await page.waitForTimeout(400);
  expect(await archived.getAttribute('data-seconds')).toBe(at);
  expect(await savedRaw(page)).toBe(archivedSave);
});
