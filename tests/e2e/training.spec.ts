import { watchNext } from './watch';
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
import { acknowledgeEvents, closeOutcome, setResponsibility } from './events';
import { continueSlot } from './slots';
import { retainPerson, openEmployment } from '../../packages/engine/src/person-careers';

/** The focuses as 훈련 names them. */
const FOCUS: Record<TrainingFocus, string> = {
  balanced: '균형',
  recovery: '회복',
  hard: '하드 트레이닝',
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
  createWorld({
    country: 'ENG',
    name: 'Haeram Athletic',
    color: '#bf7956',
    seed,
    level: 'easy' as const,
  });

async function exportWorld(page: Page): Promise<World> {
  await page.getByRole('button', { name: '설정', exact: true }).click();
  const menu = page.getByRole('dialog', { name: '설정' });
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
    attrs: { ...p.attrs },
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
      level: 'easy' as const,
    };
    const reference = createWorld(founding);
    // The clock runs for a few days below; it must not reach the first match day.
    expect(daysUntilNextMatch(reference)).toBeGreaterThan(4);
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByText('고급 설정', { exact: true }).click();
    await page.getByLabel('세계 생성 시드').fill(founding.seed);
    await page.getByRole('button', { name: '쉬움', exact: false }).click();
    await page.getByRole('button', { name: '클럽 창단' }).click();
    const hub = page.getByTestId('club-hub');
    await expect(hub).toBeVisible();
    await setResponsibility(page, '스태프 인사', 'direct');
    await expectHomeBounds(page);
    const before = await exportWorld(page);
    // The coaches set training: a new club carries no order of the owner's (→CLUB-13).
    expect(before.trainingOrders).toBeUndefined();
    expect(abilities(before)).toEqual(abilities(reference));

    const nav = page.getByRole('navigation', { name: '모바일 게임 메뉴' });
    const roster = page.locator('[class*="rosterCards"] article');
    // Delegated staff may sell a fringe player for a premium while the window is open.
    const openSquad = async (w: World) => {
      await nav.getByRole('button', { name: '선수단·스태프', exact: true }).click();
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
    const mini = page.getByRole('region', { name: '시즌 진행', exact: true });
    const entered = await date.innerText();
    await expect(date).not.toHaveText(entered);
    await mini.getByRole('button', { name: '자동 진행 정지', exact: true }).click();
    const paused = await date.innerText();
    // 훈련 shows the focus in force and changes nothing itself (→WEB-70): each focus states its
    // round's recovery and growth, the assistant's pick is marked, and why.
    await expect(page.getByRole('radiogroup', { name: '훈련 방향' })).toHaveCount(0);
    await page.getByText('훈련 효과·자동 판단 기준', { exact: true }).click();
    const effects = page.getByRole('list', { name: '훈련 방향별 효과' }).getByRole('listitem');
    await expect(effects).toHaveCount(3);
    for (const [index, id] of (['balanced', 'recovery', 'hard'] as const).entries())
      await expect(effects.nth(index)).toContainText(`피로 회복 ${trainingFocusInfo[id].recovery}`);
    await expect(effects.nth(1)).toContainText(
      `성장 ×${trainingFocusInfo.recovery.developmentMultiplier}`,
    );
    await expect(effects.nth(2)).toContainText(
      `성장 ×${trainingFocusInfo.hard.developmentMultiplier}`,
    );
    const pick = autoTrainingAdvice(before);
    await expect(page.getByTestId('training-focus')).toHaveText(
      `지금 ${FOCUS[pick.focus]} · 코치 판단`,
    );
    await expect(page.getByTestId('training-advice')).toHaveText(pick.reason);
    // The growth factor in force as one number (→WEB-70).
    await expect(page.getByTestId('development-total')).toContainText('×');

    // The owner suggests or orders right in 훈련 (→WEB-70, STAFF-19): a volunteer takes an order
    // without leaving.
    await page.getByRole('button', { name: /^수석코치에게 훈련 제안·강행/ }).click();
    await expect(page).toHaveURL(/\/training$/);
    const sheet = page.getByRole('dialog', { name: '수석코치 훈련 제안' });
    await expect(sheet).toContainText('무급 자원봉사 코치는 강행해도 떠나지 않아요');
    await sheet.getByRole('button', { name: '하드 트레이닝 강행 · 사임 확률 0%' }).click();
    await expect(sheet).toHaveCount(0);
    const outcome = page.getByTestId('action-outcome');
    await expect(outcome).toContainText('코치에게 훈련 방향을 전했어요');
    await outcome.getByRole('button', { name: /^(확인|알림 닫기)$/ }).click();
    await openTraining();
    await expect(page.getByTestId('training-focus')).toHaveText(
      '지금 하드 트레이닝 · 구단주 지시 · 4라운드 남음',
    );
    await expect(date).toHaveText(paused);
    // Starting it again from the buttons-only clock continues the same run.
    await mini.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
    await expect(date).not.toHaveText(paused);
    // The match-eve stop keeps it short of round 1.
    await nav.getByRole('button', { name: '선수단·스태프', exact: true }).click();
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
    await expect(page.getByTestId('training-focus')).toContainText('지금 하드 트레이닝');
    const planned = await exportWorld(page);
    expect(planned.trainingOrders?.assistant).toEqual({ focus: 'hard', rounds: 4, forced: true });
    expect(planned.round).toBe(0);
    expect(abilities(planned)).toEqual(abilities(before));

    await nav.getByRole('button', { name: '클럽 홈', exact: true }).click();
    // An offer that arrived while the clock ran waits on home as a card; answer it first.
    await acknowledgeEvents(page);
    await watchNext(page, { manual: true });
    await page.getByRole('button', { name: '결과 보기', exact: true }).click();
    await expect(page.getByText(/90(\+\d+)?′ ·.*경기 종료/)).toBeVisible();
    await nav.getByRole('button', { name: '클럽 홈', exact: true }).click();
    const settled = await exportWorld(page);
    expect(settled.round).toBe(1);
    expect(settled.ownMatches).toHaveLength(1);
    const developed = settled.players.filter((player) => (player.developed || 0) > 0);
    expect(developed.length).toBeGreaterThan(0);
    for (const player of developed) {
      expect(settled.year - player.born).toBeLessThan(27);
      const initial = before.players.find((candidate) => candidate.id === player.id)!;
      const sum = (p: typeof player) => Object.values(p.attrs).reduce((a, b) => a + b, 0);
      expect(sum(player)).toBeGreaterThan(sum(initial));
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
    await page
      .getByRole('group', { name: '선수 육성 보기' })
      .getByRole('button', { name: '성장 중', exact: true })
      .click();
    const outlook = developmentOutlook(settled);
    for (const entry of outlook.growing) {
      const row = page.getByTestId(`player-focus-${entry.player.id}`).locator('..');
      await expect(row).toContainText(entry.player.name);
      await expect(row).toContainText(`성장 +${entry.developed.toFixed(2)}`);
    }
    // The order counts down with each settled round.
    await expect(page.getByTestId('training-focus')).toHaveText(
      '지금 하드 트레이닝 · 구단주 지시 · 3라운드 남음',
    );
  });
}

test("shows an owner's order with the assistant's rule, and a suggestion's odds", async ({
  page,
}) => {
  // The owner forced youth training on a tired squad: left to his rule the assistant rests them.
  const w = founded('training-coach');
  operate(w, { type: 'coach-training', coach: 'assistant', focus: 'hard', force: true });
  for (const player of w.players) player.fatigue = 40;
  const advice = autoTrainingAdvice(w);
  expect(advice.focus).toBe('recovery');
  await seed(page, w);
  await page.goto('/');
  await continueSlot(page);
  await page.getByRole('button', { name: '훈련·육성', exact: true }).first().click();
  await expect(page.getByTestId('training-focus')).toHaveText(
    '지금 하드 트레이닝 · 구단주 지시 · 4라운드 남음',
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
  await expect(sheet.getByRole('button', { name: '회복 훈련 제안 · 수락 확률 85%' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: '균형 훈련 제안 · 수락 확률 30%' })).toBeVisible();
  await sheet.getByRole('button', { name: '회복 훈련 강행 · 사임 확률 0%' }).click();
  await expect(sheet).toHaveCount(0);
  await page.getByRole('button', { name: '훈련·육성', exact: true }).first().click();
  await expect(page.getByTestId('training-focus')).toHaveText(
    '지금 회복 · 구단주 지시 · 4라운드 남음',
  );
  // What drives development reads the focus in force: no round growth while resting.
  await page.getByText('성장 요인·투자·스태프 자세히', { exact: true }).click();
  await expect(
    page.getByRole('button', { name: /^훈련 방향 ×0.4 · 1군 훈련에서 보기$/ }),
  ).toBeVisible();
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  await expect(page.getByTestId('training-focus')).toContainText('지금 회복');
});

test('promotes a prospect from 유소년', async ({ page }) => {
  const w = founded('training-academy');
  const prospect = makePlayer(
    'ENG',
    w.seed,
    `${w.playerClub}:academy:${w.year}:0`,
    w.year,
    40,
    'CM',
    17,
  );
  prospect.potential = 74;
  w.academy = { players: [prospect] };
  retainPerson(w, prospect, w.playerClub, true);
  openEmployment(w, prospect.id, 'player', w.playerClub);
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
  await expect(delegation.getByTestId('decision-owner-academy')).toContainText('위임');
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
  await closeOutcome(page, '유소년을 1군으로 올렸어요');
  await expect(academy.getByRole('listitem')).toHaveCount(0);
  await expect(academy).toContainText('아직 아카데미 선수가 없어요');
  await expect(page.getByRole('region', { name: '승격한 선수 관리' })).toContainText(prospect.name);
  await expect(page.getByRole('button', { name: '이 선수 훈련 보기', exact: true })).toBeVisible();
  await nav.getByRole('button', { name: '선수단·스태프', exact: true }).click();
  const roster = page.locator('[class*="rosterCards"] article');
  await expect(roster).toHaveCount(squad + 1);
  await expect(roster.filter({ hasText: prospect.name })).toHaveCount(1);
  // The focused youth editor keeps this academy task and route in place.
  await nav.getByRole('button', { name: '훈련·육성', exact: true }).click();
  await page.getByRole('tab', { name: '유소년', exact: true }).click();
  await expect(page.getByRole('button', { name: /^육성 목표 · 표준/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^데뷔 시점 · 표준/ })).toBeVisible();
  await page.getByRole('button', { name: /^유소년 투자 · 유입 방식은 운영 방침에서/ }).click();
  await expect(page.getByRole('dialog', { name: '유소년 운영 방침', exact: true })).toBeVisible();
  await expect(page.getByTestId('department-policy-board')).toContainText('유소년 투자');
  await expect(page).toHaveURL(/\/training\?view=academy$/);
});

test('suggests 하드 for one player, forces 회복 for the squad and lists adaptation (→CLUB-11, PLAYER-12)', async ({
  page,
}) => {
  const w = founded('training-player');
  const player = [...activePlayers(w)].sort((a, b) => b.fatigue - a.fatigue)[0]!;
  // Whether the assistant takes the suggestion is the world's own draw: read it from a copy.
  const copy = structuredClone(w);
  operate(copy, { type: 'coach-training', coach: 'assistant', focus: 'hard', player: player.id });
  const accepted = copy.trainingOrders?.players?.[player.id]?.focus === 'hard';
  await seed(page, w);
  await page.goto('/');
  await continueSlot(page);
  await page.getByRole('button', { name: '훈련·육성', exact: true }).first().click();

  // One player's own focus: the sheet names him and his suggestion's odds.
  const own = page.getByRole('region', { name: '개별 훈련' });
  await own.getByRole('button', { name: `${player.name} 개별 훈련`, exact: true }).click();
  const sheet = page.getByRole('dialog', { name: `${player.name} 개별 훈련` });
  await expect(sheet.getByTestId('training-call-player')).toContainText('팀 훈련');
  await sheet.getByRole('button', { name: /^하드 트레이닝 제안 · 수락 확률 \d+%$/ }).click();
  await expect(sheet).toHaveCount(0);
  const row = own.getByTestId(`player-focus-${player.id}`);
  if (accepted) await expect(row).toContainText('하드 트레이닝구단주 제안 수락 · 4라운드 남음');
  else await expect(row).toContainText('제안 2라운드 뒤');

  // The squad's focus forced to 회복.
  await page.getByRole('button', { name: /^수석코치에게 훈련 제안·강행/ }).click();
  const squad = page.getByRole('dialog', { name: '수석코치 훈련 제안' });
  await squad.getByRole('button', { name: /^회복 훈련 강행 · 사임 확률/ }).click();
  await expect(squad).toHaveCount(0);
  await expect(page.getByTestId('training-focus')).toHaveText(
    '지금 회복 · 구단주 지시 · 4라운드 남음',
  );

  // Every first-team player's adaptation and multiplier, lowest first.
  const list = page.getByTestId('adaptation-list');
  await expect(list.getByRole('listitem')).toHaveCount(activePlayers(w).length);
  await expect(list).toContainText('0.80 · ×1');
  await expect(list).toContainText('적응 속도 ×');
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
});
