import { openPersonnel } from './personnel-navigation';
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
  overall,
  trainingFocusInfo,
} from '../../packages/engine/src/index';
import { encode } from '../../apps/web/src/adapters/persistence';
import type { TrainingFocus, World } from '../../packages/contracts/src/types';
import { expectHomeBounds } from './layout';
import {
  acknowledgeEvents,
  closeOutcome,
  dismissMatchReport,
  matchReport,
  setResponsibility,
} from './events';
import { continueSlot } from './slots';
import { retainPerson, openEmployment } from '../../packages/engine/src/person-careers';
import { generateHistory } from '../../packages/engine/src/history';
import { takeOver } from '../../packages/engine/src/takeover';
import { DEFAULT_START, startCareer } from './start';

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

// Seeds whose first offer from another club comes after the first match eve: a career stops for
// offers too (level 2), and an offer card would cover home's controls.
for (const { seed: worldSeed, ...viewport } of [
  { width: 360, height: 740, seed: 'training-ui-360' },
  { width: 390, height: 844, seed: 'training-ui-b' },
]) {
  test(`saves actual training without free growth and keeps home compact at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    // A takeover, a run of days, a reload and a watched match in one journey.
    test.slow();
    await page.setViewportSize(viewport);
    await page.goto('/');
    await startCareer(page, { seed: worldSeed });
    const hub = page.getByTestId('club-hub');
    await expect(hub).toBeVisible();
    await setResponsibility(page, '스태프 인사', 'direct');
    await expectHomeBounds(page);
    const before = await exportWorld(page);
    // The same takeover made in Node from the start's choices (→WORLD-13).
    const { tier, decade } = DEFAULT_START;
    const reference = takeOver(generateHistory(worldSeed, decade), before.playerClub, {
      tier,
      traits: [],
    });
    // The clock runs for a few days below; it must not reach the first match day.
    expect(daysUntilNextMatch(reference)).toBeGreaterThan(4);
    expect(abilities(before)).toEqual(abilities(reference));

    const nav = page.getByRole('navigation', { name: '모바일 게임 메뉴' });
    const roster = page.locator('[class*="rosterCards"] article');
    // Delegated staff may sell a fringe player for a premium while the window is open.
    const openSquad = async (w: World) => {
      await openPersonnel(page, 'players');
      await expect(roster).toHaveCount(w.players.filter((p) => p.status === 'active').length);
    };
    const openTraining = () => openPersonnel(page, 'training');
    await openSquad(before);
    for (const player of await roster.all()) await expect(player).toContainText('성장 +0.00');

    // Start the shared clock on home; it keeps running on other views until the owner stops it.
    const date = page.getByTestId('game-date');
    await nav.getByRole('button', { name: '클럽하우스', exact: true }).click();
    await expect(date).toHaveText('1930.08.01');
    await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
    await expect(date).toHaveText('1930.08.02');
    await openTraining();
    const mini = page.getByRole('region', { name: '시즌 진행', exact: true });
    // Still running in 훈련. Stopped now, the days computed ahead (three at x1) are shown at the
    // pace first, short of the first match eve; the date rests once play is offered again.
    await expect(mini.getByRole('button', { name: '자동 진행 정지', exact: true })).toBeVisible();
    await mini.getByRole('button', { name: '자동 진행 정지', exact: true }).click();
    await expect(mini.getByRole('button', { name: '자동 진행 시작', exact: true })).toBeEnabled();
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

    // The coaches set training by their own rules: 훈련 offers the owner no training action.
    await expect(page.getByRole('button', { name: /훈련 제안·강행/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /개별 훈련/ })).toHaveCount(0);
    await expect(date).toHaveText(paused);
    // Starting it again from the buttons-only clock continues the same run.
    await mini.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
    await expect(date).not.toHaveText(paused);
    // The run comes to rest by itself, at the latest on the first match eve, so it stays short of
    // round 1 and a clock left running cannot resume after the reload (→WEB-64). Observe that stop
    // landing first: on the eve it opens the eve's report, which would otherwise cover the
    // navigation below whenever the stop lands between two clicks.
    await expect(mini.getByRole('button', { name: '자동 진행 시작', exact: true })).toBeEnabled();
    const atEve =
      (await date.innerText()) ===
      `1930.08.${String(daysUntilNextMatch(reference)).padStart(2, '0')}`;
    if (atEve) {
      await expect(matchReport(page)).toBeVisible();
      await dismissMatchReport(page);
      await expect(matchReport(page)).toHaveCount(0);
    }
    await openPersonnel(page, 'players');
    await expect(roster.first()).toBeVisible();
    for (const player of await roster.all()) await expect(player).toContainText('성장 +0.00');
    await expect(page.getByTestId('save-status')).toContainText('저장 완료');
    // A run resting on the first match eve reopens its report after the reload and waits there
    // for the match below.
    await page.reload();
    if (atEve) {
      await expect(matchReport(page)).toBeVisible();
      await dismissMatchReport(page);
    }
    await openTraining();
    const planned = await exportWorld(page);
    await expect(page.getByTestId('training-focus')).toHaveText(
      `지금 ${FOCUS[autoTrainingAdvice(planned).focus]} · 코치 판단`,
    );
    expect(planned.round).toBe(0);
    expect(abilities(planned)).toEqual(abilities(before));

    await nav.getByRole('button', { name: '클럽하우스', exact: true }).click();
    // An offer that arrived while the clock ran waits on home as a card; answer it first.
    await acknowledgeEvents(page);
    await watchNext(page, { manual: true });
    await page.getByRole('button', { name: '결과 보기', exact: true }).click();
    await expect(page.getByText(/90(\+\d+)?′ ·.*경기 종료/)).toBeVisible();
    await nav.getByRole('button', { name: '클럽하우스', exact: true }).click();
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
    // After the round the assistant calls the next by his rule.
    await expect(page.getByTestId('training-focus')).toHaveText(
      `지금 ${FOCUS[autoTrainingAdvice(settled).focus]} · 코치 판단`,
    );
  });
}

test("shows the assistant's own call and his rule, read only (→CLUB-13, WEB-70)", async ({
  page,
}) => {
  // A tired squad: by his rule the assistant rests it.
  const w = founded('training-coach');
  for (const player of w.players) player.fatigue = 35;
  const advice = autoTrainingAdvice(w);
  expect(advice.focus).toBe('recovery');
  await seed(page, w);
  await page.goto('/');
  await continueSlot(page);
  await openPersonnel(page, 'training');
  await expect(page.getByTestId('training-focus')).toHaveText('지금 회복 · 코치 판단');
  await expect(page.getByTestId('training-advice')).toHaveText(advice.reason);
  // His rule in words.
  await expect(page.getByRole('region', { name: '훈련 방향' })).toContainText(
    '선발 평균 피로 30 이상',
  );
  // The owner neither suggests nor forces a focus (→STAFF-19 withdrawn).
  await expect(page.getByRole('button', { name: /훈련 제안·강행/ })).toHaveCount(0);
  // What drives development reads the focus in force: little round growth while resting.
  await page.getByText('성장 요인·투자·스태프 자세히', { exact: true }).click();
  await expect(
    page.getByRole('button', { name: /^훈련 방향 ×0.4 · 1군 훈련에서 보기$/ }),
  ).toBeVisible();
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
  await openPersonnel(page, 'academy');
  await expect(page).toHaveURL(/\/academy$/);
  // Prospects stand in their age group (→CLUB-16); a 17-year-old is in U-19.
  await expect(page.getByTestId('age-group-u19')).toContainText(prospect.name);
  await expect(page.getByTestId('age-group-u17')).toContainText('0명');
  // The youth director sets the academy's focus by his rule, to 데뷔 시점 and 육성 목표 (→CLUB-31).
  await expect(page.getByTestId('youth-focus')).toContainText('코치 판단');
  const youthTraining = page.getByRole('region', { name: '유소년 훈련 방향' });
  await expect(youthTraining).toContainText('데뷔 시점 표준 · 육성 목표 표준');
  await expect(page.getByRole('button', { name: /훈련 제안·강행/ })).toHaveCount(0);
  // Who decides and the director's rule live here (→STAFF-13); level 2 hands him the academy.
  const delegation = page.getByRole('region', { name: '유소년 위임' });
  await expect(delegation.getByRole('checkbox')).toHaveCount(0);
  await expect(delegation.getByTestId('decision-owner-academy')).toContainText('자동');
  // The director follows 육성 목표 and 데뷔 시점, read as founded (→CLUB-32).
  await expect(delegation).toContainText(
    '19세에 잠재력이 같은 포지션 1군 최하위에 못 미치는 아이를 내보내요',
  );
  await expect(delegation.locator('[data-row="youthGoal"]')).toContainText('표준');
  const academy = page.getByRole('region', { name: '유소년 아카데미' });
  await expect(page.getByTestId('academy-intake')).toContainText('3월 15일');
  await expect(academy.getByRole('listitem')).toHaveCount(1);
  await expect(academy).toContainText(prospect.name);
  await academy
    .getByRole('button', { name: `${prospect.name} 승격·방출 검토`, exact: true })
    .click();
  const review = page.getByRole('dialog', { name: '유소년 승격·방출 검토', exact: true });
  await expect(review).toContainText('승격 후 연봉');
  await review.getByRole('button', { name: `${prospect.name} 1군 승격`, exact: true }).click();
  await expect(review).toContainText('이미 승격·방출되었거나');
  await review.getByRole('button', { name: '취소', exact: true }).click();
  await closeOutcome(page, '유소년을 1군으로 올렸어요');
  await expect(academy.getByRole('listitem')).toHaveCount(0);
  await expect(academy).toContainText('아직 아카데미 선수가 없어요');
  const arrived = page.getByRole('region', { name: '승격한 선수 관리' });
  await expect(arrived).toContainText(prospect.name);
  // His first-team training reads as the assistant sets it; nothing to change.
  await expect(arrived.getByTestId('arrived-training')).toContainText('1군 훈련');
  await expect(arrived.getByRole('button', { name: /훈련 (변경|보기)/ })).toHaveCount(0);
  await openPersonnel(page, 'players');
  const roster = page.locator('[class*="rosterCards"] article');
  await expect(roster).toHaveCount(squad + 1);
  await expect(roster.filter({ hasText: prospect.name })).toHaveCount(1);
  // The academy's rows and investment read as founded; none opens an editor (→ECON-25).
  await openPersonnel(page, 'training');
  await openPersonnel(page, 'academy');
  await expect(page.locator('[data-row="youthGoal"]')).toContainText('표준');
  await expect(page.locator('[data-row="debut"]')).toContainText('표준');
  await expect(page.getByTestId('academy-direction')).toContainText('기본 운영');
  await expect(page.getByRole('button', { name: /^(육성 목표|데뷔 시점) · / })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: '유소년 업무 기준', exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/\/academy$/);
});

test("reads each player's focus as the assistant sets it and lists adaptation (→CLUB-11, PLAYER-12)", async ({
  page,
}) => {
  const w = founded('training-player');
  const player = [...activePlayers(w)].sort((a, b) => b.fatigue - a.fatigue)[0]!;
  // At 40 the assistant rests a player whatever the squad does (→CLUB-13).
  player.fatigue = 45;
  await seed(page, w);
  await page.goto('/');
  await continueSlot(page);
  await openPersonnel(page, 'training');

  const own = page.getByRole('region', { name: '선수별 육성' });
  await expect(own.getByTestId('own-focus-count')).toContainText('따로 훈련');
  const row = own.getByTestId(`player-focus-${player.id}`);
  await expect(row).toContainText('회복');
  await expect(row).toContainText('코치 판단');
  await expect(own.getByRole('button', { name: /개별 훈련/ })).toHaveCount(0);
  // His sheet reads the same call, with no training action of its own.
  await own.getByRole('button', { name: `${player.name} 선수 기록`, exact: true }).click();
  const sheet = page.getByRole('dialog', { name: player.name, exact: true });
  await expect(sheet.getByTestId('player-training')).toContainText('회복 훈련 · 코치 판단');
  await expect(sheet.getByRole('button', { name: /훈련 (변경|보기)/ })).toHaveCount(0);
  await sheet.getByRole('button', { name: '창 닫기', exact: true }).click();

  // Every first-team player's adaptation and multiplier, lowest first.
  const list = page.getByTestId('adaptation-list');
  await expect(list.getByRole('listitem')).toHaveCount(activePlayers(w).length);
  await expect(list).toContainText('0.80 · ×1');
  await expect(list).toContainText('적응 속도 ×');
});
