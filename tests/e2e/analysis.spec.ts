import { openPersonnel } from './personnel-navigation';
import { clubhouseDate, openClubRecords, openLeague } from './competition-navigation';
import { closeMatchDetails, openMatchDetails, watchNext } from './watch';
import { delegateSales } from './events';
import { finishSeason } from './season-progression';
import { openCurrentClubSeason, openSeasonReview, showRecordTabs } from './record-navigation';
import { chooseOption, selectOptions } from './select';
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { expectHomeBounds, horizontalOverflow } from './layout';
import { startCareer } from './start';

test.use({ viewport: { width: 360, height: 740 } });

test('downloads scoped analysis CSVs and disables empty competition samples on mobile', async ({
  page,
}) => {
  await page.goto('/');
  await startCareer(page);
  await delegateSales(page);
  await watchNext(page, { manual: true });
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  // The tab bar (or the desktop sidebar) reaches every tab; the HUD menu lists only the rest.
  await openClubRecords(page);
  await openCurrentClubSeason(page);
  await page.getByText('분석 데이터 내보내기', { exact: true }).click();
  const panel = page.getByRole('region', { name: '분석 데이터 내보내기', exact: true }),
    button = panel.getByRole('button', { name: 'CSV 내려받기', exact: true });
  await expect(button).toBeEnabled();
  const downloaded = page.waitForEvent('download');
  await button.click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe('haeram-matches-1930.csv');
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
  expect(players.suggestedFilename()).toBe('haeram-players-career-1930.csv');
  expect((await readFile((await players.path())!, 'utf8')).trim().split('\r\n')).toHaveLength(21);
  expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test('reproduces earned season records after reload on mobile', async ({ page }) => {
  await page.goto('/');
  const club = await startCareer(page, { seed: 'record-book-cycle' });
  await delegateSales(page);
  await finishSeason(page);
  await expect(page.getByTestId('calendar')).toHaveAttribute('data-season', '1931');
  await expect(page.getByTestId('game-round')).toHaveText('0');
  // A closed season no longer interrupts: its review waits in the league's season list.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '시즌 진행 도구' })).toHaveCount(0);
  await openLeague(page, 1930);
  await openSeasonReview(page);
  await expect(page.getByTestId('season-move')).toBeVisible();
  // Back to that season's league pages through the league's own season filter.
  await openLeague(page, 1930);
  // The live tabs belong to the season in progress; a closed season keeps its pages in its own.
  await expect(page.getByRole('tablist', { name: '리그 보기' })).toHaveCount(0);
  const past = page.getByRole('tablist', { name: '지난 시즌 보기' }),
    pastTab = (name: string) => past.getByRole('tab', { name, exact: true });
  await expect(pastTab('순위표')).toHaveAttribute('aria-selected', 'true');
  await pastTab('순위표').click();
  const table = page.getByRole('region', { name: '최종 순위표' });
  await expect(table).toContainText(club);
  // The English top flight of 1930/31: twenty clubs, each playing 38 league games.
  await expect(table.locator('tbody tr')).toHaveCount(20);
  // The season filter addresses the closed season with the tab it opened on.
  await expect(page).toHaveURL(/season=1930&view=table/);
  // A rival from that table opens its sheet with the all-time record against us.
  await table
    .getByRole('button', { name: /팀 정보$/ })
    .filter({ hasNotText: club })
    .first()
    .click();
  await expect(
    page.getByRole('dialog').getByRole('region', { name: '역대 상대 전적' }),
  ).toContainText(/\d+전 \d+승 \d+무 \d+패 · 득실 \d+:\d+/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await pastTab('일정·결과').click();
  const games = page.getByRole('region', { name: '우리 리그 경기' });
  await expect(games.getByRole('listitem')).toHaveCount(38);
  await games
    .getByRole('button', { name: /경기 리포트$/ })
    .first()
    .click();
  await expect(page.getByRole('dialog', { name: '경기 리포트' })).toContainText('경기 분석 리포트');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await pastTab('팀 기록').click();
  await page
    .getByRole('group', { name: '팀 기록 보기' })
    .getByRole('button', { name: '순위 추이', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: '시즌 순위 추이' })).toBeVisible();
  // The bar takes the live bar's keys.
  await pastTab('팀 기록').press('ArrowRight');
  await expect(pastTab('선수 기록')).toBeFocused();
  await expect(pastTab('선수 기록')).toHaveAttribute('aria-selected', 'true');
  const scorers = page.getByRole('table', { name: '지난 시즌 득점 순위' });
  await expect(scorers).toBeVisible();
  const scorerRows = await scorers.locator('tbody tr').count();
  expect(scorerRows).toBeGreaterThan(0);
  expect(scorerRows).toBeLessThanOrEqual(10);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  // The league's season filter holds the closed season beside this one, which opens current facts.
  const season = page.getByRole('combobox', { name: '시즌', exact: true });
  await expect(season).toHaveAttribute('data-value', '1930');
  expect((await selectOptions(season)).map((option) => option.value)).toEqual(['1931', '1930']);
  await openLeague(page);
  await expect(page.getByRole('tablist', { name: '리그 보기' })).toBeVisible();
  await expect(past).toHaveCount(0);
  // A closed season opens on the tab the live league shows.
  await page
    .getByRole('tablist', { name: '리그 보기' })
    .getByRole('tab', { name: '선수 기록', exact: true })
    .click();
  await openLeague(page, true);
  await expect(pastTab('선수 기록')).toHaveAttribute('aria-selected', 'true');
  await expect(scorers).toBeVisible();
  // The tab bar (or the desktop sidebar) reaches every tab; the HUD menu lists only the rest.
  // The record book is on the records room's first tab, under 기타 기록.
  await openClubRecords(page);
  // The records room returns to the season the league opened; its navigator leads back out.
  await showRecordTabs(page);
  await page.getByRole('tab', { name: '명예·최고기록', exact: true }).click();
  await page
    .getByRole('group', { name: '명예·최고기록 보기' })
    .getByRole('button', { name: '기타 기록', exact: true })
    .click();
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
  await fresh.getByRole('tab', { name: '명예·최고기록', exact: true }).click();
  await fresh
    .getByRole('group', { name: '명예·최고기록 보기' })
    .getByRole('button', { name: '기타 기록', exact: true })
    .click();
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
  await startCareer(page);
  await delegateSales(page);
  await watchNext(page, { manual: true });
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  // The tab bar (or the desktop sidebar) reaches every tab; the HUD menu lists only the rest.
  await openClubRecords(page);
  await openCurrentClubSeason(page);
  // The analysis is open from the start, so a competition filter shows at once.
  const analysis = page.getByRole('region', { name: '선택 시즌 분석', exact: true });
  const overall = analysis.getByRole('row', { name: /^전체/ });
  await expect(overall.getByRole('cell').first()).toHaveText('1');
  await chooseOption(page.getByRole('combobox', { name: '기록 대회 범위', exact: true }), 'europe');
  await expect(analysis).toContainText('클럽대항전');
  await expect(overall.getByRole('cell').first()).toHaveText('0');
  await chooseOption(page.getByRole('combobox', { name: '기록 대회 범위', exact: true }), 'all');
  await expect(analysis.getByRole('img', { name: /누적 득실차/ })).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test('filters the own-club fixture notebook and reads a settled full-season record', async ({
  page,
}) => {
  await page.goto('/');
  await startCareer(page);
  await delegateSales(page);
  await watchNext(page, { manual: true });
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  const date = await (await clubhouseDate(page)).innerText();
  await openLeague(page);
  await expect(page.getByRole('region', { name: '우리 팀 일정 노트', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: '순위표', exact: true }).click();
  const expand = page.getByRole('button', { name: /전체 \d+팀 순위 보기/ }).first();
  await expect(expand).toBeVisible();
  await expand.click();
  await expect(expand).toHaveCount(0);
  // The fixture notebook is the own-club lens under schedule/results.
  await page.getByRole('tab', { name: '일정·결과', exact: true }).click();
  await page
    .getByRole('group', { name: '일정·결과 보기' })
    .getByRole('button', { name: '우리 경기', exact: true })
    .click();
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
  await notebook.getByRole('button', { name: '이 경기 분석 보기' }).click();
  const sheet = page.getByRole('dialog', { name: '일정 경기 분석' });
  await expect(sheet.getByRole('region', { name: '경기 분석 리포트' })).toBeVisible();
  await sheet.getByRole('button', { name: '창 닫기', exact: true }).click();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  // Reading the notebook and its analysis advanced no day.
  await expect(await clubhouseDate(page)).toHaveText(date);
});

test('compares distinct own players with a shared scope and returns focus without progression', async ({
  page,
}) => {
  await page.goto('/');
  await startCareer(page);
  await delegateSales(page);
  // The tab bar (or the desktop sidebar) reaches every tab; the HUD menu lists only the rest.
  await openPersonnel(page, 'players');
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
  await expect(page.getByTestId('game-date')).toHaveText('1930.08.01');
});

test('filters player samples and shows scoped per-90 evidence on a mobile profile', async ({
  page,
}) => {
  await page.goto('/');
  await startCareer(page);
  await delegateSales(page);
  await watchNext(page, { manual: true });
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  // The tab bar (or the desktop sidebar) reaches every tab; the HUD menu lists only the rest.
  await openPersonnel(page, 'players');
  // Position, order and sample sit behind the panel's view-settings button (a sheet on phones).
  const settings = page.getByRole('button', { name: /^선수 보기 설정/ });
  await settings.click();
  const sheet = page.getByRole('dialog', { name: '선수 보기 설정' });
  await sheet
    .getByRole('radiogroup', { name: '포지션' })
    .getByRole('radio', { name: 'FW' })
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
  await expect(page.getByTestId('roster-view-summary')).toHaveText('FW · 90분당 득점 · 90분+');
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
  await startCareer(page);
  await delegateSales(page);
  await watchNext(page, { manual: true });
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  const date = await page.getByTestId('game-date').innerText();
  const score = await page.getByTestId('match-score').locator('strong').innerText();
  const details = await openMatchDetails(page);
  await details.getByText('주요 장면 탐색', { exact: true }).click();
  const moments = details.getByRole('region', { name: '주요 장면 탐색', exact: true });
  const half = moments.getByRole('button', { name: '전반 종료 · 45분', exact: true });
  await half.click();
  // Half-time opens the second half's first minute.
  await expect(page.getByTestId('pitch-theatre')).toContainText('46′ ·');
  // A 44 px target can lay out at 43.99997 px; compare whole pixels.
  expect(Math.round((await half.boundingBox())!.height)).toBeGreaterThanOrEqual(44);
  await expect(page.getByRole('button', { name: '재생', exact: true })).toHaveCount(0);
  // The result held the match still, so it plays on from half-time only at the speed chosen.
  await closeMatchDetails(page);
  await page.getByRole('radio', { name: '1×', exact: true }).click();
  await openMatchDetails(page);
  await details.getByText('주요 장면 탐색', { exact: true }).click();
  await moments.getByRole('button', { name: '경기 종료 · 90분', exact: true }).click();
  await expect(page.getByTestId('match-score').locator('strong')).toHaveText(score);
  await expect(page.getByTestId('game-date')).toHaveText(date);
});

test('reveals the recorded match report only after choosing the final result', async ({ page }) => {
  await page.goto('/');
  await startCareer(page);
  await delegateSales(page);
  await watchNext(page, { manual: true });
  await openMatchDetails(page);
  const report = page.getByRole('region', { name: '경기 분석 리포트', exact: true });
  await expect(report).toHaveCount(0);
  await closeMatchDetails(page);
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  await openMatchDetails(page);
  await expect(report).toBeVisible();
  await expect(report).toContainText('정규 90분 최종 집계');
  // Every own line that played gets a card: the starters and any substitutes, marked as such.
  const heading = report.getByRole('heading', { name: /^우리 선수 기여 · \d+명$/ });
  const lines = Number((await heading.innerText()).match(/(\d+)명/)![1]);
  expect(lines).toBeGreaterThanOrEqual(11);
  await expect(report.getByRole('article')).toHaveCount(lines);
  if (lines > 11) await expect(report).toContainText('교체 투입');
  await expect(report).toContainText('박스 진입');
  await expect(report).toContainText('패스 성공률');
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test("reads the manager's XI and matchday squad while the applied tactic and date stay unchanged", async ({
  page,
}) => {
  await page.goto('/');
  await startCareer(page);
  await delegateSales(page);
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await page.getByRole('button', { name: '상세 리포트', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: '다음 경기 상세 리포트' });
  await expect(sheet).toBeVisible();
  // The manager's XI in his formation, slot by slot, with its strength and fatigue (→CLUB-10).
  const lineup = sheet.getByRole('region', { name: '감독의 선발', exact: true });
  await expect(lineup.getByRole('group', { name: / 선발 배치$/ })).toBeVisible();
  await expect(lineup.getByLabel('선발 전력과 피로')).toContainText('선발 전력');
  await expect(lineup.getByLabel('선발 전력과 피로')).toContainText('평균 피로');
  const second = lineup.getByRole('button', { name: /^선발 2 · / });
  await second.click();
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  await expect(lineup.getByTestId('formation-slot-1')).toContainText('실효');
  // Nothing to compare or apply: the manager picks the tactic (→STAFF-22, WEB-21 withdrawn).
  await expect(sheet.getByRole('region', { name: '전술 실험실', exact: true })).toHaveCount(0);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  // Under the formation: the era's rule, the manager's substitutes, takers and who is out.
  const squad = sheet.getByRole('region', { name: '감독이 정한 경기 명단', exact: true });
  await expect(squad).toContainText('교체 없음 (1965년 이전)');
  await expect(squad.getByRole('definition').first()).toHaveText('없음');
  for (const taker of ['페널티킥', '직접 프리킥', '코너킥'])
    await expect(squad.getByRole('term').filter({ hasText: taker })).toBeVisible();
  await expect(squad.getByRole('definition').nth(1)).not.toHaveText('—');
  await expect(squad.getByRole('definition').last()).toHaveText('없음');
  await sheet.getByRole('button', { name: '확인하고 홈으로', exact: true }).click();
  await expect(page.getByTestId('game-date')).toHaveText('1930.08.01');
});

test('opens the manager report on the next match without progressing the world', async ({
  page,
}) => {
  await page.goto('/');
  await startCareer(page);
  await delegateSales(page);
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await page.getByRole('button', { name: '상세 리포트', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: '다음 경기 상세 리포트' });
  // The manager reports first, then both sides (us left, them right) and our meetings.
  await expect(sheet.getByRole('region', { name: '감독 보고' })).toContainText('나가겠습니다');
  for (const side of ['우리 팀', '상대 팀']) {
    const region = sheet.getByRole('region', { name: side, exact: true });
    await expect(region).toContainText('학파');
    await expect(region).toContainText('확인할 수 있는 경기 결과가 없어요.');
    await expect(region.getByRole('group', { name: / 스쿼드$/ })).toBeVisible();
  }
  const meetings = sheet.getByRole('region', { name: '최근 맞대결' });
  await expect(meetings).toContainText('최근 맞대결 · 0경기');
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await sheet.getByRole('button', { name: '확인하고 홈으로', exact: true }).click();
  await expect(page.getByTestId('game-date')).toHaveText('1930.08.01');
  await expectHomeBounds(page);
});
