import { test, expect, type Locator, type Page } from '@playwright/test';
import { chooseLevel } from './events';
import { horizontalOverflow } from './layout';
import { chooseOption } from './select';

/** The default seed's first season offers a firefighter among the four candidates. */
async function found(page: Page, seed = 'short-contract') {
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill(seed);
  await page.getByRole('button', { name: '쉬움' }).click();
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
}

const tab = (page: Page, name: string) =>
  page.getByRole('tablist', { name: '선수·스태프 보기' }).getByRole('tab', { name, exact: true });
/** 사람 from the tab bar or the sidebar; it opens on 선수. */
const openPeople = (page: Page) =>
  page.getByRole('button', { name: '선수·스태프', exact: true }).click();

/** Reads a decision's result card and closes it, so it no longer covers the tab bar. */
async function closeOutcome(page: Page, text: string) {
  const outcome = page.getByTestId('action-outcome');
  await expect(outcome).toContainText(text);
  await outcome.getByRole('button', { name: '확인', exact: true }).click();
  await expect(outcome).toHaveCount(0);
}

/** The free agents' list inside the manager market. */
const freeAgents = (market: Locator) =>
  market
    .locator('section')
    .filter({ has: market.page().getByRole('heading', { name: '자유계약 감독', exact: true }) });

/**
 * Hires the free-agent firefighter from the market the manager's 교체 opens, checking what the
 * dialog promises.
 */
async function hireFirefighter(page: Page) {
  await tab(page, '감독').click();
  await page.getByRole('button', { name: '교체', exact: true }).click();
  const market = page.getByRole('dialog', { name: '감독 교체' });
  await expect(market.getByRole('heading', { name: '다른 구단 감독 · 보상금 필요' })).toBeVisible();
  const card = freeAgents(market).getByRole('article').filter({ hasText: '소방수' });
  await expect(card).toContainText('계약 이번 시즌(1950/51) 끝까지');
  await expect(card).toContainText('선발 성향');
  await expect(card).not.toContainText('야망');
  const name = await card.getByRole('heading').innerText();
  await card.getByRole('button', { name: /^감독 선임 · / }).click();
  const dialog = page.getByRole('dialog', { name: '감독 선임 확인' });
  await expect(dialog).toContainText('시즌 종료까지 단기 계약');
  await expect(dialog).toContainText(
    '계약 이번 시즌(1950/51) 끝까지 · 남기려면 4월에 1시즌씩 재계약해요',
  );
  await dialog.getByRole('button', { name: '선임 확정', exact: true }).click();
  // Hiring closes the confirmation and the market, as a coach's hire closes his list.
  await expect(dialog).toHaveCount(0);
  await expect(market).toHaveCount(0);
  await closeOutcome(page, '새 감독을 선임했어요');
  // The man just hired leaves the market (→STAFF-17).
  await page.getByRole('button', { name: '교체', exact: true }).click();
  await expect(freeAgents(market).getByRole('article').first()).toBeVisible();
  await expect(market.getByRole('article').filter({ hasText: name })).toHaveCount(0);
  await market.getByRole('button', { name: '창 닫기' }).click();
  await expect(market).toHaveCount(0);
}

test.describe('사람 at 360x740', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('사람 tabs keep their address and the manager criteria preview a gegenpress pick', async ({
    page,
  }) => {
    await found(page);
    await page
      .getByRole('navigation', { name: '모바일 게임 메뉴' })
      .getByRole('button', { name: '선수·스태프', exact: true })
      .click();
    const tabs = page.getByRole('tablist', { name: '선수·스태프 보기' }).getByRole('tab');
    // The manager market sits behind the manager's 교체, not in a tab of its own (→WEB-43).
    await expect(tabs).toHaveText(['선수', '이적시장', '감독', '스태프']);
    await expect(tab(page, '선수')).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/\/people$/);
    for (const box of await tabs.evaluateAll((all) =>
      all.map((button) => button.getBoundingClientRect().height),
    ))
      expect(box).toBeGreaterThanOrEqual(44);
    await tab(page, '감독').click();
    await expect(page).toHaveURL(/\/people\?view=manager$/);
    // The manager's office shows what 육성 means; the coaches wait in their tab.
    await expect(page.getByText('27세 미만 선수 성장').first()).toBeVisible();
    await expect(page.getByRole('region', { name: '스태프', exact: true })).toHaveCount(0);
    expect(await horizontalOverflow(page)).toBe(0);
    // Arrow keys move along the tab bar like the operations tabs.
    await tab(page, '감독').focus();
    await page.keyboard.press('ArrowRight');
    await expect(tab(page, '스태프')).toBeFocused();
    await expect(tab(page, '스태프')).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/\/people\?view=coaches$/);
    expect(await horizontalOverflow(page)).toBe(0);

    await hireFirefighter(page);
    await tab(page, '감독').click();
    const renewal = page.getByTestId('manager-renewal');
    await expect(renewal).toContainText(
      '재계약하지 않으면 시즌이 끝날 때 떠나고 임시 감독이 팀을 맡아요.',
    );
    await expect(renewal).toContainText('계약 1951/52 시즌 끝까지');
    await expect(page.getByText(/1950년 부임 · 계약 이번 시즌\(1950\/51\) 끝까지/)).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
    await renewal.getByRole('button', { name: '재계약', exact: true }).click();
    await closeOutcome(page, '계약이 한 시즌 늘었어요');
    await expect(renewal).toHaveCount(0);
    await expect(page.getByText(/1950년 부임 · 계약 1951\/52 시즌 끝까지/)).toBeVisible();

    // A reload keeps the tab in the address.
    await tab(page, '스태프').click();
    await expect(page.getByTestId('coaching-mode')).toContainText('직접');
    await expect(page.getByTestId('save-status')).toContainText('저장 완료');
    await page.reload();
    await expect(tab(page, '스태프')).toHaveAttribute('aria-selected', 'true');
    // 감독 ends with who appoints, the rows the staff follow and whom they would appoint (→WEB-43).
    await tab(page, '감독').click();
    const post = page.getByRole('region', { name: '감독 선임 위임' });
    await expect(post).toBeVisible();
    await expect(post.getByRole('checkbox')).toHaveCount(0);
    await expect(post.getByTestId('decision-owner-manager')).toContainText('직접 결정');
    await expect(post.getByTestId('decision-owner-manager')).toContainText(
      '아래 방향은 개입 수준이 이 결정을 스태프에게 맡길 때만 쓰여요',
    );
    await expect(post.getByRole('button', { name: /^선호 학파 · 상관없음/ })).toBeVisible();
    const pick = post.getByTestId('manager-pick');
    await expect(pick).toContainText('지금 방향이면');
    // The rows are chosen on the 방향 board's 스태프 area.
    await post.getByRole('button', { name: /^감독 기조 · 표준/ }).click();
    const staffArea = page
      .getByTestId('strategy-board')
      .getByRole('region', { name: '스태프', exact: true });
    await staffArea.getByRole('radio', { name: '선호 학파 게겐프레싱', exact: true }).click();
    await staffArea.getByRole('radio', { name: '감독 기조 젊은 감독', exact: true }).click();
    const draft = page.getByTestId('strategy-draft');
    await expect(draft).toContainText('선호 학파 상관없음 → 게겐프레싱');
    await expect(draft).toContainText('감독 기조 표준 → 젊은 감독');
    expect(await horizontalOverflow(page)).toBe(0);
    await draft.getByRole('button', { name: '적용', exact: true }).click();
    await expect(draft).toHaveCount(0);
    await openPeople(page);
    await tab(page, '감독').click();
    await expect(post.getByRole('button', { name: /^선호 학파 · 게겐프레싱/ })).toBeVisible();
    // Whom the staff would appoint today: a gegenpress manager, or why nobody.
    await expect(pick).toContainText(/게겐프레싱|감독 기조에 맞는 감독이 없어/);
    expect(await horizontalOverflow(page)).toBe(0);

    // An old address of the candidates tab opens 감독 with the market open.
    await page.goto('/manager?view=candidates');
    await expect(tab(page, '감독')).toHaveAttribute('aria-selected', 'true');
    const market = page.getByRole('dialog', { name: '감독 교체' });
    await expect(freeAgents(market).getByRole('article').first()).toBeVisible();
    await expect(page).toHaveURL(/\/people\?view=manager$/);
    await market.getByRole('button', { name: '창 닫기' }).click();
    // The older staff addresses land on their tabs of 사람.
    await page.goto('/manager?view=coaches');
    await expect(tab(page, '스태프')).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/\/people\?view=coaches$/);
    await page.goto('/squad');
    await expect(tab(page, '선수')).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/\/people$/);
    expect(await horizontalOverflow(page)).toBe(0);
  });
});

test('an unrenewed firefighter leaves at the close and the alert opens the market', async ({
  page,
}) => {
  // Plays a whole season; slow CI browsers need longer.
  test.slow();
  await found(page);
  await openPeople(page);
  await hireFirefighter(page);
  await page.getByRole('button', { name: '클럽 홈', exact: true }).click();
  await page
    .getByTestId('club-hub')
    .getByRole('button', { name: '시즌 상세', exact: true })
    .click();
  await page.getByRole('button', { name: '시즌 끝까지 진행', exact: true }).click();
  await expect(page.getByTestId('calendar')).toHaveText(/1951\/52 · 라운드 0$/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '시즌 상세와 클럽 소식' })).toHaveCount(0);
  const alert = page.getByRole('status').filter({ hasText: '감독이 떠났어요' });
  await expect(alert).toContainText('임시 감독이 팀을 맡고 있어요');
  await alert.getByRole('button', { name: '감독 선임하러 가기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '선수·스태프', level: 2 })).toBeVisible();
  await expect(tab(page, '감독')).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/\/people\?view=manager$/);
  // The interim's market is open; it keeps at least four free agents (→STAFF-17).
  const market = page.getByRole('dialog', { name: '감독 선임' });
  await expect(market).toContainText('(임시 감독)');
  await expect(freeAgents(market).getByRole('article').first()).toBeVisible();
  expect(await freeAgents(market).getByRole('article').count()).toBeGreaterThanOrEqual(4);
});

test('with the manager post delegated a resignation is filled at once and the clock runs on', async ({
  page,
}) => {
  // This seed's founding manager is proud enough to resign over two strong demands (→STAFF-5).
  await found(page, 'proud-0');
  const date = page.getByTestId('game-date');
  await expect(date).toHaveText('1950년 8월 1일');
  // Level 4 hands the manager post to the staff and stops only for money, so nothing else
  // explains a stop.
  await chooseLevel(page, 4);
  await openPeople(page);
  await tab(page, '감독').click();
  await expect(page.getByTestId('decision-owner-manager')).toContainText('자동 결정');
  const founding = page.getByRole('heading', { name: 'William Hawkins', exact: true });
  await expect(founding).toBeVisible();
  for (const tactic of ['counter', 'press']) {
    await chooseOption(page.getByRole('combobox', { name: '요청 전술', exact: true }), tactic);
    await chooseOption(page.getByRole('combobox', { name: '요청 말투', exact: true }), 'demand');
    await page.getByRole('button', { name: '감독에게 제안하기', exact: true }).click();
    await closeOutcome(page, '감독에게 전술을 요청했어요');
  }
  await expect(page.locator('blockquote')).toContainText('감독의 사직서');
  // The staff appointed a free agent at once: no departure alert, no interim in charge.
  await expect(founding).toHaveCount(0);
  await expect(page.getByText('FIRST TEAM MANAGER', { exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '감독이 떠났어요' })).toHaveCount(0);
  await page.getByTestId('mini-clock').getByRole('button', { name: '자동 진행 시작' }).click();
  await expect(date).not.toHaveText('1950년 8월 1일');
  await expect(page.getByRole('status').filter({ hasText: '감독이 떠났어요' })).toHaveCount(0);
});

test('the 1 April card renews the firefighter in one tap', async ({ page }) => {
  // Runs the clock from August to April at the fastest pace. Level 2 keeps the manager's renewal
  // with the owner (from level 3 the staff take it →WEB-45); match eves, offers and the winter
  // window stop it on the way.
  test.slow();
  await found(page);
  await chooseLevel(page, 2);
  await openPeople(page);
  await hireFirefighter(page);
  await page.getByRole('button', { name: '클럽 홈', exact: true }).click();
  const progress = page.getByRole('region', { name: '시즌 진행', exact: true });
  const fastest = progress.getByRole('button', { name: '0.1초에 하루 속도 선택', exact: true });
  const play = progress.getByRole('button', { name: '자동 진행 시작', exact: true }),
    pause = progress.getByRole('button', { name: '자동 진행 정지', exact: true });
  const card = page.getByTestId('event-card');
  const renewal = '감독 계약이 이번 시즌 끝에 끝나요';
  // Read without auto-waiting: a card may leave between a count and a text query.
  const cardText = () =>
    card.evaluateAll((cards) => (cards[0] as HTMLElement | undefined)?.innerText ?? '');
  await fastest.click();
  await play.click();
  for (let stops = 0; ; stops++) {
    expect(stops).toBeLessThan(80);
    await expect(card).toBeVisible({ timeout: 75000 });
    const text = await cardText();
    if (text.includes(renewal)) break;
    // Another stop on the way: decline an offer, play a match through or read the news, then run on.
    const decline = card.getByRole('button', { name: '거절', exact: true }),
      through = card.getByRole('button', { name: '결과만 보고 계속', exact: true });
    await (
      (await decline.count())
        ? decline
        : (await through.count())
          ? through
          : card.getByRole('button', { name: '확인', exact: true })
    ).click();
    await expect.poll(cardText, { timeout: 10000 }).not.toBe(text);
    // A chip only sets the pace (→WEB-18): play starts the clock again when it rests. Play
    // ignores a tap in the first half second after the clock stops itself, so retry until it runs.
    await expect(async () => {
      if (await cardText()) return;
      if (await play.isVisible()) await play.click();
      await expect(pause.or(card).first()).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15000 });
  }
  await expect(card).toContainText(renewal);
  await expect(page.getByTestId('game-date')).toHaveText('1951년 4월 1일');
  await expect(card).toContainText('스태프 재계약');
  await expect(card).toContainText(
    '재계약하지 않으면 시즌이 끝날 때 떠나고 임시 감독이 팀을 맡아요',
  );
  await card.getByRole('button', { name: '감독 재계약', exact: true }).click();
  await expect(card).toHaveCount(0);
  await openPeople(page);
  await tab(page, '감독').click();
  await expect(page.getByText(/1950년 부임 · 계약 1951\/52 시즌 끝까지/)).toBeVisible();
  await expect(page.getByTestId('manager-renewal')).toHaveCount(0);
});

test('스태프 leads with the 단장 and 이적시장 ends with the scout shortlist at 360x740', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await found(page, 'director-shortlist');
  await openPeople(page);
  // The 단장's card comes first, with what he decides at the new club's level 2 (→STAFF-20).
  await tab(page, '스태프').click();
  const cards = page.getByRole('region', { name: '스태프', exact: true }).getByRole('listitem');
  await expect(cards.first()).toContainText('단장');
  await expect(cards.first()).toContainText('이적·계약 협상과 감독 선임');
  await expect(page.getByTestId('director-decides')).toHaveText(
    '재계약 협상 맡김 · 감독 선임 직접 · 이적 직접',
  );
  expect(await horizontalOverflow(page)).toBe(0);
  // 이적시장 ends with the chief scout's shortlist and the manager's requests (→CLUB-33).
  await tab(page, '이적시장').click();
  const shortlist = page.getByRole('region', { name: '스카우트 명단', exact: true });
  await shortlist.scrollIntoViewIfNeeded();
  await expect(shortlist).toContainText('수석 스카우트');
  await expect(shortlist).toContainText('1950년 8월 1일 작성');
  await expect(
    page.getByRole('region', { name: '감독 영입 요청' }).getByRole('group', { name: '감독 요청' }),
  ).toBeVisible();
  const entries = shortlist.locator('[data-testid^="shortlist-"]');
  expect(await entries.count()).toBeGreaterThan(0);
  expect(await horizontalOverflow(page)).toBe(0);
  // A listed player opens as the market list would: the bid sheet or his card.
  await entries.first().click();
  const sheet = page.getByRole('dialog', { name: /^(이적 제안|스카우트 명단 후보)$/ });
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
});
