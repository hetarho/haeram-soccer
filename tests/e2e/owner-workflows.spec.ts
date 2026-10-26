import { gameHud } from './layout';
import { marketRows, marketFilters, marketInfo, closeMarketPanel } from './market';
import { advanceOneRound } from './season-progression';
import { chooseOption } from './select';

import { expect, test, type Page } from '@playwright/test';
import { createWorld, simulateSeason } from '../../packages/engine/src/index';
import { settle } from './layout';
import { continueSlot, seedSlot } from './slots';
import { leaveOffice, officeTitle, openOfficeArea } from './office';

async function found(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill('owner-workflow-regression');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
}
const nav = (page: Page) => page.getByRole('navigation', { name: '모바일 게임 메뉴' });
/** 구단주 사무실 › 운영 방침, entered from home (→WEB-39). */
async function openOperations(page: Page) {
  await openOfficeArea(page, '운영 방침');
  await expect(page.getByTestId('view-scroller').getByTestId('strategy-board')).toBeVisible();
}

test('contextual-sheet-restores-candidate', async ({ page }) => {
  await found(page);
  await nav(page).getByRole('button', { name: '선수단·스태프', exact: true }).click();
  await page.getByRole('tab', { name: '이적시장', exact: true }).click();
  const filter = await marketFilters(page);
  const roles = filter.getByRole('group', { name: '영입 포지션 선택' });
  await roles.getByRole('button', { name: 'GK', exact: true }).click();
  await closeMarketPanel(page, '영입 필터');
  for (const row of await marketRows(page).all())
    await row.getByRole('button', { name: / 비교$/ }).click();
  await expect(page.locator('button[aria-label="선택한 2명 비교"]')).toBeEnabled();
  await marketInfo(page);
  const trigger = page.getByRole('button', { name: /^영입 기조/ });
  const url = page.url();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '영입 운영 방침', exact: true });
  await expect(dialog.getByRole('region', { name: '영입', exact: true })).toBeVisible();
  await expect(dialog.getByRole('region', { name: '재정', exact: true })).toHaveCount(0);
  expect(page.url()).toBe(url);
  await dialog.getByRole('radio', { name: '스카우팅 데이터 스카우팅', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(marketRows(page)).toHaveCount(2);
  for (const row of await marketRows(page).all())
    await expect(row).toHaveAttribute('data-line', 'GK');
  await expect(page.locator('button[aria-label="선택한 2명 비교"]')).toBeEnabled();
  await trigger.click();
  await dialog
    .getByTestId('strategy-draft')
    .getByRole('button', { name: '적용', exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  // The applied scouting level redraws the candidate list, so its rows may change; the GK filter
  // and both compared players, kept as their selection-time snapshots, stay (→WEB-43/77).
  await expect(marketRows(page).first()).toBeVisible();
  for (const row of await marketRows(page).all())
    await expect(row).toHaveAttribute('data-line', 'GK');
  await expect(page.locator('button[aria-label="선택한 2명 비교"]')).toBeEnabled();
  expect(page.url()).toBe(url);
  await trigger.click();
  await expect(
    dialog.getByRole('radio', { name: '스카우팅 데이터 스카우팅', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
});

test('department-sheet-preserves-other-drafts', async ({ page }) => {
  await found(page);
  await openOperations(page);
  const finance = page.getByRole('region', { name: '재정', exact: true });
  await finance.getByRole('button', { name: /어디서 벌고/ }).click();
  await finance.getByRole('radio', { name: '재정 기조 신중', exact: true }).click();
  await expect(page.getByTestId('strategy-draft')).toBeVisible();
  await leaveOffice(page);
  await nav(page).getByRole('button', { name: '선수단·스태프', exact: true }).click();
  await page.getByRole('tab', { name: '이적시장', exact: true }).click();
  await marketInfo(page);
  await page.getByRole('button', { name: /^영입 기조/ }).click();
  const sheet = page.getByRole('dialog', { name: '영입 운영 방침', exact: true });
  await sheet.getByRole('radio', { name: '스카우팅 데이터 스카우팅', exact: true }).click();
  await sheet
    .getByTestId('strategy-draft')
    .getByRole('button', { name: '적용', exact: true })
    .click();
  await expect(sheet).toHaveCount(0);
  await closeMarketPanel(page, '영입 정보');
  await openOperations(page);
  const draft = page.getByTestId('strategy-draft');
  await expect(draft).toBeVisible();
  await draft.getByRole('button', { name: /건 변경/ }).click();
  await expect(draft).toContainText('재정 기조 표준 → 신중');
  await expect(finance.getByRole('radio', { name: '재정 기조 표준', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByTestId('area-summary-scouting')).toContainText('데이터 스카우팅');
  await draft.getByRole('button', { name: '되돌리기', exact: true }).click();
  await expect(draft).toHaveCount(0);
});

test('retains an unapplied academy investment through a detour and discards it explicitly', async ({
  page,
}) => {
  await found(page);
  await nav(page).getByRole('button', { name: '훈련·육성', exact: true }).click();
  await page.getByRole('tab', { name: '유소년', exact: true }).click();
  await page.getByRole('button', { name: /^유소년 투자 · 유입 방식/ }).click();
  const youth = page.getByRole('region', { name: '유소년', exact: true });
  await youth.getByRole('radio', { name: '유소년 투자 육성 강화', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: '유소년 운영 방침', exact: true });
  await expect(sheet.getByTestId('strategy-draft')).toContainText(
    '유소년 투자 기본 운영 → 육성 강화',
  );
  await page
    .getByRole('dialog', { name: '유소년 운영 방침', exact: true })
    .getByRole('button', { name: '창 닫기', exact: true })
    .click();
  await expect(page.getByRole('dialog', { name: '유소년 운영 방침', exact: true })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: '유소년', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await openOperations(page);
  const draft = page.getByTestId('strategy-board').getByTestId('strategy-draft');
  await expect(draft).toContainText('유소년 투자 기본 운영 → 육성 강화');
  await expect(
    youth.getByRole('radio', { name: '유소년 투자 기본 운영', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await draft.getByRole('button', { name: '되돌리기', exact: true }).click();
  await expect(draft).toHaveCount(0);
  await leaveOffice(page);
  await nav(page).getByRole('button', { name: '훈련·육성', exact: true }).click();
  await openOperations(page);
  await expect(draft).toHaveCount(0);
});

test('a different game never inherits the first career policy draft', async ({ page }) => {
  await found(page);
  await openOperations(page);
  const youth = page.getByRole('region', { name: '유소년', exact: true });
  await youth.getByRole('button', { name: /아카데미 아이들을/ }).click();
  await youth.getByRole('radio', { name: '유소년 투자 육성 강화', exact: true }).click();
  await expect(page.getByTestId('strategy-draft')).toBeVisible();
  await leaveOffice(page);
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page
    .getByRole('dialog', { name: '설정' })
    .getByRole('button', { name: '게임 슬롯', exact: true })
    .click();
  await page
    .getByTestId('game-slots')
    .getByRole('listitem', { name: '슬롯 2 · 빈 슬롯' })
    .getByRole('button', { name: '새 게임' })
    .click();
  await page.getByLabel('클럽 이름').fill('Second Workflow Club');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(gameHud(page)).toContainText('Second Workflow Club', {
    timeout: 30000,
  });
  await openOperations(page);
  await settle(page);
  await expect(page.getByTestId('strategy-draft')).toHaveCount(0);
  await expect(page.getByTestId('area-summary-youth')).toContainText('기본 운영');
  await expect(page.getByRole('button', { name: /^← 돌아가기/ })).toHaveCount(0);
});

test('training exposes the team action first and opens its named responsible coach', async ({
  page,
}) => {
  await found(page);
  await nav(page).getByRole('button', { name: '훈련·육성', exact: true }).click();
  const focus = page.getByRole('region', { name: '훈련 방향', exact: true });
  const action = focus.getByRole('button', { name: /^수석코치에게 훈련 제안·강행/ });
  await expect(action).toBeInViewport();
  await expect(page.getByRole('list', { name: '훈련 방향별 효과' })).toHaveCount(0);
  await focus.getByRole('button', { name: / · 보기$/ }).click();
  const staff = page.getByRole('dialog', { name: '수석코치 선임', exact: true });
  await expect(staff).toBeVisible();
  await staff.getByRole('button', { name: '창 닫기', exact: true }).click();
  await page.getByRole('button', { name: '← 돌아가기 · 1군 훈련', exact: true }).click();
  await expect(page.getByTestId('training-focus')).toBeVisible();
});

test('a player profile leads to that player training and keeps the squad search', async ({
  page,
}) => {
  await found(page);
  await nav(page).getByRole('button', { name: '선수단·스태프', exact: true }).click();
  const playerLink = page
    .locator('[class*="rosterCards"] article')
    .first()
    .getByRole('button', { name: / 선수 기록$/ });
  const name = (await playerLink.getAttribute('aria-label'))!.replace(/ 선수 기록$/, '');
  await page.getByRole('textbox', { name: '선수 찾기' }).fill(name);
  await playerLink.click();
  await page
    .getByRole('dialog', { name, exact: true })
    .getByRole('button', { name: '이 선수 훈련 변경', exact: true })
    .click();
  const sheet = page.getByRole('dialog', { name: `${name} 개별 훈련`, exact: true });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: '창 닫기', exact: true }).click();
  await page.getByRole('button', { name: '← 돌아가기 · 선수', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '선수 찾기' })).toHaveValue(name);
});

test('recruitment needs open on demand and academy operations open their exact work', async ({
  page,
}) => {
  await found(page);
  await nav(page).getByRole('button', { name: '선수단·스태프', exact: true }).click();
  await page.getByRole('tab', { name: '이적시장', exact: true }).click();
  await expect(marketRows(page).first()).toBeVisible();
  const needs = page.getByRole('region', { name: '감독 영입 요청', exact: true });
  await expect(needs).toHaveCount(0);
  await marketInfo(page);
  await expect(needs).toBeVisible();
  await closeMarketPanel(page, '영입 정보');
  await nav(page).getByRole('button', { name: '훈련·육성', exact: true }).click();
  await page.getByRole('tab', { name: '유소년', exact: true }).click();
  await page.getByRole('button', { name: /유소년 시설 .*공사 보기/ }).click();
  await expect(page.getByTestId('facility-academy')).toBeVisible();
  // The office opened on 시설; leaving it returns to the academy that asked (→WEB-39/74).
  await expect(officeTitle(page)).toHaveText('시설');
  await leaveOffice(page);
  await expect(page.getByRole('tab', { name: '유소년', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('opens club seasons in records and retains the detail scope through league and cup visits', async ({
  page,
}) => {
  await found(page);
  await nav(page).getByRole('button', { name: '클럽 기록실', exact: true }).click();
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
  await page.getByRole('button', { name: '← 돌아가기 · 클럽 시즌 기록', exact: true }).click();
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
  await expect(
    page
      .getByRole('tablist', { name: '컵 대회', exact: true })
      .getByRole('tab', { name: '잉글랜드 컵', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: '← 돌아가기 · 클럽 시즌 기록', exact: true }).click();
  await expect(page).toHaveURL(/season=1950.*part=matches.*competition=cup/);
  await page.getByRole('button', { name: '← 시즌별 기록', exact: true }).click();
  await expect(list).toBeVisible();
  await expect(page).toHaveURL(/\/history$/);
  // Explicit undefined must clear a deep-linked initial year as well as an in-session pick.
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.goto('/history?season=1950');
  await expect(page.getByRole('combobox', { name: '기록 시즌', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '← 시즌별 기록', exact: true }).click();
  await expect(list).toBeVisible();
  await expect(page).toHaveURL(/\/history$/);
});

test('keeps a foreign league selected across all competition lenses without substituting our players', async ({
  page,
}) => {
  await found(page);
  await nav(page).getByRole('button', { name: '리그', exact: true }).click();
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
  await expect(players).not.toContainText('Haeram');
  await expect(page).toHaveURL(/league=GER\.0\.0/);
  await page.getByRole('tab', { name: '팀 기록', exact: true }).click();
  const teams = page.getByRole('table', { name: '리그 팀 기록표' });
  await expect(teams.getByRole('button', { name: firstClub!, exact: true })).toBeVisible();
  await expect(teams).not.toContainText('Haeram');
  await page
    .getByRole('group', { name: '팀 기록 보기' })
    .getByRole('button', { name: '순위 추이', exact: true })
    .click();
  await expect(page.getByRole('region', { name: '선택 리그 기록 안내' })).toContainText('독일 1부');
  await page.getByRole('button', { name: '우리 리그 기록 보기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '시즌 순위 추이' })).toBeVisible();
  await expect(page).not.toHaveURL(/league=/);
});

test('keeps the home briefing informational alongside the public clock and links the current club record', async ({
  page,
}) => {
  await found(page);
  const hub = page.getByTestId('club-hub');
  await expect(hub.getByRole('button', { name: '시즌 진행 도구', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '자동 진행 시작', exact: true })).toBeVisible();
  await hub.getByRole('button', { name: '시즌 상세', exact: true }).click();
  const briefing = page.getByRole('dialog', { name: '시즌 상세와 클럽 소식' });
  await expect(briefing.getByRole('button', { name: '한 라운드 진행', exact: true })).toHaveCount(
    0,
  );
  await expect(
    briefing.getByRole('heading', { name: '우리 팀의 순위 경쟁', exact: true }),
  ).toBeVisible();
  await briefing.getByRole('button', { name: '이번 시즌 구단 기록 →', exact: true }).click();
  await expect(briefing).toHaveCount(0);
  await expect(page).toHaveURL(/\/history\?season=1950/);
  await nav(page).getByRole('button', { name: '클럽 홈', exact: true }).click();
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
  const w = createWorld({
    country: 'ENG',
    name: 'Haeram Athletic',
    color: '#bf7956',
    seed: 'owner-workflow-regression',
    level: 'easy',
  });
  simulateSeason(w);
  simulateSeason(w);
  await page.setViewportSize({ width: 390, height: 844 });
  await seedSlot(page, w);
  await page.goto('/');
  await continueSlot(page);
  await expect(page.getByTestId('calendar')).toHaveAttribute('data-season', '1952');
  await expect(page.getByTestId('game-round')).toHaveText('0');
  await page.keyboard.press('Escape');
  await nav(page).getByRole('button', { name: '컵 대회', exact: true }).click();
  const competition = page.getByRole('tablist', { name: '컵 대회', exact: true });
  const period = page.getByRole('group', { name: '컵 대회 기간', exact: true });
  await period.getByRole('button', { name: '지난 시즌·역사', exact: true }).click();
  await chooseOption(page.getByRole('combobox', { name: '대진표 시즌', exact: true }), '1950');
  await competition.getByRole('tab', { name: 'European Cup', exact: true }).click();
  await expect(period.getByRole('button', { name: '지난 시즌·역사', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('region', { name: '컵 대회 역사', exact: true })).toContainText(
    '1955/56',
  );
  await expect(page.getByRole('tablist', { name: '역사를 볼 대회' })).toHaveCount(0);
  await competition.getByRole('tab', { name: '잉글랜드 컵', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '대진표 시즌', exact: true })).toHaveAttribute(
    'data-value',
    '1950',
  );
  await page.getByRole('button', { name: '이 시즌 구단 기록', exact: true }).click();
  await expect(page).toHaveURL(/\/history\?season=1950/);
  await page.getByRole('button', { name: '← 돌아가기 · 컵 대회', exact: true }).click();
  await expect(page).toHaveURL(/competition=cup&period=history&season=1950/);
  await expect(page.getByRole('combobox', { name: '대진표 시즌', exact: true })).toHaveAttribute(
    'data-value',
    '1950',
  );
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.goto('/europe?competition=cup&period=history&season=1940');
  await expect(page.getByRole('region', { name: '컵 대회 역사', exact: true })).toContainText(
    '1940/41 · 잉글랜드 컵의 대회 기록이 없어요.',
  );
  await page.getByRole('button', { name: '최근 기록된 시즌 보기', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '대진표 시즌', exact: true })).toHaveAttribute(
    'data-value',
    '1951',
  );
});

test('department sheet is readonly in a second tab and restores its task', async ({
  page,
  context,
}) => {
  await found(page);
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  const viewer = await context.newPage();
  try {
    await viewer.setViewportSize({ width: 390, height: 844 });
    await viewer.goto('/people?view=market');
    await expect(viewer.getByRole('region', { name: '선수 영입 데스크' })).toBeVisible();
    await marketInfo(viewer);
    const trigger = viewer.getByRole('button', { name: /^영입 기조/ });
    await trigger.click();
    const sheet = viewer.getByRole('dialog', { name: '영입 운영 방침', exact: true });
    await expect(sheet).toContainText('읽기 전용 상태에서는 방침을 적용할 수 없어요.');
    await expect(sheet.getByRole('radio').first()).toBeDisabled();
    const bounds = await sheet.evaluate((element) => ({
      width: element.clientWidth,
      scroll: element.scrollWidth,
    }));
    expect(bounds.scroll).toBeLessThanOrEqual(bounds.width + 1);
    await sheet.getByRole('button', { name: '창 닫기', exact: true }).click();
    await expect(trigger).toBeFocused();
  } finally {
    await viewer.close();
  }
});

test('recruitment support round-trips between department sheet and full board', async ({
  page,
}) => {
  await found(page);
  await nav(page).getByRole('button', { name: '선수단·스태프', exact: true }).click();
  await page.getByRole('tab', { name: '이적시장', exact: true }).click();
  await marketInfo(page);
  const trigger = page.getByRole('button', { name: /^영입 기조/ });
  const sheet = page.getByRole('dialog', { name: '영입 운영 방침', exact: true });
  await trigger.click();
  await expect(
    sheet.getByRole('radio', { name: '단장·감독 지원 균형', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await sheet.getByRole('radio', { name: '단장·감독 지원 단장 우선', exact: true }).click();
  await sheet
    .getByTestId('strategy-draft')
    .getByRole('button', { name: '적용', exact: true })
    .click();
  await expect(sheet).toHaveCount(0);
  await trigger.click();
  await expect(
    sheet.getByRole('radio', { name: '단장·감독 지원 단장 우선', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await sheet.getByRole('button', { name: '창 닫기', exact: true }).click();
  await closeMarketPanel(page, '영입 정보');
  await openOperations(page);
  const board = page.getByTestId('view-scroller').getByTestId('strategy-board');
  await expect(
    board.getByRole('radio', { name: '단장·감독 지원 단장 우선', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await board.getByRole('radio', { name: '단장·감독 지원 감독 우선', exact: true }).click();
  await board
    .getByTestId('strategy-draft')
    .getByRole('button', { name: '적용', exact: true })
    .click();
  await expect(board.getByTestId('strategy-draft')).toHaveCount(0);
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  await page
    .getByRole('region', { name: '영입', exact: true })
    .getByRole('button', { name: /어떤 선수를/ })
    .click();
  await expect(
    page.getByRole('radio', { name: '단장·감독 지원 감독 우선', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
});
