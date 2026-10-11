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
  await page.getByRole('tab', { name: '시즌 기록', exact: true }).click();
  await page.getByText('분석 데이터 내보내기', { exact: true }).click();
  const panel = page.getByRole('region', { name: '분석 데이터 내보내기', exact: true }),
    button = panel.getByRole('button', { name: 'CSV 내려받기', exact: true });
  await expect(button).toBeEnabled();
  const downloaded = page.waitForEvent('download');
  await button.click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe('haeram-matches-1950.csv');
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
  expect(players.suggestedFilename()).toBe('haeram-players-career-1950.csv');
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
  await expect(page.getByTestId('calendar')).toHaveText(/1951\/52 · 라운드 0$/);
  // A closed season no longer interrupts: its review waits in the league's season list.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '시즌 상세와 클럽 소식' })).toHaveCount(0);
  await page.getByRole('button', { name: '리그', exact: true }).first().click();
  await chooseOption(page.getByRole('combobox', { name: '리그 시즌', exact: true }), '1950');
  await expect(page.getByTestId('season-review')).toBeVisible();
  await expect(page.getByTestId('season-move')).toBeVisible();
  // The live tabs belong to the season in progress; a closed season keeps its pages in its own.
  await expect(page.getByRole('tablist', { name: '리그 보기' })).toHaveCount(0);
  const past = page.getByRole('tablist', { name: '지난 시즌 보기' }),
    pastTab = (name: string) => past.getByRole('tab', { name, exact: true });
  await expect(pastTab('결산')).toHaveAttribute('aria-selected', 'true');
  await pastTab('순위표').click();
  const table = page.getByRole('region', { name: '최종 순위표' });
  await expect(table).toContainText('Haeram');
  await expect(table.locator('tbody tr')).toHaveCount(16);
  await expect(page).toHaveURL(/season=1950&tab=table/);
  // A rival from that table opens its sheet with the all-time record against us.
  await table
    .getByRole('button', { name: /팀 정보$/ })
    .filter({ hasNotText: 'Haeram' })
    .first()
    .click();
  await expect(
    page.getByRole('dialog').getByRole('region', { name: '역대 상대 전적' }),
  ).toContainText(/\d+전 \d+승 \d+무 \d+패 · 득실 \d+:\d+/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await pastTab('우리 경기').click();
  const games = page.getByRole('region', { name: '우리 리그 경기' });
  await expect(games.getByRole('listitem')).toHaveCount(30);
  await games
    .getByRole('button', { name: /경기 리포트$/ })
    .first()
    .click();
  await expect(page.getByRole('dialog', { name: '경기 리포트' })).toContainText('경기 분석 리포트');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await pastTab('순위 추이').click();
  await expect(page.getByRole('heading', { name: '시즌 순위 추이' })).toBeVisible();
  // The bar takes the live bar's keys.
  await pastTab('순위 추이').press('ArrowRight');
  await expect(pastTab('득점 순위')).toBeFocused();
  await expect(pastTab('득점 순위')).toHaveAttribute('aria-selected', 'true');
  const scorers = page.getByRole('table', { name: '지난 시즌 득점 순위' });
  await expect(scorers).toBeVisible();
  const scorerRows = await scorers.locator('tbody tr').count();
  expect(scorerRows).toBeGreaterThan(0);
  expect(scorerRows).toBeLessThanOrEqual(10);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  // The arrow steps back to the season in progress; stepping back again keeps the closed tab.
  await expect(page.getByRole('button', { name: '이전 시즌', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '다음 시즌', exact: true }).click();
  await expect(page.getByRole('tablist', { name: '리그 보기' })).toBeVisible();
  await expect(past).toHaveCount(0);
  await expect(page.getByRole('button', { name: '다음 시즌', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '이전 시즌', exact: true }).click();
  await expect(pastTab('득점 순위')).toHaveAttribute('aria-selected', 'true');
  await expect(scorers).toBeVisible();
  // The tab bar (or the desktop sidebar) reaches every tab; the HUD menu lists only the rest.
  // The record book is on the records room's first tab, open rather than folded away.
  await page.getByRole('button', { name: '클럽 기록실', exact: true }).first().click();
  const book = page.getByRole('region', { name: '우리 클럽 기록집', exact: true });
  await expect(book).toContainText('완료한 1개 시즌');
  await expect(book).toContainText('최고 승점 페이스');
  const facts = await book.innerText();
  // A fresh page reads the same saved records. CI's software-rendered WebKit stalls its web
  // process after a reload of this long page (no paints, then the page closes ~30 s later), so
  // the old page closes, releasing the writer lock, and a new one opens on the records room.
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  const context = page.context();
  await page.close();
  const fresh = await context.newPage();
  await fresh.goto('/history');
  await expect(fresh.getByTestId('save-status')).toContainText('저장 완료');
  await expect(fresh.getByRole('region', { name: '우리 클럽 기록집', exact: true })).toHaveText(
    facts,
    { useInnerText: true },
  );
  expect(await horizontalOverflow(fresh)).toBeLessThanOrEqual(0);
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
  await page.getByRole('tab', { name: '시즌 기록', exact: true }).click();
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
  await expect(page.getByTestId('game-date')).toHaveText('1950년 8월 1일');
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
  // Position, order and sample sit behind the panel's view-settings button (a sheet on phones).
  const settings = page.getByRole('button', { name: /^선수 보기 설정/ });
  await settings.click();
  const sheet = page.getByRole('dialog', { name: '선수 보기 설정' });
  await sheet
    .getByRole('radiogroup', { name: '포지션' })
    .getByRole('radio', { name: 'FWD' })
    .click();
  await sheet
    .getByRole('radiogroup', { name: '정렬' })
    .getByRole('radio', { name: '90분당 득점' })
    .click();
  await sheet
    .getByRole('radiogroup', { name: '최소 표본' })
    .getByRole('radio', { name: '90분+' })
    .click();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(settings).toHaveAccessibleName('선수 보기 설정 · 3개 적용');
  await expect(page.getByTestId('roster-view-summary')).toHaveText('FWD · 90분당 득점 · 90분+');
  const detailTable = page.locator('details[class*="rosterDetails"]');
  await expect(detailTable.locator('table')).toHaveCount(0);
  await detailTable.getByText('전체 선수 지표 표 보기', { exact: true }).click();
  await expect(detailTable.locator('table')).toBeVisible();
  await detailTable.getByText('전체 선수 지표 표 보기', { exact: true }).click();
  await expect(detailTable.locator('table')).toHaveCount(0);
  const roster = page.locator('[class*="rosterCards"]');
  // A roster name opens that player's sheet, his club career first.
  const link = roster.getByRole('button', { name: / 선수 기록$/ }).first();
  const name = (await link.getAttribute('aria-label'))!.replace(/ 선수 기록$/, '');
  await link.click();
  const profile = page.getByRole('dialog', { name, exact: true });
  await expect(profile.getByRole('region', { name: '우리 클럽 통산' })).toContainText('출전 1경기');
  await expect(profile).toContainText('출전 90분');
  await expect(profile).toContainText('180분 미만');
  await expect(profile).toContainText('이번 시즌 · 모든 대회');
  await expect(profile).toContainText('90분당');
  await profile.getByRole('button', { name: '창 닫기', exact: true }).click();
  await settings.click();
  await sheet
    .getByRole('radiogroup', { name: '최소 표본' })
    .getByRole('radio', { name: '180분+' })
    .click();
  await page.keyboard.press('Escape');
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
  await expect(page.getByTestId('game-date')).toHaveText('1950년 8월 1일');
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
  await expect(page.getByTestId('game-date')).toHaveText('1950년 8월 1일');
  await expectHomeBounds(page);
});
