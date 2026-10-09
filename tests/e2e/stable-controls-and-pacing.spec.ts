import { expect, test } from '@playwright/test';
import { stopOnlyFor } from './events';
test.use({ viewport: { width: 390, height: 844 } });

test('keeps both home controls stable over real automatic ticks and keeps running through preparation', async ({
  page,
}) => {
  // Keep daily progress uninterrupted: no match eve or offer may stop this run.
  await stopOnlyFor(page, []);
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  const watch = page.getByTestId('hub-play'),
    prepare = page
      .getByTestId('club-hub')
      .getByRole('button', { name: '전술·선발 준비', exact: true });
  await page.evaluate(() => {
    const watch = document.querySelector('[data-testid="hub-play"]')!;
    const prep = Array.from(document.querySelectorAll('[data-testid="club-hub"] button')).find(
      (e) => e.textContent?.trim() === '전술·선발 준비',
    )!;
    const probe = { changes: 0, watch, prep };
    (window as typeof window & { controlProbe?: typeof probe }).controlProbe = probe;
    new MutationObserver((events) => {
      probe.changes += events.length;
    }).observe(watch, { attributes: true, attributeFilter: ['disabled', 'style', 'class'] });
    new MutationObserver((events) => {
      probe.changes += events.length;
    }).observe(prep, { attributes: true, attributeFilter: ['disabled', 'style', 'class'] });
  });
  await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
  await expect(page.getByTestId('game-date')).toHaveText('1901년 8월 4일', { timeout: 10000 });
  await expect(watch).toBeEnabled();
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
  await watch.click();
  const theatre = page.getByTestId('match-theatre');
  await expect(theatre).toBeVisible();
  // Watching stops the run while the match is on; leaving the match resumes it untouched.
  const mini = page.getByTestId('mini-clock');
  await expect(mini.getByRole('button', { name: '자동 진행 시작', exact: true })).toBeVisible();
  await theatre.getByRole('button', { name: '홈', exact: true }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await expect(page.getByRole('button', { name: '자동 진행 정지', exact: true })).toBeVisible();
});

test('defaults to one minute per four seconds and provides five replay speeds', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await page.getByTestId('hub-play').click();
  const speeds = page.getByRole('radiogroup', { name: '관전 속도', exact: true });
  await expect(speeds.getByRole('radio', { name: '1×', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(speeds.getByRole('radio')).toHaveText(['1×', '2×', '4×', '8×', '16×']);
  await expect(page.getByTestId('pitch-theatre')).toContainText('1′');
  await page.waitForTimeout(1700);
  await expect(page.getByTestId('pitch-theatre')).toContainText('1′');
  await expect(page.getByTestId('pitch-theatre')).toContainText('2′', { timeout: 5000 });
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  for (const value of ['2×', '4×', '8×', '16×']) {
    const speed = speeds.getByRole('radio', { name: value, exact: true });
    await speed.click();
    await expect(speed).toHaveAttribute('aria-checked', 'true');
  }
  await expect(page.getByRole('button', { name: '재생', exact: true })).toBeVisible();
});
