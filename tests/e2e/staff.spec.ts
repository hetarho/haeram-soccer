import { settle } from './layout';
import { staffAuthority } from '../../packages/engine/src/testing';
import { managerCard, openPersonnel } from './personnel-navigation';
import { marketInfo } from './market';
import {
  advanceRound,
  managerOffers,
  operate,
  simulateSeason,
} from '../../packages/engine/src/index';
import { careerWorld } from '../../packages/engine/src/career.testkit';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  approvalTray,
  chooseLevel,
  setResponsibility,
  acknowledgeEvents,
  closeOutcome,
} from './events';
import { horizontalOverflow } from './layout';
import { chooseOption } from './select';
import { clubhouseTab } from './competition-navigation';
import {
  approvalQueue,
  approvalRequest,
  leaveOffice,
  officeMenu,
  openTeamTab,
  teamEntry,
  teamReturn,
  teamTabs,
} from './office';
import { fundClub, startCareer } from './start';

/** The default seed's first season offers a firefighter among the four free candidates. */
async function found(page: Page, seed = 'short-contract') {
  await page.goto('/');
  await startCareer(page, { seed });
}

/** A list of 팀 (→WEB-112): 1군, 유소년 and 코치. */
const teamTab = (page: Page, name: string) =>
  teamTabs(page).getByRole('tab', { name, exact: true });
/** A detailed people page keeps 팀 current and leads back to its list (→WEB-112). */
async function expectTeamPage(page: Page, list: string) {
  await expect(teamReturn(page)).toHaveText(`← 팀 · ${list}`);
  await expect(teamEntry(page)).toHaveAttribute('aria-current', 'page');
}
/** 1군's roster through 팀. */
const openPeople = (page: Page) => openPersonnel(page, 'players');
/** The manager's own 교체 in 코치진; every staff post has one too. */
const replaceManager = (page: Page) =>
  managerCard(page).getByRole('button', { name: '교체', exact: true });

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
  await openPersonnel(page, 'manager');
  await replaceManager(page).click();
  const market = page.getByRole('dialog', { name: '감독 교체' });
  await expect(market.getByRole('heading', { name: '다른 구단 감독 · 보상금 필요' })).toBeVisible();
  const card = freeAgents(market).getByRole('article').filter({ hasText: '소방수' });
  await expect(card).toContainText('계약 이번 시즌(1930/31) 끝까지');
  await expect(card).toContainText('선발 성향');
  await expect(card).not.toContainText('야망');
  const name = await card.getByRole('heading').innerText();
  await card.getByRole('button', { name: /^감독 선임 · / }).click();
  const dialog = page.getByRole('dialog', { name: '감독 선임 확인' });
  await expect(dialog).toContainText('시즌 종료까지 단기 계약');
  await expect(dialog).toContainText(
    '계약 이번 시즌(1930/31) 끝까지 · 남기려면 4월에 1시즌씩 재계약해요',
  );
  await dialog.getByRole('button', { name: '선임 확정', exact: true }).click();
  // Hiring closes the confirmation and the market, as a coach's hire closes his list.
  await expect(dialog).toHaveCount(0);
  await expect(market).toHaveCount(0);
  await closeOutcome(page, '새 감독을 선임했어요');
  // The man just hired leaves the market (→STAFF-17).
  await replaceManager(page).click();
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
    // Many club-section visits (→WEB-10): past 30 s on a loaded host.
    test.slow();
    await found(page);
    // A hire pays the fee and the outgoing manager's payoff from the club's cash, which a 1930
    // club is taken over without.
    await fundClub(page);
    await chooseLevel(page, 2);
    await setResponsibility(page, '스폰서 계약', 'delegated');
    await openPersonnel(page, 'players');
    // 1군 is the roster with no local tabs: the manager stands with his staff in 코치진 and his
    // market behind his 교체 (→WEB-43); the transfer market is a primary entry (→WEB-10).
    await expect(page.getByRole('tablist', { name: '감독 사무실' })).toHaveCount(0);
    await expect(teamReturn(page)).toHaveText('← 팀 · 1군');
    await expect(teamEntry(page)).toHaveAttribute('aria-current', 'page');
    await expect(officeMenu(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/first-team\?view=players$/);
    await openTeamTab(page, '1군');
    await settle(page);
    for (const box of await teamTabs(page)
      .getByRole('tab')
      .evaluateAll((all) =>
        all.map((button) => Math.round(button.getBoundingClientRect().height * 64) / 64),
      ))
      expect(box).toBeGreaterThanOrEqual(44);
    await openPersonnel(page, 'manager');
    await expect(page).toHaveURL(/\/staff\?view=coaches$/);
    // The manager's card keeps what 육성 means one labelled disclosure away (→WEB-10/43), with
    // every staff post listed under him.
    await expect(managerCard(page)).toBeInViewport();
    const youth = page.getByText('27세 미만 선수 성장').first();
    await expect(youth).toBeHidden();
    await page.getByText('감독 능력·성향', { exact: true }).click();
    await expect(youth).toBeVisible();
    await expect(page.getByRole('region', { name: '스태프', exact: true })).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
    // The keyboard moves along 팀's lists, each tab showing its list in place (→WEB-69/112).
    await openTeamTab(page, '코치');
    await teamTab(page, '코치').focus();
    const lists: [string, string, RegExp][] = [
      ['ArrowLeft', '유소년', /\/team\?view=academy$/],
      ['ArrowRight', '코치', /\/team\?view=coaches$/],
      ['ArrowRight', '1군', /\/team\?view=players$/],
      ['End', '코치', /\/team\?view=coaches$/],
      ['Home', '1군', /\/team\?view=players$/],
      ['ArrowLeft', '코치', /\/team\?view=coaches$/],
    ];
    for (const [key, name, address] of lists) {
      await page.keyboard.press(key);
      await expect(teamTab(page, name)).toBeFocused();
      await expect(teamTab(page, name)).toHaveAttribute('aria-selected', 'true');
      await expect(page).toHaveURL(address);
    }
    await expect(page.getByTestId('team-coaches')).toBeVisible();
    await openPersonnel(page, 'coaches');
    await expect(page.getByRole('region', { name: '스태프', exact: true })).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);

    await hireFirefighter(page);
    await openPersonnel(page, 'manager');
    const renewal = page.getByTestId('manager-renewal');
    await expect(renewal).toContainText(
      '재계약하지 않으면 시즌이 끝날 때 떠나고 임시 감독이 팀을 맡아요.',
    );
    await expect(renewal).toContainText('계약 1931/32 시즌 끝까지');
    await expect(page.getByText(/1930년 부임 · 계약 이번 시즌\(1930\/31\) 끝까지/)).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
    await renewal.getByRole('button', { name: '재계약', exact: true }).click();
    await closeOutcome(page, '계약이 한 시즌 늘었어요');
    await expect(renewal).toHaveCount(0);
    await expect(page.getByText(/1930년 부임 · 계약 1931\/32 시즌 끝까지/)).toBeVisible();

    // A reload keeps the tab in the address.
    await openPersonnel(page, 'coaches');
    await expect(page.getByTestId('coaching-mode')).toContainText('직접');
    await expect(page.getByTestId('save-status')).toContainText('저장 완료');
    await page.reload();
    await expectTeamPage(page, '코치');
    await expect(page).toHaveURL(/\/staff\?view=coaches$/);
    // 감독 ends with who appoints, the rows the staff follow and whom they would appoint (→WEB-43).
    await openPersonnel(page, 'manager');
    const post = page.getByRole('region', { name: '감독 선임 위임' });
    await expect(post).toBeVisible();
    await expect(post.getByRole('checkbox')).toHaveCount(0);
    await expect(post.getByTestId('decision-owner-manager')).toContainText('직접');
    await expect(post.getByTestId('decision-owner-manager')).toContainText(
      '아래 방침은 이 업무를 위임할 때 사용해요.',
    );
    await expect(post.getByTestId('manager-pick')).toBeHidden();
    await post.getByText('감독 선임 기준·추천 후보', { exact: true }).click();
    // 선호 학파 and 감독 기조 read as founded; no line opens an editor (→STAFF-18).
    await expect(post.locator('[data-row="school"]')).toContainText('상관없음');
    await expect(post.locator('[data-row="manager"]')).toContainText('표준');
    await expect(post.getByRole('button', { name: /^(선호 학파|감독 기조) · / })).toHaveCount(0);
    const pick = post.getByTestId('manager-pick');
    // Whom the staff would appoint today under the rows in force (→WEB-43).
    await expect(pick).toContainText('지금 방향이면');
    expect(await horizontalOverflow(page)).toBe(0);
  });

  // Split from the journey above, which ran close to its 30 s limit on a loaded host.
  test('older 감독 and squad addresses land on their detailed people pages', async ({ page }) => {
    await found(page);
    await chooseLevel(page, 2);
    await setResponsibility(page, '스폰서 계약', 'delegated');
    // An old address of the candidates tab opens 코치진 with the manager's market open.
    await page.goto('/manager?view=candidates');
    await expectTeamPage(page, '코치');
    const market = page.getByRole('dialog', { name: '감독 교체' });
    await expect(freeAgents(market).getByRole('article').first()).toBeVisible();
    await expect(page).toHaveURL(/\/staff\?view=coaches&market=1$/);
    await market.getByRole('button', { name: '창 닫기' }).click();
    await expect(page).toHaveURL(/\/staff\?view=coaches$/);
    // The older manager and staff addresses land on the same 코치진.
    for (const address of ['/first-team?view=manager', '/manager?view=coaches']) {
      await page.goto(address);
      await expectTeamPage(page, '코치');
      await expect(page).toHaveURL(/\/staff\?view=coaches$/);
      await expect(managerCard(page)).toBeVisible();
    }
    await page.goto('/squad');
    await expectTeamPage(page, '1군');
    await expect(page).toHaveURL(/\/first-team\?view=players$/);
    expect(await horizontalOverflow(page)).toBe(0);
  });
});

test('an unrenewed firefighter leaves at the close and the alert opens the market', async ({
  page,
}) => {
  // Plays a whole season; slow CI browsers need longer.
  test.slow();
  // Build an actual closed-season direct-manager career. Its unanswered renewal is a real
  // decision; archive-only helpers must not delegate it or acknowledge it away.
  const w = careerWorld({ country: 'ENG', seed: 'short-contract' });
  w.settings = staffAuthority(2);
  const offer = managerOffers(w).find((offer) => offer.style === 'firefighter')!;
  operate(w, { type: 'hire', id: offer.id });
  simulateSeason(w);
  await importResponsibilityCareer(page, w);
  await expect(page.getByTestId('calendar')).toHaveAttribute('data-season', '1951');
  await expect(page.getByTestId('game-round')).toHaveText('0');
  const alert = page.getByRole('status').filter({ hasText: '감독이 떠났어요' });
  await expect(alert).toContainText('임시 감독이 팀을 맡고 있어요');
  await alert.getByRole('button', { name: '감독 선임하러 가기', exact: true }).click();
  // The vacancy opens 코치진, the interim at its head and his market over it (→WEB-43/57).
  await expectTeamPage(page, '코치');
  await expect(page).toHaveURL(/\/staff\?view=coaches&market=1$/);
  await expect(managerCard(page)).toContainText('새 감독을 뽑을 때까지 대행');
  // The interim's market is open; it keeps at least four free agents (→STAFF-17).
  const market = page.getByRole('dialog', { name: '감독 선임' });
  await expect(market).toContainText('(임시 감독)');
  await expect(freeAgents(market).getByRole('article').first()).toBeVisible();
  expect(await freeAgents(market).getByRole('article').count()).toBeGreaterThanOrEqual(4);
});

test('with the manager post delegated a resignation is filled at once and the clock runs on', async ({
  page,
}) => {
  // A manager at trust 0 resigns at a settled round (→STAFF-47); the rounds are played in Node
  // until he does, so the imported career holds the staff's appointment. Level 4 hands the
  // manager post to the staff and stops only for money, so nothing else explains a stop.
  const w = careerWorld({ country: 'ENG', seed: 'proud-0' });
  w.cash = '999999999999';
  w.settings = staffAuthority(4);
  const founding = w.manager;
  w.manager = { ...w.manager, trust: 0, trustWarned: true };
  for (let round = 0; round < 20 && w.manager.id === founding.id; round++)
    advanceRound(w, undefined, false);
  expect(w.manager.id).not.toBe(founding.id);
  expect(w.manager.interim).toBe(false);
  expect(w.critical).toBeUndefined();
  await importResponsibilityCareer(page, w);
  const date = page.getByTestId('game-date');
  const today = await date.innerText();
  await openPersonnel(page, 'manager');
  await expect(page.getByTestId('decision-owner-manager')).toContainText('자동');
  // The staff appointed a successor at once: no departure alert, no interim in charge.
  await expect(managerCard(page)).toBeVisible();
  await expect(page.getByRole('heading', { name: founding.name, exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: w.manager.name, exact: true })).toBeVisible();
  await expect(page.getByText('FIRST TEAM MANAGER', { exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '감독이 떠났어요' })).toHaveCount(0);
  await page
    .getByRole('region', { name: '시즌 진행', exact: true })
    .getByRole('button', { name: '자동 진행 시작' })
    .click();
  await expect(date).not.toHaveText(today);
  await expect(page.getByRole('status').filter({ hasText: '감독이 떠났어요' })).toHaveCount(0);
});

test('the 1 April card renews the firefighter in one tap', async ({ page }) => {
  // Runs the clock from August to April at the fastest pace with the manager's renewal kept by the
  // owner (→WEB-45); approvals waiting never stop it (→WEB-42). On the released model those eight
  // months ran past the slow 90 s budget on CI Firefox (run 40243569140).
  test.setTimeout(180_000);
  await found(page);
  // The hire is paid from the club's cash, and eight months must not run the club into the red.
  await fundClub(page);
  await chooseLevel(page, 4);
  await setResponsibility(page, '감독 인사', 'direct');
  await setResponsibility(page, '선수 영입', 'direct');
  await openPeople(page);
  await hireFirefighter(page);
  await clubhouseTab(page).click();
  const progress = page.getByRole('region', { name: '시즌 진행', exact: true });
  const pace = progress.getByRole('combobox', { name: '자동 진행 배속', exact: true });
  const play = progress.getByRole('button', { name: '자동 진행 시작', exact: true }),
    pause = progress.getByRole('button', { name: '자동 진행 정지', exact: true });
  const card = page.getByTestId('event-card').first();
  const date = page.getByTestId('game-date');
  const renewal = '감독 재계약';
  // Read without auto-waiting: a card may leave between a count and a text query.
  const cardText = () =>
    card.evaluateAll((cards) => (cards[0] as HTMLElement | undefined)?.innerText ?? '');
  await chooseOption(pace, 'x10');
  await play.click();
  // Approvals never stop the clock (→WEB-42): it runs on to 1 April, when the renewal joins the
  // office's 결재함. Only an observation stops it on the way: play it through or read it, and
  // run on. Play ignores a tap in the first half second after the clock stops itself.
  await expect(async () => {
    if ((await date.innerText()) >= '1931.04.01') return;
    const through = card.getByRole('button', { name: '결과만 보고 계속', exact: true });
    if (await through.count()) await through.click();
    else if (await cardText()) await acknowledgeEvents(page);
    if (await play.isVisible()) await play.click();
    throw new Error(`still ${await date.innerText()}`);
  }).toPass({ timeout: 150_000, intervals: [1000] });
  if (await pause.isVisible()) await pause.click();
  await expect(play).toBeVisible();
  const tray = await approvalTray(page);
  await tray
    .filter({ hasText: renewal })
    .getByRole('button', { name: /· 검토하기$/ })
    .click();
  await expect(approvalRequest(page)).toBeVisible();
  await page
    .getByTestId('manager-renewal')
    .getByRole('button', { name: /^재계약/ })
    .click();
  // An answered review returns to the 결재함 (→WEB-100).
  await expect(approvalQueue(page)).toBeVisible();
  await expect((await approvalTray(page)).filter({ hasText: renewal })).toHaveCount(0);
  await leaveOffice(page);
  await openPeople(page);
  await openPersonnel(page, 'manager');
  await expect(page.getByText(/1930년 부임 · 계약 1931\/32 시즌 끝까지/)).toBeVisible();
  await expect(page.getByTestId('manager-renewal')).toHaveCount(0);
});

test('스태프 leads with the 단장 and 이적시장 discloses the scout shortlist at 360x740', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await found(page, 'director-shortlist');
  await openPeople(page);
  // The 단장's card comes first, with what he decides at the career's starting level 2 (→STAFF-20).
  await openPersonnel(page, 'coaches');
  const cards = page.getByRole('region', { name: '스태프', exact: true }).getByRole('listitem');
  await expect(cards.first()).toContainText('단장');
  await expect(cards.first()).toContainText('이적·계약 협상과 감독 선임');
  await expect(page.getByTestId('director-decides')).toHaveText(
    '재계약 협상 직접 · 감독 선임 직접 · 선수 영입 직접 · 선수 매각 직접',
  );
  expect(await horizontalOverflow(page)).toBe(0);
  // 이적시장 discloses the chief scout's shortlist and the manager's requests (→CLUB-33).
  await openPersonnel(page, 'market');
  await marketInfo(page);
  const shortlist = page.getByRole('region', { name: '스카우트 명단', exact: true });
  await shortlist.scrollIntoViewIfNeeded();
  await expect(shortlist).toContainText('수석 스카우트');
  await expect(shortlist).toContainText('1930년 8월 1일 작성');
  await expect(
    page.getByRole('region', { name: '감독 영입 요청' }).getByRole('group', { name: '감독 요청' }),
  ).toBeVisible();
  const entries = shortlist.locator('[data-testid^="shortlist-"]');
  expect(await entries.count()).toBeGreaterThan(0);
  expect(await horizontalOverflow(page)).toBe(0);
  // A listed player opens as the market list would: the bid sheet or his card.
  await entries.first().click();
  const sheet = page.getByRole('dialog', { name: '영입 후보 상세', exact: true });
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
});
