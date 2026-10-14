import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { decode } from '../../apps/web/src/adapters/persistence';
import {
  activePlayers,
  autoTrainingAdvice,
  createWorld,
  daysUntilNextMatch,
  developmentOutlook,
  makePlayer,
  operate,
  overall,
  trainingFocusInfo,
} from '../../packages/engine/src/index';
import { encode } from '../../apps/web/src/adapters/persistence';
import type { TrainingFocus, World } from '../../packages/contracts/src/types';
import { expectHomeBounds } from './layout';
import { acknowledgeEvents } from './events';
import { continueSlot } from './slots';

/** The focuses as 훈련 names them. */
const FOCUS: Record<TrainingFocus, string> = {
  balanced: '균형',
  youth: '유망주 집중',
  recovery: '회복 집중',
};

/** Puts a world in slot 1, to continue from the slot screen. */
async function seed(page: Page, w: World) {
  const raw = await encode(w, 1, 0);
  await page.addInitScript((raw) => {
    // Once: a reload continues the game as saved.
    if (localStorage.getItem('haeram-soccor:manifest')) return;
    const envelope = JSON.parse(raw);
    localStorage.setItem('haeram-soccor:slot:a', raw);
    localStorage.setItem(
      'haeram-soccor:manifest',
      JSON.stringify({
        slot: 0,
        worldId: envelope.worldId,
        generation: envelope.generation,
        parentGeneration: envelope.parentGeneration,
      }),
    );
  }, raw);
}
const founded = (seed: string) =>
  createWorld({ country: 'ENG', name: 'Haeram Athletic', color: '#bf7956', seed, difficulty: 2 });

async function exportWorld(page: Page): Promise<World> {
  await page.getByRole('button', { name: '전체 메뉴', exact: true }).click();
  const menu = page.getByRole('dialog', { name: '전체 메뉴' });
  const downloading = page.waitForEvent('download');
  await menu.getByRole('button', { name: '기록 내보내기', exact: true }).click();
  const download = await downloading;
  const raw = await readFile((await download.path())!, 'utf8');
  await menu.getByRole('button', { name: '창 닫기', exact: true }).click();
  return (await decode(raw)).world;
}

function abilities(w: World) {
  return w.players.map((p) => ({
    id: p.id,
    attack: p.attack,
    passing: p.passing,
    defense: p.defense,
    keeper: p.keeper,
    stamina: p.stamina,
    potential: p.potential,
    fatigue: p.fatigue,
    developed: p.developed || 0,
  }));
}

// Seeds whose first offer from another club comes after the first match eve: new clubs stop for
// offers too (level 2), and an offer card would cover home's controls.
for (const { seed: worldSeed, ...viewport } of [
  { width: 360, height: 740, seed: 'training-ui-360' },
  { width: 390, height: 844, seed: 'training-ui-b' },
]) {
  test(`saves actual training without free growth and keeps home compact at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    // Founding, a run of days, a reload and a watched match in one journey.
    test.slow();
    const founding = {
      country: 'ENG' as const,
      name: 'Haeram Athletic',
      color: '#bf7956',
      seed: worldSeed,
      difficulty: 2,
    };
    const reference = createWorld(founding);
    // The clock runs for a few days below; it must not reach the first match day.
    expect(daysUntilNextMatch(reference)).toBeGreaterThan(4);
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByText('고급 설정', { exact: true }).click();
    await page.getByLabel('세계 생성 시드').fill(founding.seed);
    await page.getByRole('button', { name: '넉넉한 출발', exact: false }).click();
    await page.getByRole('button', { name: '클럽 창단' }).click();
    const hub = page.getByTestId('club-hub');
    await expect(hub).toBeVisible();
    await expectHomeBounds(page);
    const before = await exportWorld(page);
    // The coaches set training: a new club carries no order of the owner's (→CLUB-13).
    expect(before.trainingOrders).toBeUndefined();
    expect(abilities(before)).toEqual(abilities(reference));

    const nav = page.getByRole('navigation', { name: '모바일 게임 메뉴' });
    const roster = page.locator('[class*="rosterCards"] article');
    // Delegated staff may sell a fringe player for a premium while the window is open.
    const openSquad = async (w: World) => {
      await nav.getByRole('button', { name: '선수·스태프', exact: true }).click();
      await expect(roster).toHaveCount(w.players.filter((p) => p.status === 'active').length);
    };
    const openTraining = () => nav.getByRole('button', { name: '훈련·육성', exact: true }).click();
    await openSquad(before);
    for (const player of await roster.all()) await expect(player).toContainText('성장 +0.00');

    // Start the shared clock on home; it keeps running on other views until the owner stops it.
    const date = page.getByTestId('game-date');
    await nav.getByRole('button', { name: '클럽 홈', exact: true }).click();
    await expect(date).toHaveText('1950년 8월 1일');
    await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
    await expect(date).toHaveText('1950년 8월 2일');
    await openTraining();
    const mini = page.getByTestId('mini-clock');
    const entered = await date.innerText();
    await expect(date).not.toHaveText(entered);
    await mini.getByRole('button', { name: '자동 진행 정지', exact: true }).click();
    const paused = await date.innerText();
    // 훈련 shows the focus in force and changes nothing itself (→WEB-70): each focus states its
    // round's recovery and growth, the assistant's pick is marked, and why.
    await expect(page.getByRole('radiogroup', { name: '훈련 방향' })).toHaveCount(0);
    const effects = page.getByRole('list', { name: '훈련 방향별 효과' }).getByRole('listitem');
    await expect(effects).toHaveCount(3);
    for (const [index, id] of (['balanced', 'youth', 'recovery'] as const).entries())
      await expect(effects.nth(index)).toContainText(`피로 회복 ${trainingFocusInfo[id].recovery}`);
    await expect(effects.nth(1)).toContainText(
      `성장 ×${trainingFocusInfo.youth.developmentMultiplier}`,
    );
    await expect(effects.nth(2)).toContainText('라운드 성장 쉼');
    const pick = autoTrainingAdvice(before);
    await expect(page.getByTestId('training-focus')).toHaveText(
      `지금 ${FOCUS[pick.focus]} · 코치 판단`,
    );
    await expect(page.getByTestId('training-advice')).toHaveText(pick.reason);
    // The growth factor in force as one number (→WEB-70).
    await expect(page.getByTestId('development-total')).toContainText('×');

    // The owner reaches training through the assistant's card in 코치진 (→STAFF-19): a volunteer
    // takes an order without leaving.
    await page.getByRole('button', { name: /^수석코치에게 훈련 제안·강행/ }).click();
    await expect(page).toHaveURL(/\/people\?view=coaches$/);
    const sheet = page.getByRole('dialog', { name: '수석코치 훈련 제안' });
    await expect(sheet).toContainText('무급 자원봉사 코치는 강행해도 떠나지 않아요');
    await sheet.getByRole('button', { name: '유망주 집중 강행 · 사임 확률 0%' }).click();
    await expect(sheet).toHaveCount(0);
    const outcome = page.getByTestId('action-outcome');
    await expect(outcome).toContainText('코치에게 훈련 방향을 전했어요');
    await outcome.getByRole('button', { name: '확인', exact: true }).click();
    await expect(page.getByTestId('coach-call-assistant')).toContainText(
      '유망주 집중 · 구단주 지시',
    );
    await openTraining();
    await expect(page.getByTestId('training-focus')).toHaveText(
      '지금 유망주 집중 · 구단주 지시 · 4라운드 남음',
    );
    await expect(date).toHaveText(paused);
    // Starting it again from the buttons-only clock continues the same run.
    await mini.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
    await expect(date).not.toHaveText(paused);
    // The match-eve stop keeps it short of round 1.
    await nav.getByRole('button', { name: '선수·스태프', exact: true }).click();
    await expect(roster.first()).toBeVisible();
    for (const player of await roster.all()) await expect(player).toContainText('성장 +0.00');
    // A clock left running resumes after a reload (→WEB-64); stop the run so the reload starts
    // stopped. A start landing just after the eve stopped it is ignored by the clock itself.
    const toggle = mini.getByRole('button', { name: /^자동 진행 (정지|시작)$/ });
    if ((await toggle.getAttribute('aria-label')) === '자동 진행 정지') await toggle.click();
    await expect(mini.getByRole('button', { name: '자동 진행 시작', exact: true })).toBeVisible();
    await expect(page.getByTestId('save-status')).toContainText('저장 완료');
    await page.reload();
    await openTraining();
    await expect(page.getByTestId('training-focus')).toContainText('지금 유망주 집중');
    const planned = await exportWorld(page);
    expect(planned.trainingOrders?.assistant).toEqual({ focus: 'youth', rounds: 4, forced: true });
    expect(planned.round).toBe(0);
    expect(abilities(planned)).toEqual(abilities(before));

    await nav.getByRole('button', { name: '클럽 홈', exact: true }).click();
    // An offer that arrived while the clock ran waits on home as a card; answer it first.
    await acknowledgeEvents(page);
    await page.getByTestId('hub-play').click();
    await page.getByRole('button', { name: '결과 보기', exact: true }).click();
    await expect(page.getByText(/90′ ·.*경기 종료/)).toBeVisible();
    await nav.getByRole('button', { name: '클럽 홈', exact: true }).click();
    const settled = await exportWorld(page);
    expect(settled.round).toBe(1);
    expect(settled.ownMatches).toHaveLength(1);
    const developed = settled.players.filter((player) => (player.developed || 0) > 0);
    expect(developed.length).toBeGreaterThan(0);
    for (const player of developed) {
      expect(settled.year - player.born).toBeLessThan(27);
      const initial = before.players.find((candidate) => candidate.id === player.id)!;
      expect(
        player.attack + player.passing + player.defense + player.keeper + player.stamina,
      ).toBeGreaterThan(
        initial.attack + initial.passing + initial.defense + initial.keeper + initial.stamina,
      );
    }
    await openSquad(settled);
    for (const player of developed.filter((p) => p.status === 'active')) {
      // Names can repeat in a squad, so look for this player's card by name and its exact facts.
      const article = roster
        .filter({ has: page.getByText(player.name, { exact: true }) })
        .filter({ hasText: `OVR ${overall(player)}` })
        .filter({
          hasText: `${settled.year - player.born}세 · 잠재력 ${Math.round(player.potential)}`,
        })
        .filter({ hasText: `성장 +${(player.developed || 0).toFixed(2)}` });
      await expect(article.first()).toBeVisible();
    }
    await openTraining();
    // The players still growing show the growth they earned in that round.
    const growing = page.getByRole('region', { name: '성장 중인 선수' }).getByRole('listitem');
    const outlook = developmentOutlook(settled);
    await expect(growing).toHaveCount(outlook.growing.length);
    await expect(growing.first()).toContainText(outlook.growing[0].player.name);
    await expect(growing.first()).toContainText(`+${outlook.growing[0].developed.toFixed(2)}`);
    // The order counts down with each settled round.
    await expect(page.getByTestId('training-focus')).toHaveText(
      '지금 유망주 집중 · 구단주 지시 · 3라운드 남음',
    );
  });
}

test("shows an owner's order with the assistant's rule, and a suggestion's odds", async ({
  page,
}) => {
  // The owner forced youth training on a tired squad: left to his rule the assistant rests them.
  const w = founded('training-coach');
  operate(w, { type: 'coach-training', coach: 'assistant', focus: 'youth', force: true });
  for (const player of w.players) player.fatigue = 40;
  const advice = autoTrainingAdvice(w);
  expect(advice.focus).toBe('recovery');
  await seed(page, w);
  await page.goto('/');
  await continueSlot(page);
  await page.getByRole('button', { name: '훈련·육성', exact: true }).first().click();
  await expect(page.getByTestId('training-focus')).toHaveText(
    '지금 유망주 집중 · 구단주 지시 · 4라운드 남음',
  );
  await expect(page.getByTestId('training-advice')).toHaveText(
    '구단주 지시로 4라운드 더 이어가요.',
  );
  // His rule in words.
  await expect(page.getByRole('region', { name: '훈련 방향' })).toContainText(
    '선발 평균 피로 30 이상',
  );
  // The sheet states each suggestion's odds: what his rule picks 85%, against a recovery call 30%.
  await page.getByRole('button', { name: /^수석코치에게 훈련 제안·강행/ }).click();
  const sheet = page.getByRole('dialog', { name: '수석코치 훈련 제안' });
  await expect(sheet.getByTestId('training-call-assistant')).toContainText('구단주 지시');
  await expect(sheet.getByRole('button', { name: '회복 집중 제안 · 수락 확률 85%' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: '균형 훈련 제안 · 수락 확률 30%' })).toBeVisible();
  await sheet.getByRole('button', { name: '회복 집중 강행 · 사임 확률 0%' }).click();
  await expect(sheet).toHaveCount(0);
  await page.getByRole('button', { name: '훈련·육성', exact: true }).first().click();
  await expect(page.getByTestId('training-focus')).toHaveText(
    '지금 회복 집중 · 구단주 지시 · 4라운드 남음',
  );
  // What drives development reads the focus in force: no round growth while resting.
  await expect(
    page.getByRole('button', { name: /^훈련 방향 ×0 · 훈련 방향에서 보기$/ }),
  ).toBeVisible();
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  await expect(page.getByTestId('training-focus')).toContainText('지금 회복 집중');
});

test('promotes a prospect from 유소년', async ({ page }) => {
  const w = founded('training-academy');
  const prospect = makePlayer(
    'ENG',
    w.seed,
    `${w.playerClub}:academy:${w.year}:0`,
    w.year,
    40,
    'MID',
    17,
  );
  prospect.potential = 74;
  w.academy = { players: [prospect] };
  const squad = activePlayers(w).length;
  // The journey finds his roster card by name, so it must be the only one with that name.
  expect(w.players.some((player) => player.name === prospect.name)).toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, w);
  await page.goto('/');
  await continueSlot(page);
  const nav = page.getByRole('navigation', { name: '모바일 게임 메뉴' });
  await nav.getByRole('button', { name: '훈련·육성', exact: true }).click();
  await page.getByRole('tab', { name: '유소년', exact: true }).click();
  await expect(page).toHaveURL(/\/training\?view=academy$/);
  // Prospects stand in their age group (→CLUB-16); a 17-year-old is in U-19.
  await expect(page.getByTestId('age-group-u19')).toContainText(prospect.name);
  await expect(page.getByTestId('age-group-u17')).toContainText('0명');
  // The youth director sets the academy's focus; the owner suggests through his card (→CLUB-31).
  await expect(page.getByTestId('youth-focus')).toContainText('코치 판단');
  // Who decides and the director's rule live here (→STAFF-13); level 2 hands him the academy.
  const delegation = page.getByRole('region', { name: '유소년 위임' });
  await expect(delegation.getByRole('checkbox')).toHaveCount(0);
  await expect(delegation.getByTestId('decision-owner-academy')).toContainText('자동 결정');
  // The director follows 육성 목표 and 데뷔 시점, named as lines to the 방향 board (→CLUB-32).
  await expect(delegation).toContainText(
    '19세에 잠재력이 같은 포지션 1군 최하위에 못 미치는 아이를 내보내요',
  );
  await expect(delegation.getByRole('button', { name: /^육성 목표 · 표준/ })).toBeVisible();
  const academy = page.getByRole('region', { name: '유소년 아카데미' });
  await expect(page.getByTestId('academy-intake')).toContainText('3월 15일');
  await expect(academy.getByRole('listitem')).toHaveCount(1);
  await expect(academy).toContainText(prospect.name);
  await academy.getByRole('button', { name: `${prospect.name} 1군 승격`, exact: true }).click();
  await expect(academy.getByRole('listitem')).toHaveCount(0);
  await expect(academy).toContainText('아직 아카데미 선수가 없어요');
  await nav.getByRole('button', { name: '선수·스태프', exact: true }).click();
  const roster = page.locator('[class*="rosterCards"] article');
  await expect(roster).toHaveCount(squad + 1);
  await expect(roster.filter({ hasText: prospect.name })).toHaveCount(1);
  // Academy investment and youth policy are only named here; the line opens 방향.
  await nav.getByRole('button', { name: '훈련·육성', exact: true }).click();
  await page.getByRole('tab', { name: '유소년', exact: true }).click();
  await expect(page.getByRole('button', { name: /^육성 목표 · 표준/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^데뷔 시점 · 표준/ })).toBeVisible();
  await page.getByRole('button', { name: /^유소년 투자 · 유입 방식은 방향에서/ }).click();
  await expect(page).toHaveURL(/\/business$/);
});
