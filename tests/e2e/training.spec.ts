import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { decode } from '../../apps/web/src/adapters/persistence';
import {
  autoTrainingAdvice,
  createWorld,
  daysUntilNextMatch,
  overall,
  trainingFocusInfo,
} from '../../packages/engine/src/index';
import type { World } from '../../packages/contracts/src/types';
import { expectViewFits } from './layout';
import { stopOnlyFor } from './events';

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
    // Only the match eve may stop the clock here, so an incoming offer cannot interrupt it.
    await stopOnlyFor(page, ['match']);
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
    await expectViewFits(page);
    const before = await exportWorld(page);
    expect(before.training || 'balanced').toBe('balanced');
    // New clubs hand training to the staff until the owner picks a focus.
    expect(before.delegation?.training).toBe(true);
    expect(abilities(before)).toEqual(abilities(reference));

    const nav = page.getByRole('navigation', { name: '모바일 게임 메뉴' });
    const roster = page.locator('[class*="rosterCards"] article');
    // Delegated staff may sell a fringe player for a premium while the window is open.
    const openSquad = async (w: World) => {
      await nav.getByRole('button', { name: '선수단', exact: true }).click();
      await expect(roster).toHaveCount(w.players.filter((p) => p.status === 'active').length);
    };
    const openBusiness = () => nav.getByRole('button', { name: '구단 운영', exact: true }).click();
    await openSquad(before);
    for (const player of await roster.all()) await expect(player).toContainText('성장 +0.00');

    // Start the shared clock on home; choosing training elsewhere pauses it until we return.
    const date = page.getByTestId('game-date');
    await nav.getByRole('button', { name: '클럽 홈', exact: true }).click();
    await expect(date).toHaveText('1901년 8월 1일');
    await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
    await expect(date).toHaveText('1901년 8월 2일');
    await openBusiness();
    const mini = page.getByTestId('mini-clock');
    await expect(mini).toContainText('일시정지 · 홈에서 계속');
    const paused = await date.innerText();
    const dial = page
      .getByRole('region', { name: '구단 운영 방침' })
      .getByRole('radiogroup', { name: '훈련 방향', exact: true });
    const card = page.locator('[data-policy="training"]');
    const staff = dial.getByRole('radio', { name: '훈련 방향 스태프에 맡김', exact: true });
    const balanced = dial.getByRole('radio', { name: '훈련 방향 균형', exact: true });
    const youth = dial.getByRole('radio', { name: '훈련 방향 유망주 집중', exact: true });
    const recovery = dial.getByRole('radio', { name: '훈련 방향 회복 집중', exact: true });
    await expect(dial.getByRole('radio')).toHaveText([
      '스태프에 맡김',
      '회복 집중',
      '균형',
      '유망주 집중',
    ]);
    await expect(staff).toHaveAttribute('aria-checked', 'true');
    await expect(balanced).toHaveAttribute('aria-checked', 'false');
    await expect(card).toContainText('수석코치가 피로와 유망주를 보고 매 라운드 정해요');
    await expect(card).toContainText(
      `지금 수석코치의 선택: ${trainingFocusInfo[autoTrainingAdvice(before).focus].label}`,
    );
    await balanced.click();
    await expect(card).toContainText('성장과 회복을 함께 챙겨요');
    await expect(card).toContainText(`라운드마다 피로 ${trainingFocusInfo.balanced.recovery} 회복`);
    await youth.click();
    await expect(card).toContainText('27세 미만 성장이 빨라지고 회복은 줄어요');
    await expect(card).toContainText(`라운드마다 피로 ${trainingFocusInfo.youth.recovery} 회복`);
    await expect(card).toContainText(
      `유망주 성장 ×${trainingFocusInfo.youth.developmentMultiplier}`,
    );
    await expect(youth).toHaveAttribute('aria-checked', 'false');
    await recovery.click();
    await expect(card).toContainText('피로를 많이 풀고 라운드 성장은 쉬어요');
    await expect(card).toContainText('라운드 훈련 성장 없음');
    await youth.click();
    await card.getByRole('button', { name: '‘유망주 집중’ 적용', exact: true }).click();
    await expect(youth).toHaveAttribute('aria-checked', 'true');
    await expect(staff).toHaveAttribute('aria-checked', 'false');
    const outcome = page.getByTestId('action-outcome');
    await expect(outcome).toContainText('훈련 방향을 바꿨어요');
    await expect(outcome).toContainText('다음 라운드 정산부터 성장과 회복에 반영돼요.');
    await expect(date).toHaveText(paused);
    // Back home the same run resumes by itself.
    await mini.click();
    await expect(page.getByRole('button', { name: '자동 진행 정지', exact: true })).toBeVisible();
    await expect(date).not.toHaveText(paused);
    await page.getByRole('button', { name: '자동 진행 정지', exact: true }).click();
    await nav.getByRole('button', { name: '선수단', exact: true }).click();
    await expect(roster.first()).toBeVisible();
    for (const player of await roster.all()) await expect(player).toContainText('성장 +0.00');
    await expect(page.getByTestId('save-status')).toContainText('저장 완료');
    await page.reload();
    await openBusiness();
    await expect(youth).toHaveAttribute('aria-checked', 'true');
    const planned = await exportWorld(page);
    expect(planned.training).toBe('youth');
    expect(planned.delegation?.training).toBe(false);
    expect(planned.round).toBe(0);
    expect(abilities(planned)).toEqual(abilities(before));

    await nav.getByRole('button', { name: '클럽 홈', exact: true }).click();
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
        .filter({
          hasText: `${settled.year - player.born}세 · 능력 ${overall(player)} / 잠재력 ${Math.round(player.potential)}`,
        })
        .filter({ hasText: `성장 +${(player.developed || 0).toFixed(2)}` });
      await expect(article.first()).toBeVisible();
    }
    await openBusiness();
    await recovery.click();
    await card.getByRole('button', { name: '‘회복 집중’ 적용', exact: true }).click();
    await expect(recovery).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('save-status')).toContainText('저장 완료');
    await page.reload();
    await expect(recovery).toHaveAttribute('aria-checked', 'true');
    const restedPlan = await exportWorld(page);
    expect(restedPlan.training).toBe('recovery');
    expect(abilities(restedPlan)).toEqual(abilities(settled));
    // Handing training back to the staff is the dial's first step.
    await staff.click();
    await card.getByRole('button', { name: '‘스태프에 맡김’ 적용', exact: true }).click();
    await expect(staff).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('save-status')).toContainText('저장 완료');
    expect((await exportWorld(page)).delegation?.training).toBe(true);
  });
}
