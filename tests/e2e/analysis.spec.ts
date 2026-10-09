import { chooseOption, selectOptions } from './select';
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { expectHomeBounds, horizontalOverflow } from './layout';

test.use({ viewport: { width: 360, height: 740 } });

test('downloads scoped analysis CSVs and disables empty competition samples on mobile', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await page.getByTestId('hub-play').click();
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  // The tab bar (or the desktop sidebar) reaches every tab; the HUD menu lists only the rest.
  await page.getByRole('button', { name: '클럽 기록실', exact: true }).first().click();
  await page.getByText('분석 데이터 내보내기', { exact: true }).click();
  const panel = page.getByRole('region', { name: '분석 데이터 내보내기', exact: true }),
    button = panel.getByRole('button', { name: 'CSV 내려받기', exact: true });
  await expect(button).toBeEnabled();
  const downloaded = page.waitForEvent('download');
  await button.click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe('haeram-matches-1901.csv');
  const csv = await readFile((await file.path())!, 'utf8');
  expect(csv.startsWith('\ufeff')).toBe(true);
  expect(csv).toContain('"fixture_id"');
  expect(csv.trim().split('\r\n')).toHaveLength(2);
  await chooseOption(page.getByRole('combobox', { name: '기록 대회 범위', exact: true }), 'europe');
  await expect(button).toBeDisabled();
  await chooseOption(
    panel.getByRole('combobox', { name: '분석 데이터 종류', exact: true }),
    'players',
  );
  await chooseOption(
    panel.getByRole('combobox', { name: '내보낼 선수 지표 범위', exact: true }),
    'career',
  );
  const playerDownload = page.waitForEvent('download');
  await button.click();
  const players = await playerDownload;
  expect(players.suggestedFilename()).toBe('haeram-players-career-1901.csv');
  expect((await readFile((await players.path())!, 'utf8')).trim().split('\r\n')).toHaveLength(19);
  expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test('reproduces earned season records after reload on mobile', async ({ page }) => {
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill('record-book-cycle');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await page
    .getByTestId('club-hub')
    .getByRole('button', { name: '시즌 상세', exact: true })
    .click();
  const journal = page.getByRole('dialog', { name: '시즌 상세와 클럽 소식' });
  await journal.getByRole('button', { name: '시즌 끝까지 진행', exact: true }).click();
  await expect(page.getByTestId('calendar')).toHaveText(/1902\/03 · 라운드 0$/);
  // The closed season opens its review in place of the sheet.
  await expect(page.getByTestId('season-review')).toBeVisible();
  await expect(journal).toHaveCount(0);
  // The tab bar (or the desktop sidebar) reaches every tab; the HUD menu lists only the rest.
  await page.getByRole('button', { name: '클럽 기록실', exact: true }).first().click();
  await page.getByText('우리 클럽 기록집', { exact: true }).click();
  const book = page.getByRole('region', { name: '우리 클럽 기록집', exact: true });
  await expect(book).toContainText('완료한 1개 시즌');
  await expect(book).toContainText('최고 승점 페이스');
  const facts = await book.innerText();
  await page.reload();
  await page.getByText('우리 클럽 기록집', { exact: true }).click();
  await expect(book).toHaveText(facts, { useInnerText: true });
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test('uses matching archive samples for season splits and competition filters', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await page.getByTestId('hub-play').click();
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  // The tab bar (or the desktop sidebar) reaches every tab; the HUD menu lists only the rest.
  await page.getByRole('button', { name: '클럽 기록실', exact: true }).first().click();
  const toggle = page.getByText('시즌 분석 · 홈과 원정', { exact: true });
  await toggle.click();
  const analysis = page.getByRole('region', { name: '선택 시즌 분석', exact: true });
  await expect(analysis.getByRole('article', { name: '전체 성적' })).toContainText('전체 · 1경기');
  await chooseOption(page.getByRole('combobox', { name: '기록 대회 범위', exact: true }), 'europe');
  await expect(analysis).toContainText('클럽대항전');
  await expect(analysis.getByRole('article', { name: '전체 성적' })).toContainText('전체 · 0경기');
  await chooseOption(page.getByRole('combobox', { name: '기록 대회 범위', exact: true }), 'all');
  await expect(analysis.getByRole('img', { name: /경기 득실차/ })).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

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
  await expect(page.getByRole('region', { name: '우리 팀 일정 노트', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: '순위표', exact: true }).click();
  const expand = page.getByRole('button', { name: /전체 \d+팀 순위 보기/ }).first();
  await expect(expand).toBeVisible();
  await expand.click();
  await expect(expand).toHaveCount(0);
  // The fixture notebook belongs to the league overview.
  await page.getByRole('tab', { name: '개요', exact: true }).click();
  await page.getByText('우리 팀 일정 노트', { exact: true }).click();
  const notebook = page.getByRole('region', { name: '우리 팀 일정 노트', exact: true });
  await chooseOption(notebook.getByRole('combobox', { name: '일정 홈 원정', exact: true }), 'away');
  const cards = notebook.getByTestId('fixture-card');
  expect(await cards.count()).toBeGreaterThan(0);
  for (const card of await cards.all()) await expect(card).toContainText('원정');
  await chooseOption(notebook.getByRole('combobox', { name: '일정 홈 원정', exact: true }), 'all');
  await chooseOption(
    notebook.getByRole('combobox', { name: '일정 진행 상태', exact: true }),
    'completed',
  );
  await expect(cards).toHaveCount(1);
  const date = await page.getByTestId('game-date').innerText();
  await notebook.getByRole('button', { name: '이 경기 분석 보기' }).click();
  const sheet = page.getByRole('dialog', { name: '일정 경기 분석' });
  await expect(sheet.getByRole('region', { name: '경기 분석 리포트' })).toBeVisible();
  await sheet.getByRole('button', { name: '창 닫기', exact: true }).click();
  await expect(page.getByTestId('game-date')).toHaveText(date);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test('compares distinct own players with a shared scope and returns focus without progression', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  // The tab bar (or the desktop sidebar) reaches every tab; the HUD menu lists only the rest.
  await page.getByRole('button', { name: '선수단', exact: true }).first().click();
  const opener = page.getByRole('button', { name: '우리 선수 비교', exact: true });
  await opener.click();
  const sheet = page.getByRole('dialog', { name: '우리 선수 비교', exact: true });
  const a = sheet.getByRole('combobox', { name: '비교 선수 A', exact: true }),
    b = sheet.getByRole('combobox', { name: '비교 선수 B', exact: true });
  expect(await a.getAttribute('data-value')).not.toBe(await b.getAttribute('data-value'));
  const leftId = await a.getAttribute('data-value');
  expect((await selectOptions(b)).some((option) => option.value === leftId)).toBe(false);
  await chooseOption(
    sheet.getByRole('combobox', { name: '비교 지표 범위', exact: true }),
    'career',
  );
  await expect(
    sheet.getByRole('combobox', { name: '비교 지표 범위', exact: true }),
  ).toHaveAttribute('data-value', 'career');
  await expect(sheet.getByRole('region', { name: '두 선수 비교 결과' })).toContainText('실제 출전');
  for (const select of [a, b]) {
    await select.scrollIntoViewIfNeeded();
    expect((await select.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
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
  // The tab bar (or the desktop sidebar) reaches every tab; the HUD menu lists only the rest.
  await page.getByRole('button', { name: '선수단', exact: true }).first().click();
  await chooseOption(page.getByRole('combobox', { name: '선수 포지션 필터', exact: true }), 'FWD');
  await chooseOption(
    page.getByRole('combobox', { name: '우리 선수 정렬', exact: true }),
    'goals90',
  );
  await chooseOption(page.getByRole('combobox', { name: '최소 출전 분', exact: true }), '90');
  const detailTable = page.locator('details[class*="rosterDetails"]');
  await expect(detailTable.locator('table')).toHaveCount(0);
  await detailTable.getByText('전체 선수 지표 표 보기', { exact: true }).click();
  await expect(detailTable.locator('table')).toBeVisible();
  await detailTable.getByText('전체 선수 지표 표 보기', { exact: true }).click();
  await expect(detailTable.locator('table')).toHaveCount(0);
  const roster = page.locator('[class*="rosterCards"]');
  await roster.locator('article > button').first().click();
  const profile = page.getByRole('dialog', { name: '선수 상세 기록' });
  await expect(profile).toContainText('출전 90분');
  await expect(profile).toContainText('180분 미만');
  await expect(profile).toContainText('이번 시즌 · 모든 대회');
  await expect(profile).toContainText('90분당');
  await profile.getByRole('button', { name: '창 닫기', exact: true }).click();
  await chooseOption(page.getByRole('combobox', { name: '최소 출전 분', exact: true }), '180');
  await expect(page.getByText('이 조건에 맞는 선수가 없어요.', { exact: true })).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
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
  await expect(report).toContainText('패스 성공률');
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test('compares tactical rules as previews while the applied tactic and date stay unchanged', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  const appliedText = await page.getByTestId('hub-preparation').innerText();
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
  await expect(page.getByTestId('hub-preparation')).toHaveText(appliedText);
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
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await sheet.getByRole('button', { name: '준비 마치고 돌아가기', exact: true }).click();
  await expect(page.getByTestId('game-date')).toHaveText('1901년 8월 1일');
  await expectHomeBounds(page);
});
