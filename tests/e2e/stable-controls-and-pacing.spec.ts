import { openPersonnel } from './personnel-navigation';
import { openClubhouse, openLeague, openCups, openClubRecords } from './competition-navigation';
import { watchNext } from './watch';
import { delegateSales, proposeOnReport } from './events';
import { expect, test } from '@playwright/test';
import { chooseLevel } from './events';
import { advanceToNextMatch, createWorld } from '../../packages/engine/src/index';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { GOAL_FEEDBACK_CONFIG } from '../../apps/web/src/ui/goalFeedback';
import {
  deadBallBeats,
  presentationAdvance,
  presentationMs,
  presentationSamples,
  runningLength,
  WATCH_DEFAULT_SPEED,
  WATCH_MINUTE_MS,
} from '../../apps/web/src/ui/presentationClock';
import { expectCompressedPreparation, longPreparation } from './preparation';
import { leaveOffice, openOfficeArea } from './office';
test.use({ viewport: { width: 390, height: 844 } });

test('surveys every management destination during uninterrupted calendar play', async ({
  page,
}) => {
  // This survey waits for real dates across every management destination.
  test.slow();
  const world = createWorld({
    country: 'ENG',
    name: 'Calendar Audit',
    color: '#224466',
    seed: 'calendar-audit',
    level: 'easy',
  });
  for (const key of Object.keys(world.settings!.responsibilities) as (keyof NonNullable<
    typeof world.settings
  >['responsibilities'])[])
    world.settings!.responsibilities[key] = 'delegated';
  world.settings!.observations = { matchEve: false, windowOpen: false };
  world.cash = '999999999999';
  await importResponsibilityCareer(page, world);
  const date = page.getByTestId('game-date');
  const stop = page.getByRole('button', { name: '자동 진행 정지', exact: true });
  await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
  const continues = async () => {
    await expect(stop).toBeEnabled();
    const before = await date.innerText();
    await expect(date).not.toHaveText(before);
  };
  // Current League and Cup omit the information row (→WEB-18): the stop stays offered there, and
  // the clubhouse's date still moves after the visit, since a stopped clock would stay stopped.
  for (const open of [openLeague, openCups]) {
    await open(page);
    await expect(stop).toBeEnabled();
    await openClubhouse(page);
    await continues();
  }
  await openClubRecords(page);
  await continues();
  for (const view of ['players', 'market', 'manager', 'coaches', 'training', 'academy'] as const) {
    await openPersonnel(page, view);
    await continues();
    if (view === 'manager')
      await expect(
        page.getByRole('button', { name: '감독에게 제안하기', exact: true }),
      ).toBeDisabled();
    if (view === 'market')
      await expect(page.getByRole('button', { name: '영입 필터', exact: true })).toBeEnabled();
  }
  await openPersonnel(page, 'training');
  await page.getByRole('button', { name: /^수석코치에게 훈련 제안·강행/ }).click();
  const training = page.getByRole('dialog', { name: '수석코치 훈련 제안', exact: true });
  for (const action of await training.getByRole('button', { name: /제안 ·|강행 ·/ }).all())
    await expect(action).toBeDisabled();
  await training.getByRole('button', { name: '창 닫기', exact: true }).click();
  // The owner office shares the running-calendar lock and keeps stop available (→WEB-39/97).
  await openClubhouse(page);
  await continues();
  await openOfficeArea(page, '결재라인 모아보기');
  const office = page.getByTestId('owner-office');
  await expect(office.getByRole('button', { name: '전체 직접', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await continues();
  await openOfficeArea(page, '투자');
  await page.getByText('운영을 이어갈 추가 출자', { exact: true }).click();
  await expect(page.getByRole('button', { name: '추가 출자', exact: true })).toBeDisabled();
  await continues();
  await openOfficeArea(page, '구단 디자인');
  // A design commission opens to its colour steps, whose picks stay locked while the clock runs.
  await page.getByRole('button', { name: '변경 의뢰', exact: true }).click();
  const palette = page.getByRole('group', { name: '메인 색', exact: true });
  await expect(palette.getByRole('button')).not.toHaveCount(0);
  await expect(palette.getByRole('button', { disabled: false })).toHaveCount(0);
  await continues();
  // Leaving is also ordinary navigation; the clock continues.
  await leaveOffice(page);
  await continues();
  await stop.click();
});

test('keeps browsing available and management edits locked over real automatic ticks', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await delegateSales(page);
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  // Keep daily progress uninterrupted: level 4 stops for no match eve or offer.
  await chooseLevel(page, 4);
  const prepare = page
    .getByTestId('club-hub')
    .getByRole('button', { name: '상세 리포트', exact: true });
  await page.evaluate(() => {
    const prep = Array.from(document.querySelectorAll('[data-testid="club-hub"] button')).find(
      (e) => e.textContent?.trim() === '상세 리포트',
    )!;
    const probe = { changes: 0, prep };
    (window as typeof window & { controlProbe?: typeof probe }).controlProbe = probe;
    new MutationObserver((events) => {
      probe.changes += events.length;
    }).observe(prep, { attributes: true, attributeFilter: ['disabled', 'style', 'class'] });
  });
  await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
  const mode = page.getByRole('button', { name: /진행 방식 변경/ });
  await expect(mode).toBeDisabled();
  await mode.evaluate((button) => {
    const probe = { changes: 0 };
    Object.assign(window, { modeLockProbe: probe });
    new MutationObserver((events) => {
      probe.changes += events.length;
    }).observe(button, {
      attributes: true,
      attributeFilter: ['disabled'],
    });
  });
  // Real ticks can pass a date between polls; still require at least three days of progress.
  await expect
    .poll(
      async () => {
        const [year, month, day] = (await page.getByTestId('game-date').innerText())
          .match(/\d+/g)!
          .map(Number);
        return Date.UTC(year, month - 1, day);
      },
      { timeout: 10000 },
    )
    .toBeGreaterThanOrEqual(Date.UTC(1950, 7, 4));
  await expect(prepare).toBeEnabled();
  await expect(mode).toBeDisabled();
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { modeLockProbe: { changes: number } }).modeLockProbe.changes,
    ),
  ).toBe(0);
  expect(
    await page.evaluate(
      () => (window as typeof window & { controlProbe: { changes: number } }).controlProbe.changes,
    ),
  ).toBe(0);
  await prepare.click();
  const sheet = page.getByRole('dialog', { name: '다음 경기 상세 리포트' });
  await expect(sheet).toBeVisible();
  await proposeOnReport(sheet);
  await expect(
    sheet.getByRole('button', { name: '감독에게 전술 요청', exact: true }),
  ).toBeDisabled();
  // Inspection and local previews do not pause the clock or permit a management command.
  const date = await page.getByTestId('game-date').innerText();
  await expect(page.getByTestId('game-date')).not.toHaveText(date);
  await sheet.getByRole('button', { name: '준비 마치고 돌아가기', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('button', { name: '자동 진행 정지', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '자동 진행 정지', exact: true }).click();
  await expect(mode).toBeEnabled();
  await prepare.click();
  await expect(sheet).toBeVisible();
  await proposeOnReport(sheet);
  await expect(
    sheet.getByRole('button', { name: '감독에게 전술 요청', exact: true }),
  ).toBeEnabled();
  await sheet.getByRole('button', { name: '준비 마치고 돌아가기', exact: true }).click();
  await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
  await watchNext(page);
  const theatre = page.getByTestId('match-theatre');
  await expect(theatre).toBeVisible();
  // Watching stops the run while the match is on; leaving the match resumes it untouched.
  await expect(theatre.getByTestId('mini-clock')).toHaveCount(0);
  await expect(theatre.getByRole('combobox', { name: '진행 모드', exact: true })).toHaveCount(0);
  await theatre.getByRole('button', { name: '홈', exact: true }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await expect(page.getByRole('button', { name: '자동 진행 정지', exact: true })).toBeVisible();
});

/**
 * Marked synthetic career founded the way the build founds it (on the released full model since
 * T286), every responsibility delegated so nothing holds the watch: a reference run in Node plays
 * the same seeded match the page watches.
 */
function paceCareer() {
  const world = createWorld({
    country: 'ENG',
    name: 'Preparation Pace',
    color: '#224466',
    seed: 'stable-pace',
    level: 'easy',
  });
  for (const key of Object.keys(world.settings!.responsibilities) as (keyof NonNullable<
    typeof world.settings
  >['responsibilities'])[])
    world.settings!.responsibilities[key] = 'delegated';
  return world;
}

test('opens at 2x, one minute per 12 s at 1x, and provides five replay speeds', async ({
  page,
}) => {
  // The page plays the reference run's recorded match, so the first minute's real length is known.
  // That reference match is played in Node first, then about 20 s of timed playback follow; on the
  // released model CI Firefox ran past 30 s on both attempts (40262705063), as the sibling below.
  test.slow();
  const playback = advanceToNextMatch(paceCareer())!;
  await importResponsibilityCareer(page, paceCareer());
  await watchNext(page);
  const speeds = page.getByRole('radiogroup', { name: '관전 속도', exact: true });
  await expect(
    speeds.getByRole('radio', { name: `${WATCH_DEFAULT_SPEED}×`, exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(speeds.getByRole('radio')).toHaveText(['1×', '2×', '4×', '8×', '16×']);
  await expect(page.getByTestId('pitch-theatre')).toContainText('1′');
  // Running play takes 12 s a minute at 1x (→WEB-32), so 6 s at the 2x the match opens at; only a
  // dead-ball beat inside it would draw the minute shorter. The first minute shows until
  // the second minute's first sample: still on after 60% of that and over by its end plus slack.
  const { samples } = presentationSamples(playback.frames);
  const secondMinute = samples.find((sample) => sample.frame === 1)!.time;
  const openingMinuteMs = presentationMs(
    0,
    secondMinute,
    WATCH_DEFAULT_SPEED,
    deadBallBeats(playback.frames),
  );
  await page.waitForTimeout(openingMinuteMs * 0.6);
  await expect(page.getByTestId('pitch-theatre')).toContainText('1′');
  await expect(page.getByTestId('pitch-theatre')).toContainText('2′', {
    timeout: openingMinuteMs,
  });
  const minuteNow = async () =>
    Number(
      (await page.getByTestId('match-latest-event').locator('span').innerText()).match(/\d+/)![0],
    );
  for (const value of ['1×', '4×', '8×', '16×']) {
    const speed = speeds.getByRole('radio', { name: value, exact: true });
    // Account for play time spent handling the click, including at the fastest rate.
    const beforeAt = await page.evaluate(() => performance.now());
    const before = await minuteNow();
    await speed.click();
    await expect(speed).toHaveAttribute('aria-checked', 'true');
    const after = await minuteNow();
    const elapsed = await page.evaluate((from) => performance.now() - from, beforeAt);
    const elapsedMinutes = Math.ceil((elapsed * parseInt(value, 10)) / WATCH_MINUTE_MS);
    expect(after).toBeGreaterThanOrEqual(before);
    expect(after).toBeLessThanOrEqual(before + Math.max(2, elapsedMinutes));
  }
  // At 16x a minute of running play lasts 750 ms, restarts' kicks and chances alike, and each
  // stoppage's dead-ball beat (→WEB-32 r156) is drawn faster: 6 s cover about 8 minutes, at most
  // what the clock's own rule gives the busiest stretch of this match, never a skipped spell.
  // A goal's hold (→WEB-94) is real time outside running play: each one met takes its 1 s out.
  const fastMinuteMs = WATCH_MINUTE_MS / 16;
  const holdMinutes = GOAL_FEEDBACK_CONFIG.holdMs / fastMinuteMs;
  await page.evaluate(() => {
    const seen = { cues: 0 };
    new MutationObserver((records) => {
      for (const record of records)
        for (const added of record.addedNodes)
          if (added instanceof HTMLElement && added.dataset.testid === 'goal-cue') seen.cues++;
    }).observe(document.body, { childList: true, subtree: true });
    Object.assign(window, {
      goalSeen: seen,
      goalHeld: !!document.querySelector('[data-testid="goal-cue"]'),
    });
  });
  const from = await minuteNow();
  await page.waitForTimeout(8 * fastMinuteMs);
  const covered = (await minuteNow()) - from;
  const holds = await page.evaluate(() => {
    const state = window as unknown as { goalSeen: { cues: number }; goalHeld: boolean };
    return state.goalSeen.cues + (state.goalHeld ? 1 : 0);
  });
  expect(covered).toBeGreaterThanOrEqual(5 - holdMinutes * holds);
  const beats = deadBallBeats(playback.frames);
  const length = runningLength(playback.frames.length);
  let most = 0;
  for (let f = 0; f < playback.frames.length; f++)
    most = Math.max(
      most,
      presentationAdvance(f * 60, 8 * fastMinuteMs, 16, length, beats) / 60 - f,
    );
  expect(covered).toBeLessThanOrEqual(Math.ceil(most) + 2);
  await expect(page.getByRole('button', { name: /^(재생|일시정지|다시 보기)$/ })).toHaveCount(0);
  await page.getByRole('button', { name: '경기 상세', exact: true }).click();
  const timeline = page.getByRole('slider', { name: '경기 시간', exact: true });
  const beforeTap = Number(await timeline.inputValue());
  await page.getByLabel('22명의 선수와 공으로 표현하는 경기').click();
  await expect.poll(async () => Number(await timeline.inputValue())).toBeGreaterThan(beforeTap);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  // The displayed sample catches up to the stopped animation clock on its next UI update.
  await page.waitForTimeout(200);
  const hidden = await timeline.inputValue();
  await page.waitForTimeout(350);
  await expect(timeline).toHaveValue(hidden);
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect
    .poll(async () => Number(await timeline.inputValue()))
    .toBeGreaterThan(Number(hidden));
  await timeline.press('Home');
  const sought = await timeline.inputValue();
  await page.waitForTimeout(350);
  await expect(timeline).toHaveValue(sought);
  await speeds.getByRole('radio', { name: '16×', exact: true }).click();
  await expect
    .poll(async () => Number(await timeline.inputValue()))
    .toBeGreaterThan(Number(sought));
});

test('draws a set-piece preparation in about 1.5 s with the players travelling', async ({
  page,
}) => {
  // A reference run of the same seeded match finds a long corner, free kick or goal kick
  // preparation, and the page plays that recorded match (→WEB-32, MATCH-7/12).
  test.slow();
  const playback = advanceToNextMatch(paceCareer())!;
  const preparation = longPreparation(playback);
  await importResponsibilityCareer(page, paceCareer());
  await watchNext(page);
  await page.getByRole('button', { name: '경기 상세', exact: true }).click();
  // The same match: its sample count matches the reference within the few points Firefox and
  // WebKit may sample apart from Node; the seek itself goes by match time.
  const max = Number(
    await page.getByRole('slider', { name: '경기 시간', exact: true }).getAttribute('max'),
  );
  expect(
    Math.abs(max - (presentationSamples(playback.frames).samples.length - 1)),
  ).toBeLessThanOrEqual(10);
  await expectCompressedPreparation(page, playback, preparation);
});
