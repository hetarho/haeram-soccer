import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { decode } from '../../apps/web/src/adapters/persistence';
import { createWorld, overall } from '../../packages/engine/src/index';
import type { World } from '../../packages/contracts/src/types';

async function exportWorld(page: Page): Promise<World> {
  await page
    .getByRole('navigation', { name: '모바일 게임 메뉴' })
    .getByRole('button', { name: '더보기', exact: true })
    .click();
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
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByText('고급 설정', { exact: true }).click();
    await page.getByLabel('세계 생성 시드').fill(founding.seed);
    await page.getByRole('button', { name: '넉넉한 출발', exact: false }).click();
    await page.getByRole('button', { name: '클럽 창단' }).click();
    const hub = page.getByTestId('club-hub');
    await expect(hub).toBeVisible();
    const geometry = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      width: document.documentElement.scrollWidth,
      viewportHeight: innerHeight,
      viewportWidth: innerWidth,
    }));
    expect(geometry.height, JSON.stringify(geometry)).toBeLessThanOrEqual(
      geometry.viewportHeight + 2,
    );
    expect(geometry.width, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.viewportWidth);
    const before = await exportWorld(page);
    expect(before.training || 'balanced').toBe('balanced');
    expect(abilities(before)).toEqual(abilities(reference));

    await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
    await expect(page.getByTestId('game-date')).toHaveText('1901년 8월 2일');
    const opener = hub.getByRole('button', { name: '선수 키우기·영입', exact: true });
    await opener.click();
    const studio = page.getByRole('dialog', { name: '선수 성장과 훈련' });
    await expect(studio).toBeVisible();
    const stopped = await page.getByTestId('game-date').innerText();
    await page.waitForTimeout(1200);
    await expect(page.getByTestId('game-date')).toHaveText(stopped);
    const choices = studio.getByRole('group', { name: '훈련 집중 선택' });
    const balanced = choices.getByRole('button', { name: /^균형 훈련/ });
    const youth = choices.getByRole('button', { name: /^유망주 집중/ });
    const recovery = choices.getByRole('button', { name: /^회복 집중/ });
    await expect(balanced).toHaveAttribute('aria-pressed', 'true');
    await expect(balanced).toBeDisabled();
    await expect(balanced).toContainText('기본 회복과 꾸준한 유망주 성장');
    await expect(balanced).toContainText('성장과 회복 모두 전문 훈련보다 느려요');
    await expect(youth).toContainText('젊은 선수의 잠재력을 더 빠르게 키워요');
    await expect(youth).toContainText('회복이 줄어요. 연전에는 선발 교체가 필요해요');
    await expect(recovery).toContainText('다음 경기를 위해 피로를 더 많이 줄여요');
    await expect(recovery).toContainText('이번 라운드의 추가 육성 기회를 양보해요');
    const prospects = studio.getByRole('region', { name: '성장하는 유망주' }).getByRole('article');
    await expect(prospects).toHaveCount(4);
    for (const player of await prospects.all()) await expect(player).toContainText('성장 +0.00');
    await youth.click();
    await expect(youth).toHaveAttribute('aria-pressed', 'true');
    await expect(studio.getByRole('status')).toContainText(
      '유망주 집중을 저장했어요. 다음 라운드 정산부터 적용됩니다.',
    );
    for (const player of await prospects.all()) await expect(player).toContainText('성장 +0.00');
    await studio.getByRole('button', { name: '훈련 준비 마치기', exact: true }).click();
    await expect(opener).toBeFocused();
    await expect(page.getByRole('button', { name: '자동 진행 시작', exact: true })).toBeVisible();
    await page.reload();
    await opener.click();
    await expect(youth).toHaveAttribute('aria-pressed', 'true');
    for (const player of await prospects.all()) await expect(player).toContainText('성장 +0.00');
    await studio.getByRole('button', { name: '훈련 준비 마치기', exact: true }).click();
    const planned = await exportWorld(page);
    expect(planned.training).toBe('youth');
    expect(planned.round).toBe(0);
    expect(abilities(planned)).toEqual(abilities(before));

    await page.getByTestId('hub-play').click();
    await page.getByRole('button', { name: '결과 보기', exact: true }).click();
    await expect(page.getByText(/90′ ·.*경기 종료/)).toBeVisible();
    await page
      .getByRole('navigation', { name: '모바일 게임 메뉴' })
      .getByRole('button', { name: '클럽 일지', exact: true })
      .click();
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
    await opener.click();
    for (const article of await prospects.all()) {
      const name = await article.locator('b').innerText();
      const player = settled.players.find((candidate) => candidate.name === name)!;
      expect(player).toBeDefined();
      await expect(article).toContainText(
        `능력 ${overall(player)} / 잠재력 ${Math.round(player.potential)}`,
      );
      await expect(article).toContainText(`성장 +${(player.developed || 0).toFixed(2)}`);
    }
    await recovery.click();
    await expect(recovery).toHaveAttribute('aria-pressed', 'true');
    await studio.getByRole('button', { name: '훈련 준비 마치기', exact: true }).click();
    await page.reload();
    await opener.click();
    await expect(recovery).toHaveAttribute('aria-pressed', 'true');
    await studio.getByRole('button', { name: '훈련 준비 마치기', exact: true }).click();
    const restedPlan = await exportWorld(page);
    expect(restedPlan.training).toBe('recovery');
    expect(abilities(restedPlan)).toEqual(abilities(settled));
  });
}
