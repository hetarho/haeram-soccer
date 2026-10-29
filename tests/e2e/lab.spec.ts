import { expect, test, type Page } from '@playwright/test';

/** Runs the current settings and waits for the run to finish. */
async function simulate(page: Page, count: string) {
  await page.getByRole('combobox', { name: '경기 수', exact: true }).selectOption(count);
  const run = page.getByRole('button', { name: '시뮬레이션', exact: true });
  await run.click();
  await expect(page.getByRole('button', { name: '취소', exact: true })).toBeHidden({
    timeout: 120_000,
  });
  await expect(run).toBeEnabled();
  await expect(page.getByRole('region', { name: '결과' })).toContainText(`${count}경기`);
}

async function setValue(page: Page, path: string, value: string) {
  await page.getByRole('searchbox', { name: '수치 검색' }).fill(path);
  const field = page.getByLabel(path, { exact: true });
  await field.fill(value);
  await field.press('Enter');
}

test('the lab watches a match in the game’s match view and replays it with edited values', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.goto('/lab');
  await expect(page.getByRole('heading', { name: '경기 실험실', exact: true })).toBeVisible();
  for (const name of ['좌측 팀', '우측 팀']) {
    const side = page.getByRole('region', { name, exact: true });
    await side.getByRole('button', { name: '생성', exact: true }).click();
    await expect(side.getByRole('row')).toHaveCount(1 + 20);
  }

  const watchBar = page.getByRole('region', { name: '관전', exact: true });
  const seed = watchBar.getByLabel('관전 시드', { exact: true });
  await seed.fill('e2e-watch');
  // The progress line names the seed being played.
  const preparing = watchBar.getByText(/ 경기를 치르는 중…$/);
  await watchBar.getByRole('button', { name: '관전', exact: true }).click();
  await expect(preparing).toHaveText('e2e-watch 경기를 치르는 중…');
  const theatre = page.getByTestId('pitch-theatre');
  await expect(theatre).toBeVisible({ timeout: 120_000 });
  await expect(theatre.getByLabel('22명의 선수와 공으로 표현하는 경기')).toBeVisible();
  const score = page.getByTestId('match-score');
  await expect(score).toContainText('좌측 팀');
  await expect(score).toContainText('우측 팀');

  // Pausing works as in the game's live view: a seek holds the instant, a speed resumes it.
  await page.getByRole('button', { name: '경기 상세', exact: true }).click();
  const timeline = page.getByRole('slider', { name: '경기 시간', exact: true });
  await expect.poll(async () => Number(await timeline.inputValue())).toBeGreaterThan(0);
  await timeline.press('Home');
  const sought = await timeline.inputValue();
  await page.waitForTimeout(350);
  await expect(timeline).toHaveValue(sought);
  await page.getByRole('radio', { name: '16×', exact: true }).click();
  await expect
    .poll(async () => Number(await timeline.inputValue()))
    .toBeGreaterThan(Number(sought));

  // 다시 보기 plays the same seed again with the edited value: a new playback from the start.
  await setValue(page, 'SHOT_CONFIG.saveShare', '0.9');
  await page.getByRole('button', { name: '다시 보기', exact: true }).click();
  await expect(preparing).toHaveText('e2e-watch 경기를 치르는 중…');
  await expect(preparing).toBeHidden({ timeout: 120_000 });
  await expect(seed).toHaveValue('e2e-watch');
  await expect(page.getByRole('slider', { name: '경기 시간', exact: true })).toBeHidden();

  // 새 경기 draws a new seed.
  await page.getByRole('button', { name: '새 경기', exact: true }).click();
  await expect(seed).not.toHaveValue('e2e-watch');
  await expect(preparing).toBeHidden({ timeout: 120_000 });
  await expect(theatre).toBeVisible();
});

test('the lab generates sides, edits values and compares runs against a baseline', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.goto('/lab');
  await expect(page.getByRole('heading', { name: '경기 실험실', exact: true })).toBeVisible();

  for (const name of ['좌측 팀', '우측 팀']) {
    const side = page.getByRole('region', { name, exact: true });
    const average = side.getByLabel(`${name} 평균 OVR`, { exact: true });
    await average.fill('70');
    await average.press('Enter');
    await side.getByRole('button', { name: '생성', exact: true }).click();
    await expect(side.getByText(/^선발 평균 OVR/)).toContainText('OVR 70.0');
    await expect(side.getByRole('row')).toHaveCount(1 + 20);
  }

  const left = page.getByRole('region', { name: '좌측 팀', exact: true });
  const first = left.getByLabel('좌측 팀 1번 OVR', { exact: true });
  await first.fill('90');
  await first.press('Enter');
  await expect(first).toHaveValue('90');
  await expect(left.getByText(/^선발 평균 OVR/)).not.toContainText('OVR 70.0');

  await setValue(page, 'SHOT_CONFIG.saveShare', '0.5');
  await expect(page.getByRole('region', { name: '엔진 수치' })).toContainText('변경 1개');

  await simulate(page, '1');
  await expect(page.getByText(/^좌측 팀 \d+ : \d+ 우측 팀$/)).toBeVisible();

  await simulate(page, '20');
  const kept = page.getByRole('region', { name: '지난 실행' });
  await expect(kept.getByRole('row')).toHaveCount(1 + 2);
  await kept.getByRole('row').nth(1).getByRole('button', { name: '기준으로 고정' }).click();
  await expect(kept.getByRole('row').nth(1)).toContainText('기준');

  await setValue(page, 'SHOT_CONFIG.saveShare', '0.6');
  await simulate(page, '20');
  const results = page.getByRole('region', { name: '결과' });
  await expect(results.getByRole('columnheader', { name: '기준', exact: true })).toBeVisible();
  await expect(results.getByRole('columnheader', { name: '차이', exact: true })).toBeVisible();
  await expect(kept.getByRole('row')).toHaveCount(1 + 3);

  // Settings and kept runs come back after a reload.
  await page.reload();
  await expect(kept.getByRole('row')).toHaveCount(1 + 3);
  await expect(page.getByRole('region', { name: '엔진 수치' })).toContainText('변경 1개');

  // The game links nowhere near the lab.
  await page.goto('/');
  await expect(page.getByRole('button', { name: '클럽 창단' })).toBeVisible();
  await expect(page.locator('a[href*="lab"]')).toHaveCount(0);
});
