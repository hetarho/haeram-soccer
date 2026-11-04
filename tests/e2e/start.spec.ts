import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { decode } from '../../apps/web/src/adapters/persistence';
import { generateHistory } from '../../packages/engine/src/history';
import { takeOver } from '../../packages/engine/src/takeover';
import type { World } from '../../packages/contracts/src/types';
import { openDirectionInForce } from './office';
import { settle, viewGeometry } from './layout';
import {
  filterListing,
  fundClub,
  generateWorld,
  openClub,
  startCareer,
  startFlow,
  takeOverClub,
} from './start';

async function exportWorld(page: Page): Promise<World> {
  await page.getByRole('button', { name: '설정', exact: true }).click();
  const menu = page.getByRole('dialog', { name: '설정' });
  const downloading = page.waitForEvent('download');
  await menu.getByRole('button', { name: '기록 내보내기', exact: true }).click();
  const file = await downloading;
  const raw = await readFile((await file.path())!, 'utf8');
  await menu.getByRole('button', { name: '창 닫기', exact: true }).click();
  return (await decode(raw)).world;
}

/**
 * The step on screen fits the phone (→WEB-15, WEB-63): nothing wider than the view, its every
 * control at least 44px and within the viewport once scrolled to, and the step's action reachable.
 */
async function expectStepFits(page: Page, scope: Locator) {
  const geometry = await viewGeometry(page);
  const measured = JSON.stringify(geometry);
  expect(geometry.documentWidth, measured).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.width, measured).toBeLessThanOrEqual(geometry.clientWidth);
  expect(geometry.documentScroll, measured).toBe(0);
  for (const control of await scope.locator('button:visible, summary:visible').all()) {
    await control.scrollIntoViewIfNeeded();
    const box = (await control.boundingBox())!;
    const label = (await control.getAttribute('aria-label')) ?? (await control.textContent());
    const at = JSON.stringify({ label, ...box });
    expect(box.height, at).toBeGreaterThanOrEqual(44);
    expect(box.x, at).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, at).toBeLessThanOrEqual(geometry.viewportWidth + 0.5);
    expect(box.y + box.height, at).toBeLessThanOrEqual(geometry.viewportHeight + 0.5);
  }
}

for (const viewport of [
  { width: 360, height: 740, tier: 'industrial' as const },
  { width: 390, height: 844, tier: 'oil' as const },
]) {
  test(`fits every start step and takes a club over at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const flow = startFlow(page);
    await expect(flow).toBeVisible();
    // 01 구단주: six tiers, 중견 사업가 chosen to begin with (→WEB-15, LEAGUE-13).
    const tiers = flow.getByTestId('start-tiers').getByRole('button');
    await expect(tiers).toHaveCount(6);
    await expect(tiers.filter({ hasText: '중견 사업가' })).toHaveAttribute('aria-pressed', 'true');
    await expectStepFits(page, flow);
    await tiers.filter({ hasText: viewport.tier === 'oil' ? '석유 재벌' : '산업 자본가' }).click();
    await flow.getByRole('button', { name: '다음 →', exact: true }).click();
    // 02 특성: eight traits, the count read as difficulty.
    const traits = flow.getByTestId('start-traits').getByRole('button');
    await expect(traits).toHaveCount(8);
    await expect(flow.getByTestId('trait-gauge')).toContainText('하드');
    await traits.filter({ hasText: '승리의 부적' }).click();
    await traits.filter({ hasText: '팬들의 친구' }).click();
    await expect(flow.getByTestId('trait-gauge')).toContainText('특성 2/5');
    await expectStepFits(page, flow);
    await flow.getByRole('button', { name: '다음 →', exact: true }).click();
    // 03 시대: eight decades, the seed behind 고급 설정.
    const decades = flow.getByTestId('start-decades').getByRole('button');
    await expect(decades).toHaveCount(8);
    await decades.filter({ hasText: '1930년대' }).click();
    await expect(flow).toContainText('1930/31 시즌 인수');
    await expectStepFits(page, flow);
    await flow.getByText('고급 설정', { exact: true }).click();
    const seed = `start-${viewport.width}`;
    await flow.getByLabel('세계 생성 시드').fill(seed);
    await flow.getByRole('button', { name: '세계 생성 →', exact: true }).click();

    // The club list: the fortune pinned at the top right, every row a target.
    const listing = flow.getByTestId('club-listing');
    await expect(listing).toBeVisible({ timeout: 30000 });
    await expect(listing).toContainText('구단주 자금');
    await expectStepFits(page, listing.getByRole('list').first());
    const { name, sheet } = await openClub(listing);
    await expect(sheet).toContainText('선수단');
    await expect(sheet).toContainText('감독');
    await expect(sheet).toContainText('경기장');
    await settle(page);
    await takeOverClub(page, name);

    // The career on screen is the one the engine makes from the same choices (→WORLD-13).
    const actual = await exportWorld(page);
    const choice = {
      tier: viewport.tier,
      traits: ['talisman', 'fansFriend'] as ('talisman' | 'fansFriend')[],
    };
    const reference = takeOver(generateHistory(seed, 1930), actual.playerClub, choice);
    expect(actual.clubs.find((club) => club.id === actual.playerClub)!.name).toBe(name);
    expect(actual.id).toBe(reference.id);
    expect(actual.owner).toEqual(reference.owner);
    expect(actual.players).toEqual(reference.players);
    expect(actual.cash).toBe(reference.cash);
    expect(actual.loan).toEqual(reference.loan);
    expect(actual.build).toEqual(reference.build);
    expect(actual.matchModel?.coverage).toBe('founding');
    // The HUD carries the owner's fortune beside the cash (→WEB-114).
    await expect(page.getByTestId('hud-fortune')).toBeVisible();

    // A reload continues the career; the start flow never shows again.
    await page.reload();
    await expect(page.getByTestId('club-hub')).toBeVisible();
    await expect(startFlow(page)).toHaveCount(0);
    expect((await exportWorld(page)).owner).toEqual(actual.owner);
  });
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
]) {
  test(`plays the world's history while a 1950 world is generated at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    // Twenty seasons are played before the list, which may wait for two feat cards.
    test.setTimeout(180000);
    await page.setViewportSize(viewport);
    await page.goto('/');
    // The season, the Elo top 10 and the champions on screen while it runs (→WEB-115), and the
    // view within the phone without document scrolling (→WEB-15, WEB-63).
    const listing = await generateWorld(
      page,
      { tier: 'midsize', decade: 1950, seed: `history-${viewport.width}` },
      async (generation) => {
        const geometry = await viewGeometry(page);
        const measured = JSON.stringify(geometry);
        expect(geometry.documentScroll, measured).toBe(0);
        expect(geometry.documentWidth, measured).toBeLessThanOrEqual(geometry.viewportWidth);
        expect(geometry.width, measured).toBeLessThanOrEqual(geometry.clientWidth);
        // Rows are text, not touch targets: the history offers nothing to tap.
        await expect(generation.getByTestId('generation-history').getByRole('button')).toHaveCount(
          0,
        );
      },
    );
    // A feat card takes no input and closes by itself before the list follows.
    await expect(page.getByTestId('generation-feat')).toHaveCount(0);
    await expect(listing).toContainText('구단주 자금');
  });
}

test('takes over without a direction choice and starts with standard defaults', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const listing = await generateWorld(page, { seed: 'start-direction' });
  await filterListing(listing, { country: 'ENG', division: 1 });
  const { name } = await openClub(listing);
  await takeOverClub(page, name);
  const w = await exportWorld(page);
  expect(w.clubs.find((club) => club.id === w.playerClub)!.tier).toBe(1);
  expect(w.build).toBeUndefined();
  expect(w.policy).toBeUndefined();
  expect(w.direction).toBeUndefined();
  await openDirectionInForce(page);
  const areas = page.getByTestId('direction-areas');
  await expect(areas.getByRole('heading', { level: 3 })).toHaveText('구단 방향 · 기본 방향');
  await expect(areas.getByRole('button')).toHaveCount(0);
});

test('the owner adds to the club’s opening cash, and the guide reads the takeover', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await startCareer(page, { seed: 'start-funding' });
  // A 1930 club opens with half a season's income (→ECON-36/38); an injection adds to it.
  const before = await exportWorld(page);
  expect(BigInt(before.cash)).toBeGreaterThan(0n);
  await fundClub(page);
  const funded = await exportWorld(page);
  expect(BigInt(funded.cash)).toBeGreaterThan(BigInt(before.cash));
  expect(BigInt(funded.owner!.fortune)).toBe(
    BigInt(before.owner!.fortune) - (BigInt(funded.cash) - BigInt(before.cash)),
  );
  const openGuide = async () => {
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await page
      .getByRole('dialog', { name: '설정' })
      .getByRole('button', { name: '클럽 키우기 가이드', exact: true })
      .click();
  };
  await openGuide();
  const guide = page.getByRole('dialog', { name: '클럽 키우기 가이드' });
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(guide.getByRole('listitem')).toHaveCount(3);
  await expect(guide).toContainText('구단의 운영 기준을 따르고');
  const close = guide.getByRole('button', { name: '가이드 확인 마치기', exact: true });
  await settle(page);
  const bounds = await close.boundingBox();
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  await close.click();
  expect(await exportWorld(page)).toEqual(funded);
});
