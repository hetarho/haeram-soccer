import { watchNext } from './watch';
import { delegateSales } from './events';
import { expect, test } from '@playwright/test';
import { chooseLevel } from './events';
import { createWorld } from '../../packages/engine/src/index';
import { importResponsibilityCareer } from './responsibility-fixtures';
test.use({ viewport: { width: 390, height: 844 } });

test('surveys every management destination during uninterrupted calendar play', async ({
  page,
}) => {
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
  const nav = page.getByRole('navigation', { name: '모바일 게임 메뉴' });
  const date = page.getByTestId('game-date');
  const stop = page.getByRole('button', { name: '자동 진행 정지', exact: true });
  await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
  const continues = async () => {
    await expect(stop).toBeEnabled();
    const before = await date.innerText();
    await expect(date).not.toHaveText(before);
  };
  for (const name of ['리그', '컵', '클럽 기록실']) {
    await nav.getByRole('button', { name, exact: true }).click();
    await continues();
  }
  await nav.getByRole('button', { name: '선수단·스태프', exact: true }).click();
  for (const name of ['선수', '이적시장', '감독', '스태프']) {
    await page.getByRole('tab', { name, exact: true }).click();
    await continues();
    if (name === '감독')
      await expect(
        page.getByRole('button', { name: '감독에게 제안하기', exact: true }),
      ).toBeDisabled();
    if (name === '이적시장')
      await expect(page.getByRole('button', { name: '영입 필터', exact: true })).toBeEnabled();
  }
  await nav.getByRole('button', { name: '훈련·육성', exact: true }).click();
  for (const name of ['1군 훈련', '유소년']) {
    await page.getByRole('tab', { name, exact: true }).click();
    await continues();
  }
  await page.getByRole('tab', { name: '1군 훈련', exact: true }).click();
  await page.getByRole('button', { name: /^수석코치에게 훈련 제안·강행/ }).click();
  const training = page.getByRole('dialog', { name: '수석코치 훈련 제안', exact: true });
  for (const action of await training.getByRole('button', { name: /제안 ·|강행 ·/ }).all())
    await expect(action).toBeDisabled();
  await training.getByRole('button', { name: '창 닫기', exact: true }).click();
  await nav.getByRole('button', { name: '구단 운영', exact: true }).click();
  for (const name of ['운영 방침', '시설', '재정', '후원', '구단 디자인', '구단주 사무실']) {
    await page.getByRole('tab', { name, exact: true }).click();
    await continues();
    if (name === '재정')
      await expect(page.getByRole('button', { name: '추가 출자', exact: true })).toBeDisabled();
    if (name === '구단주 사무실') {
      const office = page.getByTestId('owner-office');
      for (const button of await office.getByRole('button').all())
        await expect(button).toBeDisabled();
    }
    if (name === '구단 디자인') {
      await page.getByLabel('홈 색 코드', { exact: true }).fill('#ABCDEF');
      await expect(page.getByRole('button', { name: '적용', exact: true })).toBeDisabled();
    }
  }
  await stop.click();
  const office = page.getByTestId('owner-office');
  await expect(office.getByRole('button', { name: '전체 보고받기', exact: true })).toBeEnabled();
  await page.getByRole('tab', { name: '구단 디자인', exact: true }).click();
  await expect(page.getByRole('button', { name: '적용', exact: true })).toBeEnabled();
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
    .getByRole('button', { name: '전술·선발 준비', exact: true });
  await page.evaluate(() => {
    const prep = Array.from(document.querySelectorAll('[data-testid="club-hub"] button')).find(
      (e) => e.textContent?.trim() === '전술·선발 준비',
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
  const sheet = page.getByRole('dialog', { name: '다음 경기 전술과 선발 준비' });
  await expect(sheet).toBeVisible();
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

test('defaults to one minute per four seconds and provides five replay speeds', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await delegateSales(page);
  await watchNext(page);
  const speeds = page.getByRole('radiogroup', { name: '관전 속도', exact: true });
  await expect(speeds.getByRole('radio', { name: '1×', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(speeds.getByRole('radio')).toHaveText(['1×', '2×', '4×', '8×', '16×']);
  await expect(page.getByTestId('pitch-theatre')).toContainText('1′');
  // Every minute takes exactly 4 s at 1x, whatever happens in it (→WEB-32): the first is still on
  // after 2.5 s and over by 4 s plus slack.
  await page.waitForTimeout(2500);
  await expect(page.getByTestId('pitch-theatre')).toContainText('1′');
  await expect(page.getByTestId('pitch-theatre')).toContainText('2′', { timeout: 4000 });
  const minuteNow = async () =>
    Number(
      (await page.getByTestId('match-latest-event').locator('span').innerText()).match(/\d+/)![0],
    );
  for (const value of ['2×', '4×', '8×', '16×']) {
    const speed = speeds.getByRole('radio', { name: value, exact: true });
    // A speed change keeps the presented minute: it never jumps back to kick-off or ahead.
    const before = await minuteNow();
    await speed.click();
    await expect(speed).toHaveAttribute('aria-checked', 'true');
    const after = await minuteNow();
    expect(after).toBeGreaterThanOrEqual(before);
    expect(after).toBeLessThanOrEqual(before + 2);
  }
  // At 16x every minute lasts 250 ms, restarts and chances alike: 2 s cover about 8 minutes,
  // never a slowed set piece nor a skipped spell.
  // A goal's hold (→WEB-94) is real time outside running play: each one met takes its 1 s out.
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
  await page.waitForTimeout(2000);
  const covered = (await minuteNow()) - from;
  const holds = await page.evaluate(() => {
    const state = window as unknown as { goalSeen: { cues: number }; goalHeld: boolean };
    return state.goalSeen.cues + (state.goalHeld ? 1 : 0);
  });
  expect(covered).toBeGreaterThanOrEqual(5 - 4 * holds);
  expect(covered).toBeLessThanOrEqual(10);
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
