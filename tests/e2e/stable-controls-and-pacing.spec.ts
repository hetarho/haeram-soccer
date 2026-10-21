import { watchNext } from './watch';
import { delegateSales } from './events';
import { expect, test } from '@playwright/test';
import { chooseLevel } from './events';
test.use({ viewport: { width: 390, height: 844 } });

test('keeps home preparation stable over real automatic ticks and keeps running through preparation', async ({
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
  ).toBeEnabled();
  // Preparing never pauses the shared clock; only watching a match stops it.
  const date = await page.getByTestId('game-date').innerText();
  await expect(page.getByTestId('game-date')).not.toHaveText(date);
  await sheet.getByRole('button', { name: '준비 마치고 돌아가기', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('button', { name: '자동 진행 정지', exact: true })).toBeVisible();
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
  // A minute takes 4 s × its pace (mean 1, about 0.6–1.6): the first lasts well past 1.7 s and
  // ends within 4 × 1.6 s plus slack.
  await page.waitForTimeout(1700);
  await expect(page.getByTestId('pitch-theatre')).toContainText('1′');
  await expect(page.getByTestId('pitch-theatre')).toContainText('2′', { timeout: 8000 });
  for (const value of ['2×', '4×', '8×', '16×']) {
    const speed = speeds.getByRole('radio', { name: value, exact: true });
    await speed.click();
    await expect(speed).toHaveAttribute('aria-checked', 'true');
  }
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
