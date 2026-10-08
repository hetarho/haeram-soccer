import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 360, height: 740 } });

test('filters the own-club fixture notebook and reads a settled full-season record', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await page.getByTestId('hub-play').click();
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  await page
    .getByRole('navigation', { name: '모바일 게임 메뉴' })
    .getByRole('button', { name: '리그', exact: true })
    .click();
  await page.getByText('우리 팀 일정 노트', { exact: true }).click();
  const notebook = page.getByRole('region', { name: '우리 팀 일정 노트', exact: true });
  await notebook.getByLabel('일정 홈 원정').selectOption('away');
  const cards = notebook.getByTestId('fixture-card');
  expect(await cards.count()).toBeGreaterThan(0);
  for (const card of await cards.all()) await expect(card).toContainText('원정');
  await notebook.getByLabel('일정 홈 원정').selectOption('all');
  await notebook.getByLabel('일정 진행 상태').selectOption('completed');
  await expect(cards).toHaveCount(1);
  const date = await page.getByTestId('game-date').innerText();
  await notebook.getByRole('button', { name: '이 경기 분석 보기' }).click();
  const sheet = page.getByRole('dialog', { name: '일정 경기 분석' });
  await expect(sheet.getByRole('region', { name: '경기 분석 리포트' })).toBeVisible();
  await sheet.getByRole('button', { name: '창 닫기', exact: true }).click();
  await expect(page.getByTestId('game-date')).toHaveText(date);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test('compares distinct own players with a shared scope and returns focus without progression', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await page
    .getByRole('navigation', { name: '모바일 게임 메뉴' })
    .getByRole('button', { name: '더보기', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: '전체 메뉴' })
    .getByRole('button', { name: '선수와 영입', exact: true })
    .click();
  const opener = page.getByRole('button', { name: '우리 선수 비교', exact: true });
  await opener.click();
  const sheet = page.getByRole('dialog', { name: '우리 선수 비교', exact: true });
  const a = sheet.getByLabel('비교 선수 A'),
    b = sheet.getByLabel('비교 선수 B');
  expect(await a.inputValue()).not.toBe(await b.inputValue());
  expect(
    await b
      .locator('option')
      .evaluateAll(
        (options, id) => options.some((o) => (o as HTMLOptionElement).value === id),
        await a.inputValue(),
      ),
  ).toBe(false);
  await sheet.getByLabel('비교 지표 범위').selectOption('career');
  await expect(sheet.getByLabel('비교 지표 범위')).toHaveValue('career');
  await expect(sheet.getByRole('region', { name: '두 선수 비교 결과' })).toContainText('실제 출전');
  for (const select of [a, b]) {
    await select.scrollIntoViewIfNeeded();
    expect((await select.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await sheet.getByRole('button', { name: '비교 마치기', exact: true }).click();
  await expect(opener).toBeFocused();
  await expect(page.getByTestId('game-date')).toHaveText('1901년 8월 1일');
});

test('filters player samples and shows scoped per-90 evidence on a mobile profile', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await page.getByTestId('hub-play').click();
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  await page
    .getByRole('navigation', { name: '모바일 게임 메뉴' })
    .getByRole('button', { name: '더보기', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: '전체 메뉴' })
    .getByRole('button', { name: '선수와 영입', exact: true })
    .click();
  await page.getByLabel('선수 포지션 필터').selectOption('FWD');
  await page.getByLabel('우리 선수 정렬').selectOption('goals90');
  await page.getByLabel('최소 출전 분').selectOption('90');
  const roster = page.locator('[class*="rosterCards"]');
  await roster.locator('article > button').first().click();
  const profile = page.getByRole('dialog', { name: '선수 상세 기록' });
  await expect(profile).toContainText('출전 90분');
  await expect(profile).toContainText('180분 미만');
  await expect(profile).toContainText('이번 시즌 · 모든 대회');
  await expect(profile).toContainText('90분당');
  await profile.getByRole('button', { name: '창 닫기', exact: true }).click();
  await page.getByLabel('최소 출전 분').selectOption('180');
  await expect(page.getByText('이 조건에 맞는 선수가 없어요.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test('jumps between recorded periods without changing the final result or calendar', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await page.getByTestId('hub-play').click();
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  const date = await page.getByTestId('game-date').innerText();
  const score = await page.getByTestId('match-score').locator('strong').innerText();
  await page.getByRole('button', { name: '경기 상세', exact: true }).click();
  await page.getByText('주요 장면 탐색', { exact: true }).click();
  const moments = page.getByRole('region', { name: '주요 장면 탐색', exact: true });
  const half = moments.getByRole('button', { name: '전반 종료 · 45분', exact: true });
  await half.click();
  await expect(page.getByTestId('pitch-theatre')).toContainText('45′');
  expect((await half.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByRole('button', { name: '재생', exact: true })).toBeVisible();
  await moments.getByRole('button', { name: '경기 종료 · 90분', exact: true }).click();
  await expect(page.getByTestId('match-score').locator('strong')).toHaveText(score);
  await expect(page.getByTestId('game-date')).toHaveText(date);
});

test('reveals the recorded match report only after choosing the final result', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await page.getByTestId('hub-play').click();
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  await page.getByRole('button', { name: '경기 상세', exact: true }).click();
  const report = page.getByRole('region', { name: '경기 분석 리포트', exact: true });
  await expect(report).toHaveCount(0);
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  await expect(report).toBeVisible();
  await expect(report).toContainText('정규 90분 최종 집계');
  await expect(report.getByRole('article')).toHaveCount(11);
  await expect(report).toContainText('패스 정확도');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test('compares tactical rules as previews while the applied tactic and date stay unchanged', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  const appliedText = await page
    .getByTestId('club-hub')
    .locator('[aria-label="다음 경기 준비"] p')
    .innerText();
  await page.getByRole('button', { name: '전술·선발 준비', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: '다음 경기 전술과 선발 준비' });
  await sheet.getByText('전술 실험실 · 네 가지 비교', { exact: true }).click();
  const lab = sheet.getByRole('region', { name: '전술 실험실', exact: true });
  await expect(lab.getByRole('article')).toHaveCount(4);
  await expect(lab).toContainText('0.0 pp');
  const press = lab.getByRole('button', { name: /압박 실험 미리보기$/ });
  await press.click();
  await expect(press).toHaveAttribute('aria-pressed', 'true');
  expect((await press.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await sheet.getByRole('button', { name: '준비 마치고 돌아가기', exact: true }).click();
  await expect(page.getByTestId('club-hub').locator('[aria-label="다음 경기 준비"] p')).toHaveText(
    appliedText,
  );
  await expect(page.getByTestId('game-date')).toHaveText('1901년 8월 1일');
});

test('opens evidence-based opponent scouting without progressing the world', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await page.getByRole('button', { name: '전술·선발 준비', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: '다음 경기 전술과 선발 준비' });
  const toggle = sheet.getByText('상대 스카우팅 노트', { exact: true });
  await toggle.click();
  const dossier = sheet.getByRole('region', { name: '상대 스카우팅' });
  await expect(dossier).toContainText('최근 30경기 안의 맞대결 · 0경기');
  await expect(dossier).toContainText('아직 완료한 리그 경기가 없어요.');
  expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await sheet.getByRole('button', { name: '준비 마치고 돌아가기', exact: true }).click();
  await expect(page.getByTestId('game-date')).toHaveText('1901년 8월 1일');
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(742);
});
