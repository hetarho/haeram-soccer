import { chooseOption } from './select';

import { expect, test, type Page } from '@playwright/test';
import { settle } from './layout';

async function found(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill('owner-workflow-regression');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
}
const nav = (page: Page) => page.getByRole('navigation', { name: '모바일 게임 메뉴' });
async function openOperations(page: Page) {
  await nav(page).getByRole('button', { name: '구단 운영', exact: true }).click();
  await expect(page.getByTestId('strategy-board')).toBeVisible();
}

test('keeps selected candidates and returns from the exact recruitment policy', async ({
  page,
}) => {
  await found(page);
  await nav(page).getByRole('button', { name: '선수단·스태프', exact: true }).click();
  await page.getByRole('tab', { name: '이적시장', exact: true }).click();
  const desk = page.getByRole('region', { name: '선수 영입 데스크' });
  const roles = desk.getByRole('group', { name: '영입 포지션 선택' });
  await roles.getByRole('button', { name: 'GK', exact: true }).click();
  for (const card of await desk.getByRole('article').all())
    await card.getByRole('button', { name: '비교', exact: true }).click();
  await expect(desk.getByRole('button', { name: '선택한 2명 비교' })).toBeEnabled();
  await desk.getByRole('button', { name: /^영입 기조/ }).click();
  const scouting = page.getByRole('region', { name: '영입', exact: true });
  await expect(scouting.getByRole('radiogroup', { name: '영입 기조' })).toBeVisible();
  const back = page.getByRole('button', { name: '← 돌아가기 · 이적시장', exact: true });
  await expect(back).toBeInViewport();
  await back.click();
  await expect(page.getByRole('tab', { name: '이적시장', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(roles.getByRole('button', { name: 'GK', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(desk.getByRole('button', { name: '선택한 2명 비교' })).toBeEnabled();
  await page.goBack();
  await expect(page.getByTestId('strategy-board')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('tab', { name: '이적시장', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
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
  const draft = page.getByTestId('strategy-draft');
  await expect(draft).toContainText('유소년 투자 기본 운영 → 육성 강화');
  await page.getByRole('button', { name: '← 돌아가기 · 유소년', exact: true }).click();
  await expect(page.getByRole('tab', { name: '유소년', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await openOperations(page);
  await expect(draft).toContainText('유소년 투자 기본 운영 → 육성 강화');
  await expect(
    youth.getByRole('radio', { name: '유소년 투자 기본 운영', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await draft.getByRole('button', { name: '되돌리기', exact: true }).click();
  await expect(draft).toHaveCount(0);
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
  await page.getByRole('button', { name: '전체 메뉴', exact: true }).click();
  await page
    .getByRole('dialog', { name: '전체 메뉴' })
    .getByRole('button', { name: '게임 슬롯', exact: true })
    .click();
  await page
    .getByTestId('game-slots')
    .getByRole('listitem', { name: '슬롯 2 · 빈 슬롯' })
    .getByRole('button', { name: '새 게임' })
    .click();
  await page.getByLabel('클럽 이름').fill('Second Workflow Club');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toContainText('Second Workflow Club', {
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

test('recruitment needs precede the candidate catalogue and academy operations open their exact work', async ({
  page,
}) => {
  await found(page);
  await nav(page).getByRole('button', { name: '선수단·스태프', exact: true }).click();
  await page.getByRole('tab', { name: '이적시장', exact: true }).click();
  const needs = page.getByRole('region', { name: '감독 영입 요청', exact: true });
  const candidate = page
    .getByRole('region', { name: '선수 영입 데스크' })
    .getByRole('article')
    .first();
  await settle(page);
  expect((await needs.boundingBox())!.y).toBeLessThan((await candidate.boundingBox())!.y);
  await nav(page).getByRole('button', { name: '훈련·육성', exact: true }).click();
  await page.getByRole('tab', { name: '유소년', exact: true }).click();
  await page.getByRole('button', { name: /유소년 시설 .*공사 보기/ }).click();
  await expect(page.getByTestId('facility-academy')).toBeVisible();
  await expect(page.getByRole('tab', { name: '시설', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('button', { name: '← 돌아가기 · 유소년', exact: true }).click();
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
  await expect(list).toContainText('진행 중');
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
  await page.getByRole('button', { name: '← 시즌 목록으로', exact: true }).click();
  await expect(list).toBeVisible();
  await expect(page).toHaveURL(/\/history$/);
  // Explicit undefined must clear a deep-linked initial year as well as an in-session pick.
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.goto('/history?season=1950');
  await expect(page.getByRole('combobox', { name: '기록 시즌', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '← 시즌 목록으로', exact: true }).click();
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
  await expect(page.getByRole('region', { name: '선택 리그 기록 안내' })).toContainText('독일 1부');
  await expect(page.getByRole('table', { name: '리그 득점 순위표' })).toHaveCount(0);
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

test('separates the home briefing from explicit progression tools and links the current club record', async ({
  page,
}) => {
  await found(page);
  const hub = page.getByTestId('club-hub');
  await expect(hub.getByRole('button', { name: '시즌 진행 도구', exact: true })).toBeInViewport();
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
  await hub.getByRole('button', { name: '시즌 진행 도구', exact: true }).click();
  const tools = page.getByRole('dialog', { name: '시즌 진행 도구', exact: true });
  await expect(tools).toContainText('승강·상금을 정산');
  await tools.getByRole('button', { name: '한 라운드 진행', exact: true }).click();
  await expect(page.getByTestId('calendar')).toContainText('라운드 1');
  await page.keyboard.press('Escape');
  await expect(tools).toHaveCount(0);
});

test('chooses a cup once and keeps its archived season through competition and club-record visits', async ({
  page,
}) => {
  await found(page);
  await page
    .getByTestId('club-hub')
    .getByRole('button', { name: '시즌 진행 도구', exact: true })
    .click();
  const tools = page.getByRole('dialog', { name: '시즌 진행 도구', exact: true });
  for (const year of [1951, 1952]) {
    await tools.getByRole('button', { name: '시즌 끝까지 진행', exact: true }).click();
    await expect(page.getByTestId('calendar')).toContainText(
      `${year}/${String(year + 1).slice(-2)} · 라운드 0`,
    );
  }
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
