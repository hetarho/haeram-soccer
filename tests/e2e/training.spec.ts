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
import { acknowledgeEvents, chooseLevel } from './events';
import { continueSlot } from './slots';

/** The focuses as 훈련's radiogroup names them. */
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

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
]) {
  test(`saves actual training without free growth and keeps home compact at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    const founding = {
      country: 'ENG' as const,
      name: 'Haeram Athletic',
      color: '#bf7956',
      seed: `training-ui-${viewport.width}`,
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
    expect(before.training || 'balanced').toBe('balanced');
    // New clubs start at level 2, which hands the training focus to the assistant (→WEB-45).
    expect(before.intervention).toBe(2);
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
    // 훈련's own radiogroup holds the focus (→WEB-70), each stating its round's recovery and growth.
    const focus = page.getByRole('radiogroup', { name: '훈련 방향', exact: true });
    const balanced = focus.getByRole('radio', { name: '균형', exact: true });
    const youth = focus.getByRole('radio', { name: '유망주 집중', exact: true });
    const recovery = focus.getByRole('radio', { name: '회복 집중', exact: true });
    const owner = page.getByTestId('decision-owner-training');
    await expect(page.getByRole('checkbox', { name: '코치에게 맡기기' })).toHaveCount(0);
    await expect(focus.getByRole('radio')).toHaveCount(3);
    for (const [radio, id] of [
      [balanced, 'balanced'],
      [youth, 'youth'],
      [recovery, 'recovery'],
    ] as const)
      await expect(radio).toContainText(`피로 회복 ${trainingFocusInfo[id].recovery}`);
    await expect(balanced).toContainText('성장 ×1');
    await expect(youth).toContainText(`성장 ×${trainingFocusInfo.youth.developmentMultiplier}`);
    await expect(recovery).toContainText('라운드 성장 쉼');
    // The assistant has it: his pick is the focus in force and the choices are read-only.
    const pick = autoTrainingAdvice(before);
    await expect(owner).toContainText('자동 결정');
    await expect(owner).toContainText('개입 2 · 중요한 결정만');
    await expect(youth).toBeDisabled();
    await expect(
      focus.getByRole('radio', { name: FOCUS[pick.focus], exact: true }),
    ).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('training-advice')).toHaveText(
      `이번 라운드: ${FOCUS[pick.focus]} · ${pick.reason}`,
    );
    // Only level 1 hands the focus back to the owner; then a tap applies it at once.
    await chooseLevel(page, 1);
    await expect(owner).toContainText('직접 결정');
    await youth.click();
    await expect(youth).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('training-focus')).toHaveText('지금 유망주 집중');
    const outcome = page.getByTestId('action-outcome');
    await expect(outcome).toContainText('훈련 방향을 바꿨어요');
    await expect(outcome).toContainText('다음 라운드 정산부터 성장과 회복에 반영돼요.');
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
    await expect(youth).toHaveAttribute('aria-checked', 'true');
    const planned = await exportWorld(page);
    expect(planned.training).toBe('youth');
    expect(planned.intervention).toBe(1);
    expect(planned.round).toBe(0);
    expect(abilities(planned)).toEqual(abilities(before));

    await nav.getByRole('button', { name: '클럽 홈', exact: true }).click();
    // At level 1 another club's offer that arrived while the clock ran waits on home as a card.
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
    await recovery.click();
    await expect(recovery).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('save-status')).toContainText('저장 완료');
    await page.reload();
    await expect(recovery).toHaveAttribute('aria-checked', 'true');
    const restedPlan = await exportWorld(page);
    expect(restedPlan.training).toBe('recovery');
    expect(abilities(restedPlan)).toEqual(abilities(settled));
    // Level 2 hands training back to the assistant.
    await chooseLevel(page, 2);
    await expect(owner).toContainText('자동 결정');
    await expect(page.getByTestId('training-focus')).toContainText('수석코치가 정함');
    await expect(page.getByTestId('save-status')).toContainText('저장 완료');
    expect((await exportWorld(page)).intervention).toBe(2);
  });
}

test('hands the focus to the coach at level 2 and shows his pick', async ({ page }) => {
  // At level 1 the owner trains for youth while the starters are tired: the assistant would rest
  // them.
  const w = founded('training-coach');
  operate(w, { type: 'intervention', level: 1 });
  operate(w, { type: 'training', focus: 'youth' });
  for (const player of w.players) player.fatigue = 40;
  const advice = autoTrainingAdvice(w);
  expect(advice.focus).toBe('recovery');
  await seed(page, w);
  await page.goto('/');
  await continueSlot(page);
  await page.getByRole('button', { name: '훈련·육성', exact: true }).first().click();
  const focus = page.getByRole('radiogroup', { name: '훈련 방향', exact: true });
  const owner = page.getByTestId('decision-owner-training');
  const advised = page.getByTestId('training-advice');
  await expect(focus.getByRole('radio', { name: '유망주 집중', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(owner).toContainText('직접 결정');
  // His rule in words, and what he would pick this round.
  await expect(page.getByRole('region', { name: '훈련 방향' })).toContainText(
    '선발 평균 피로 30 이상',
  );
  await expect(advised).toHaveText(`맡기면 이번 라운드: 회복 집중 · ${advice.reason}`);
  await chooseLevel(page, 2);
  await expect(owner).toContainText('자동 결정');
  await expect(focus.getByRole('radio', { name: '회복 집중', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByTestId('training-focus')).toHaveText('지금 회복 집중 · 수석코치가 정함');
  await expect(advised).toHaveText(`이번 라운드: 회복 집중 · ${advice.reason}`);
  // What drives development reads the assistant's pick: no round growth while resting.
  await expect(
    page.getByRole('button', { name: /^훈련 방향 ×0 · 훈련 방향에서 보기$/ }),
  ).toBeVisible();
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  await expect(owner).toContainText('자동 결정');
  await expect(advised).toHaveText(`이번 라운드: 회복 집중 · ${advice.reason}`);
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
  // Who decides and the director's rule live here (→STAFF-13); level 2 hands him the academy.
  const delegation = page.getByRole('region', { name: '유소년 위임' });
  await expect(delegation.getByRole('checkbox')).toHaveCount(0);
  await expect(delegation.getByTestId('decision-owner-academy')).toContainText('자동 결정');
  await expect(delegation).toContainText('19세까지 1군 수준에 이르지 못한 유망주');
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
  // Academy investment and youth policy are only named here; the line opens 운영 전략.
  await nav.getByRole('button', { name: '훈련·육성', exact: true }).click();
  await page.getByRole('tab', { name: '유소년', exact: true }).click();
  await page.getByRole('button', { name: /^유소년 투자 · 유스 정책은 운영 전략에서/ }).click();
  await expect(page).toHaveURL(/\/business\?view=strategy$/);
});
