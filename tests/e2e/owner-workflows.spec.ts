import { openPersonnel } from './personnel-navigation';
import { clubhouseTab, openClubRecords, openCups, openLeague } from './competition-navigation';
import { enterOffice, openDirectionInForce } from './office';
import { marketRows, marketFilters, marketInfo, closeMarketPanel } from './market';
import { advanceOneRound } from './season-progression';
import { chooseOption } from './select';

import { expect, test, type Page } from '@playwright/test';
import { simulateSeason } from '../../packages/engine/src/index';
import { careerWorld } from '../../packages/engine/src/career.testkit';
import { continueSlot, seedSlot } from './slots';
import { startCareer } from './start';
import {
  clubSections,
  officeBar,
  operationsTabs,
  TEAM_WORK,
  teamEntry,
  teamReturn,
} from './office';

/** Takes the seed's first listed club over; returns its name. */
async function takeClubOver(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  return startCareer(page, { seed: 'owner-workflow-regression' });
}
/**
 * An office section is selected in the section bar while the clubhouse entry stays current; our
 * people's pages keep 팀 current, with its way back and no office bar. No room bar names either
 * (→WEB-10/43/112).
 */
async function expectSection(page: Page, section: string) {
  if (Object.hasOwn(TEAM_WORK, section)) {
    await expect(teamReturn(page)).toBeVisible();
    await expect(teamEntry(page)).toHaveAttribute('aria-current', 'page');
    await expect(clubSections(page)).toHaveCount(0);
    await expect(officeBar(page)).toHaveCount(0);
    return;
  }
  await expect(clubSections(page).getByRole('tab', { name: section, exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(clubhouseTab(page)).toHaveAttribute('aria-current', 'page');
  await expect(officeBar(page)).toHaveCount(0);
}
/** 구단 운영 › 재정·투자's direction in force, entered through the club sections (→WEB-110). */
async function openOperations(page: Page) {
  await openDirectionInForce(page);
  await expect(page.getByTestId('view-scroller').getByTestId('direction-areas')).toBeVisible();
}

test('market info reads the 영입 direction and restores the candidate work', async ({ page }) => {
  await takeClubOver(page);
  await openPersonnel(page, 'market');
  const filter = await marketFilters(page);
  await chooseOption(filter.getByRole('combobox', { name: '영입 포지션', exact: true }), 'line:GK');
  await closeMarketPanel(page, '영입 필터');
  await expect(marketRows(page).first()).toBeVisible();
  const selectedPage = await marketRows(page).evaluateAll((rows) =>
    rows.map((row) => row.getAttribute('data-candidate-id')),
  );
  for (const row of (await marketRows(page).all()).slice(0, 2))
    await row.getByRole('button', { name: / 비교$/ }).click();
  await expect(page.locator('button[aria-label="선택한 2명 비교"]')).toBeEnabled();
  const url = page.url();
  await marketInfo(page);
  // The 영입 area of the direction taken over with reads here; nothing edits it (→ECON-25, WEB-71).
  const info = page.getByRole('dialog', { name: '영입 정보', exact: true });
  for (const [row, value] of [
    ['scouting', '표준'],
    ['recruitment', '균형'],
    ['recruitmentSupport', '균형'],
  ] as const)
    await expect(info.locator(`[data-row="${row}"]`)).toContainText(value);
  await expect(info.getByRole('button', { name: /^영입 기조/ })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: '영입 업무 기준', exact: true })).toHaveCount(0);
  await closeMarketPanel(page, '영입 정보');
  expect(page.url()).toBe(url);
  await expect
    .poll(() =>
      marketRows(page).evaluateAll((rows) =>
        rows.map((row) => row.getAttribute('data-candidate-id')),
      ),
    )
    .toEqual(selectedPage);
  await expect(page.locator('button[aria-label="선택한 2명 비교"]')).toBeEnabled();
  const retainedFilter = await marketFilters(page);
  await expect(
    retainedFilter.getByRole('combobox', { name: '영입 포지션', exact: true }),
  ).toHaveAttribute('data-value', 'line:GK');
  await closeMarketPanel(page, '영입 필터');
});

test('the academy reads its investment and 유입 방식 as 재정·투자 does', async ({ page }) => {
  await takeClubOver(page);
  await openPersonnel(page, 'training');
  await openPersonnel(page, 'academy');
  const line = page.getByTestId('academy-direction');
  await expect(line).toContainText('유소년 투자 · 유입 방식');
  await expect(line).toContainText('기본 운영 · 표준');
  await expect(page.getByRole('button', { name: /^유소년 투자 · 유입 방식/ })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: '유소년 업무 기준', exact: true })).toHaveCount(0);
  await openOperations(page);
  const youth = page
    .getByTestId('direction-areas')
    .getByRole('region', { name: '유소년', exact: true });
  await expect(youth.locator('[data-row="academy"]')).toContainText('기본 운영');
  await expect(youth.locator('[data-row="youth"]')).toContainText('표준');
  await expect(youth.getByRole('radio')).toHaveCount(0);
});

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
])
  test(`training reads the team's call first and opens its named responsible coach at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await takeClubOver(page);
    await page.setViewportSize(viewport);
    await openPersonnel(page, 'training');
    const focus = page.getByRole('region', { name: '훈련 방향', exact: true });
    // The assistant's call in force reads first; the owner has no training action (→WEB-70).
    await expect(focus.getByTestId('training-focus')).toBeInViewport({ ratio: 1 });
    await expect(focus.getByTestId('training-focus')).toContainText('· 코치 판단');
    await expect(page.getByRole('button', { name: /훈련 제안·강행/ })).toHaveCount(0);
    await expect(page.getByRole('list', { name: '훈련 방향별 효과' })).toHaveCount(0);
    await focus.getByRole('button', { name: / · 보기$/ }).click();
    const staff = page.getByRole('dialog', { name: '수석코치 선임', exact: true });
    await expect(staff).toBeVisible();
    await staff.getByRole('button', { name: '창 닫기', exact: true }).click();
    // The coach's post opens in 코치진; 훈련 is entered again through its section tab.
    await expectSection(page, '코치진');
    await openPersonnel(page, 'training');
    await expect(page.getByTestId('training-focus')).toBeVisible();
  });

test('a player profile reads his training and keeps the squad search', async ({ page }) => {
  await takeClubOver(page);
  await openPersonnel(page, 'players');
  const playerLink = page
    .locator('[class*="rosterCards"] article')
    .first()
    .getByRole('button', { name: / 선수 기록$/ });
  const name = (await playerLink.getAttribute('aria-label'))!.replace(/ 선수 기록$/, '');
  await page.getByRole('textbox', { name: '선수 찾기' }).fill(name);
  await playerLink.click();
  const sheet = page.getByRole('dialog', { name, exact: true });
  // The assistant's call for him reads: a fresh, rested player trains with the squad, so his line
  // names the squad's focus as 팀 훈련 (코치 판단 only for a focus of his own); the owner changes
  // nothing (→CLUB-11, CLUB-13).
  await expect(sheet.getByTestId('player-training')).toHaveText(
    /^훈련 (균형 훈련|회복 훈련|하드 트레이닝) · 팀 훈련 · 팀과 같은 \1을\(를\) 소화해요\.$/,
  );
  await expect(sheet.getByRole('button', { name: '이 선수 훈련 변경', exact: true })).toHaveCount(
    0,
  );
  await sheet.getByRole('button', { name: '창 닫기', exact: true }).click();
  // 훈련 reads the same; the squad, entered again, keeps its search (→WEB-74).
  await openPersonnel(page, 'training');
  await expectSection(page, '훈련');
  await openPersonnel(page, 'players');
  await expect(page.getByRole('textbox', { name: '선수 찾기' })).toHaveValue(name);
});

test('recruitment needs open on demand and academy operations open their exact work', async ({
  page,
}) => {
  await takeClubOver(page);
  await openPersonnel(page, 'market');
  await expect(marketRows(page).first()).toBeVisible();
  const needs = page.getByRole('region', { name: '감독 영입 요청', exact: true });
  await expect(needs).toHaveCount(0);
  await marketInfo(page);
  await expect(needs).toBeVisible();
  await closeMarketPanel(page, '영입 정보');
  await openPersonnel(page, 'training');
  await openPersonnel(page, 'academy');
  await page.getByRole('button', { name: /유소년 시설 .*시설 보기/ }).click();
  await expect(page.getByTestId('facility-academy')).toBeVisible();
  // 구단 운영 opens on 재정·투자, where each facility's stage reads (→WEB-14, WEB-110).
  await expect(page).toHaveURL(/\/club-operations\?view=investment$/);
  await expect(
    operationsTabs(page).getByRole('tab', { name: '재정·투자', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  // The detour names its way back to the academy (→WEB-74).
  await page.getByRole('button', { name: '← 돌아가기 · 유소년', exact: true }).click();
  await expect(page).toHaveURL(/\/academy$/);
});

test('opens club seasons in records and retains the detail scope through league and cup visits', async ({
  page,
}) => {
  await takeClubOver(page);
  await openClubRecords(page);
  const list = page.getByRole('table', { name: '시즌별 기록' });
  await expect(list.locator('tr[aria-current="true"]')).toHaveCount(1);
  await expect(list).not.toContainText('진행 중');
  await list.getByRole('button').first().click();
  await page
    .getByRole('group', { name: '시즌 기록 보기' })
    .getByRole('button', { name: '경기', exact: true })
    .click();
  await chooseOption(page.getByRole('combobox', { name: '기록 대회 범위', exact: true }), 'cup');
  await page.getByRole('button', { name: '이 시즌 리그 순위표', exact: true }).click();
  await expect(page.getByRole('tab', { name: '순위표', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  // Records entered again keep the season with its view and scope (→WEB-74).
  await openClubRecords(page);
  await expect(page.getByRole('combobox', { name: '기록 대회 범위', exact: true })).toHaveAttribute(
    'data-value',
    'cup',
  );
  await expect(
    page
      .getByRole('group', { name: '시즌 기록 보기' })
      .getByRole('button', { name: '경기', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '이 시즌 컵 대회 기록', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '컵 대회', exact: true })).toHaveAttribute(
    'data-value',
    'cup:ENG',
  );
  await expect(page.getByRole('region', { name: '잉글랜드 컵', exact: true })).toBeVisible();
  await openClubRecords(page);
  await expect(page).toHaveURL(/season=1930.*part=matches.*competition=cup/);
  // The season opens under the records' tabs; 시즌별 기록 leads back to the list (→WEB-54).
  const seasons = page.getByRole('tab', { name: '시즌별 기록', exact: true });
  await seasons.click();
  await expect(list).toBeVisible();
  await expect(page).toHaveURL(/\/history\?section=club$/);
  // Explicit undefined must clear a deep-linked initial year as well as an in-session pick.
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.goto('/history?season=1930');
  await expect(page.getByRole('combobox', { name: '기록 시즌', exact: true })).toBeVisible();
  await seasons.click();
  await expect(list).toBeVisible();
  await expect(page).toHaveURL(/\/history\?section=club$/);
});

test('keeps a foreign league selected across all competition lenses without substituting our players', async ({
  page,
}) => {
  const club = await takeClubOver(page);
  await openLeague(page);
  await chooseOption(page.getByRole('combobox', { name: '국가', exact: true }), 'GER');
  const table = page.getByRole('table', { name: '리그 순위표' });
  const firstClub = await table
    .getByRole('button', { name: / 팀 정보$/ })
    .first()
    .getAttribute('aria-label');
  await page.getByRole('tab', { name: '선수 기록', exact: true }).click();
  // On the released model a foreign league's leaders come from its own season records (→T286).
  const players = page.getByRole('region', { name: '선수 세부 기록', exact: true });
  await expect(players.getByTestId('full-stats-coverage')).toContainText('시즌 전체 기록');
  await expect(page.getByRole('region', { name: '선택 리그 기록 안내' })).toHaveCount(0);
  await expect(players).not.toContainText(club);
  await expect(page).toHaveURL(/league=GER\.0\.0/);
  await page.getByRole('tab', { name: '팀 기록', exact: true }).click();
  const teams = page.getByRole('table', { name: '리그 팀 기록표' });
  await expect(teams.getByRole('button', { name: firstClub!, exact: true })).toBeVisible();
  await expect(teams).not.toContainText(club);
  await page
    .getByRole('group', { name: '팀 기록 보기' })
    .getByRole('button', { name: '순위 추이', exact: true })
    .click();
  await expect(page.getByRole('region', { name: '선택 리그 기록 안내' })).toContainText('독일 1부');
  await page.getByRole('button', { name: '우리 리그 기록 보기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '시즌 순위 추이' })).toBeVisible();
  await expect(page).not.toHaveURL(/league=/);
});

test('keeps the home briefing informational alongside the public clock and opens the current club record', async ({
  page,
}) => {
  await takeClubOver(page);
  const hub = page.getByTestId('club-hub');
  await expect(hub.getByRole('button', { name: '시즌 진행 도구', exact: true })).toHaveCount(0);
  await expect(hub.getByRole('button', { name: '한 라운드 진행', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '자동 진행 시작', exact: true })).toBeVisible();
  // The office holds its 결재함 and repeats no season journal (→WEB-39).
  await enterOffice(page);
  await expect(page.getByRole('button', { name: /클럽 소식/ })).toHaveCount(0);
  // The season in progress opens from the records room's season list (→WEB-54).
  await openClubRecords(page);
  const row = page.getByRole('button', { name: '1930/31 구단 시즌 기록 보기', exact: true });
  await row.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await row.click();
  await expect(page).toHaveURL(/\/history\?section=club&season=1930/);
  await clubhouseTab(page).click();
  await advanceOneRound(page);
  await expect(page.getByTestId('game-round')).toHaveText('1');
});

test('chooses a cup once and keeps its archived season through competition and club-record visits', async ({
  page,
}) => {
  // The journey reads two archived seasons. Simulating them here instead of through some two
  // hundred next-event clicks keeps it off WebKit's stalled web process on CI, which a journey
  // that long met in every attempt. On the released model the two seasons ran past the slow
  // 90 s budget on CI Chromium (run 40243569140).
  test.setTimeout(180_000);
  const w = careerWorld({ country: 'ENG', seed: 'owner-workflow-regression' });
  simulateSeason(w);
  simulateSeason(w);
  await page.setViewportSize({ width: 390, height: 844 });
  await seedSlot(page, w);
  await page.goto('/');
  await continueSlot(page);
  await expect(page.getByTestId('calendar')).toHaveAttribute('data-season', '1952');
  await expect(page.getByTestId('game-round')).toHaveText('0');
  await page.keyboard.press('Escape');
  await openCups(page);
  const competition = page.getByRole('combobox', { name: '컵 대회', exact: true }),
    season = page.getByRole('combobox', { name: '시즌', exact: true });
  await openCups(page, true);
  await expect(season).toHaveAttribute('data-value', '1951');
  await chooseOption(season, '1950');
  await chooseOption(competition, 'ucl');
  // No tab bar splits this season from past ones; the competition and season share one row.
  await expect(page.getByRole('tab', { name: '이전 컵대회 기록', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: '컵 대회 역사', exact: true })).toContainText(
    '1955/56',
  );
  await expect(page.getByRole('tablist', { name: '역사를 볼 대회' })).toHaveCount(0);
  await chooseOption(competition, 'cup:ENG');
  await expect(season).toHaveAttribute('data-value', '1950');
  await expect(page.getByTestId('cup-season-winner')).toContainText('1950/51');
  await page.getByRole('button', { name: '우리 구단 시즌 기록', exact: true }).click();
  await expect(page).toHaveURL(/\/history\?section=club&season=1950/);
  // Our season record's cup link leads back to that archived cup season (→WEB-54/74).
  await page.getByRole('button', { name: '이 시즌 컵 대회 기록', exact: true }).click();
  await expect(page).toHaveURL(/section=cup.*cup=cup.*season=1950/);
  await expect(season).toHaveAttribute('data-value', '1950');
  // The cups entered again open this season; the stepper's previous one is the latest closed.
  await openCups(page);
  await expect(season).toHaveAttribute('data-value', '1952');
  await openCups(page, true);
  await expect(page).toHaveURL(/section=cup.*cup=cup.*season=1951/);
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  // A season the cup has no record for settles on its latest recorded one.
  await page.goto('/europe?competition=cup&period=history&season=1940');
  await expect(season).toHaveAttribute('data-value', '1951');
  await expect(page).toHaveURL(/section=cup.*season=1951/);
  await expect(page.getByTestId('cup-season-winner')).toContainText('1951/52');
});
