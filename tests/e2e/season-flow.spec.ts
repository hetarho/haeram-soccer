import { openLeague } from './competition-navigation';
import { closeMatchDetails, openMatchDetails, openPlayerSheet, watchNext } from './watch';
import { configureResponsibilities, dismissMatchReport } from './events';
import { chooseOption } from './select';
import { test, expect } from '@playwright/test';
import { horizontalOverflow } from './layout';
import { startCareer } from './start';

test('advances real days at each speed, stops and restores the saved calendar', async ({
  page,
}) => {
  // The paces are measured against match eves (level 2); this seed brings no offer before them.
  await page.goto('/');
  const club = await startCareer(page, { seed: 'season-flow' });
  await configureResponsibilities(page, {
    responsibilities: { recruitment: 'delegated', sales: 'delegated' },
  });
  const date = page.getByTestId('game-date');
  await expect(date).toHaveText('1930.08.01');
  const pace = page.getByRole('combobox', { name: '자동 진행 배속', exact: true });
  const play = () => page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
  // The daily pace is chosen and play starts the clock. The owner's stop first shows the days
  // computed ahead at the pace (→WEB-18), short of the first match; the date rests once play is
  // offered again, and the save on stopping holds it (→SAVE-8). Exact counts and beats are
  // covered by the controller's fake-clock tests.
  await chooseOption(pace, 'x1');
  await play();
  await expect(date).not.toHaveText('1930.08.01');
  await page.getByRole('button', { name: '자동 진행 정지' }).click();
  await expect(page.getByRole('button', { name: '자동 진행 시작', exact: true })).toBeEnabled();
  const stopped = await date.innerText();
  await expect(page.getByTestId('game-round')).toHaveText('0');
  await page.waitForTimeout(1200);
  await expect(date).toHaveText(stopped);
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  await expect(date).toHaveText(stopped);
  await expect(page.getByRole('button', { name: '자동 진행 시작' })).toBeVisible();
  // x10 runs on to the eve of our first match and the clock stops there.
  await chooseOption(pace, 'x10');
  await play();
  const eve = page.getByTestId('event-card');
  await expect(eve).toContainText('내일 경기');
  await expect(date).toHaveText('1930.08.07');
  await expect(page.getByRole('button', { name: '자동 진행 시작' })).toBeVisible();
  await expect(page.getByTestId('game-round')).toHaveText('0');
  // Playing the match through as a result keeps going until the following match eve.
  await eve.getByRole('button', { name: '결과만 보고 계속', exact: true }).click();
  await expect(page.getByTestId('game-round')).toHaveText('1');
  await expect(eve).toContainText('내일 경기');
  await expect(date).not.toHaveText('1930.08.07');
  await expect(page.getByRole('button', { name: '자동 진행 시작' })).toBeVisible();
  await dismissMatchReport(page);
  await openLeague(page);
  await page.getByRole('tab', { name: '순위표', exact: true }).click();
  await expect(page.getByRole('table', { name: '리그 순위표' })).toBeVisible();
  await expect(page.getByRole('table', { name: '리그 순위표' })).toContainText('우리 팀');
  await page.getByRole('tab', { name: '팀 기록', exact: true }).click();
  await page
    .getByRole('group', { name: '팀 기록 보기' })
    .getByRole('button', { name: '순위 추이', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: '시즌 순위 추이' })).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: '팀 기록', exact: true })).toContainText(club);
  await page.getByRole('tab', { name: '일정·결과', exact: true }).click();
  await expect(page.getByRole('heading', { name: '같은 라운드, 다른 경기' })).toBeVisible();
  await chooseOption(page.getByRole('combobox', { name: '리그 라운드 선택', exact: true }), {
    index: 0,
  });
  // Our league, the English top flight, plays ten games a round; the German one nine.
  await expect(
    page.getByRole('region', { name: '리그 라운드 결과' }).getByRole('listitem'),
  ).toHaveCount(10);
  await expect(
    page.getByRole('region', { name: '리그 라운드 결과' }).getByLabel('경기 예정'),
  ).toHaveCount(0);
  // Any league of the pyramid: its round, overview and table, then back to ours.
  const picker = page.getByRole('group', { name: '리그 선택' });
  await chooseOption(picker.getByRole('combobox', { name: '국가', exact: true }), 'GER');
  await expect(page.getByRole('heading', { name: '라운드 결과', exact: true })).toBeVisible();
  await expect(
    page.getByRole('region', { name: '리그 라운드 결과' }).getByRole('listitem'),
  ).toHaveCount(9);
  await expect(page).toHaveURL(/league=GER\.0\.0/);
  await page.getByRole('tab', { name: '순위표', exact: true }).click();
  // The compact competition header keeps the chosen league visible in its selectors (→WEB-40/65).
  await expect(picker.getByRole('combobox', { name: '국가', exact: true })).toHaveText('GER');
  await expect(picker.getByRole('combobox', { name: '디비전', exact: true })).toHaveText('1부');
  await page.getByRole('tab', { name: '순위표', exact: true }).click();
  await expect(page.getByRole('table', { name: '리그 순위표' })).not.toContainText('우리 팀');
  // Our country again returns to our league (→WEB-65).
  await chooseOption(picker.getByRole('combobox', { name: '국가', exact: true }), 'ENG');
  await expect(page.getByRole('table', { name: '리그 순위표' })).toContainText('우리 팀');
  await expect(page).not.toHaveURL(/league=/);
  await page.getByRole('tab', { name: '선수 기록', exact: true }).click();
  await page
    .getByRole('group', { name: '선수 기록 보기' })
    .getByRole('button', { name: '득점 순위', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: '득점왕 경쟁' })).toBeVisible();
  await expect(page.getByRole('table', { name: '리그 득점 순위표' })).toBeVisible();
  await page.getByRole('tab', { name: '선수 기록', exact: true }).click();
  await page
    .getByRole('group', { name: '선수 기록 보기' })
    .getByRole('button', { name: '득점왕 추이', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: '득점왕 추이' })).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: '득점 추이 선수 선택', exact: true }),
  ).toBeVisible();
});

test('shows independent player decisions and post-match league context', async ({ page }) => {
  // Two watched matches on the released model; CI Firefox ran past 30 s twice (40262705063).
  test.slow();
  await page.goto('/');
  await startCareer(page, { seed: 'motion-observation' });
  // The first match's injury opens a director–manager mediation; the staff settle it here, so
  // the next watch is not held for an owner decision this journey is not about.
  await configureResponsibilities(page, { responsibilities: { recruitment: 'delegated' } });
  await watchNext(page);
  await expect(
    page.getByTestId('match-theatre').getByRole('heading', { name: '매치데이' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: '경기 뒤의 순위표' })).toHaveCount(0);
  // A tapped player's decision opens in his own sheet, holding the match until it closes.
  await page.getByRole('radio', { name: '1×', exact: true }).click();
  const sheet = await openPlayerSheet(page);
  await expect(sheet.getByTestId('player-inspector').locator('p > b')).not.toBeEmpty();
  await sheet.getByRole('button', { name: '창 닫기', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await page.getByRole('button', { name: '결과 보기' }).click();
  await expect(page.getByText(/90(\+\d+)?′ ·.*경기 종료/)).toBeVisible();
  // The standing after the match shows once it ends, without opening its details (→WEB-50).
  await expect(page.getByRole('heading', { name: '경기 뒤의 순위표' })).toBeVisible();
  await expect(page.getByRole('table', { name: '리그 순위표' })).toContainText('우리 팀');
  // The result held the match still, so the kick-off seek keeps its place once the details close.
  const details = await openMatchDetails(page);
  await details.getByText('주요 장면 탐색', { exact: true }).click();
  await details.getByRole('button', { name: '킥오프 · 1분', exact: true }).click();
  await closeMatchDetails(page);
  await page.getByRole('radio', { name: '1×', exact: true }).click();
  await expect(page.getByText(/90(\+\d+)?′ ·.*경기 종료/)).toHaveCount(0);
  // While the replay plays the primary action reveals the result; then it watches the next match.
  await expect(page.getByTestId('match-next-action')).toHaveAccessibleName('결과 보기');
  await page.getByTestId('match-next-action').click();
  const beforeNext = await page.getByTestId('game-date').innerText();
  await watchNext(page);
  await expect(page.getByTestId('game-date')).not.toHaveText(beforeNext);
  await expect(page.getByTestId('match-next-action')).toBeEnabled();
  await expect(page.getByRole('heading', { name: '경기 뒤의 순위표' })).toHaveCount(0);
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '경기 뒤의 순위표' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});
