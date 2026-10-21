import { expect, test, type Page } from '@playwright/test';
import { checkpoint } from '../../apps/web/src/adapters/persistence';
import { currency } from '../../packages/catalogs/src/index';
import { advanceDays, createWorld, operate, prepareSeason } from '../../packages/engine/src/index';
import type { World } from '../../packages/contracts/src/types';
import { continueSlot } from './slots';
import { acknowledgeEvents } from './events';
import { expectHomeBounds } from './layout';

/** Synthetic presentation fixture, not a claim to have simulated the intervening seasons. */
function artWorld(year: number, stadium = 0, trainingGround = 0) {
  const w = createWorld({
    country: 'ENG',
    name: 'Art Fixture',
    color: '#2e713d',
    seed: 'facility-art-browser',
    level: 'easy',
  });
  const shift = year - w.year;
  w.year = year;
  // Fresh synthetic founding epoch; no played career is being moved.
  delete w.people;
  w.currency = currency('ENG', year).code;
  for (const p of w.players) {
    p.born += shift;
    if (p.joined !== undefined) p.joined += shift;
    p.until += shift;
  }
  if (w.manager.born !== undefined) w.manager.born += shift;
  w.manager.until += shift;
  for (const member of w.staff || []) {
    if (member.born !== undefined) member.born += shift;
    if (member.until !== undefined) member.until += shift;
  }
  w.stadium = stadium;
  w.trainingGround = trainingGround;
  w.cash = '999999999999';
  prepareSeason(w);
  return w;
}

async function load(page: Page, world: World) {
  const { raw } = await checkpoint(world, 1, 0);
  await page.addInitScript((raw) => {
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
  await page.goto('/');
  await continueSlot(page);
  await expect(page.getByTestId('club-hub')).toBeVisible();
}

async function expectArt(page: Page, kind: string, era: string, stage: number) {
  const img = page.locator(`[data-facility-art="${kind}"] img`);
  const office = kind === 'manager' || kind === 'staff';
  await expect(img).toBeVisible();
  await expect(img).toHaveAttribute(
    'src',
    office ? `/art/scenes/${kind}-office-v1.webp` : `/art/scenes/${era}/${kind}-${stage}.webp`,
  );
  await expect(img).toHaveAttribute('alt', /픽셀아트$/);
  // The overview uses the same current facility resource as preparation and the home scene.
  await img.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      img.evaluate(
        (el: HTMLImageElement) =>
          el.complete && el.naturalWidth > 0 && el.naturalWidth === el.naturalHeight * 3,
      ),
    )
    .toBe(true);
}

for (const scenario of [
  { year: 1950, era: 'heritage', stadium: 0, training: 0, width: 360, height: 740 },
  { year: 1980, era: 'terraces', stadium: 4, training: 3, width: 390, height: 844 },
  { year: 2020, era: 'contemporary', stadium: 8, training: 5, width: 1440, height: 960 },
]) {
  test(`loads only current ${scenario.era} facility scenes at ${scenario.width}px`, async ({
    page,
  }) => {
    const requested = new Set<string>();
    page.on('request', (request) => {
      if (request.url().includes('/art/scenes/')) requested.add(new URL(request.url()).pathname);
    });
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await load(page, artWorld(scenario.year, scenario.stadium, scenario.training));
    await expectArt(page, 'stadium', scenario.era, scenario.stadium);
    await expectHomeBounds(page);
    await page.getByRole('button', { name: '전술·선발 준비', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '다음 경기 전술과 선발 준비' });
    await expect(dialog).toBeVisible();
    await expectArt(page, 'locker', scenario.era, scenario.stadium);
    await dialog.getByRole('button', { name: '준비 마치고 돌아가기', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: '선수단·스태프', exact: true }).click();
    const people = page.getByRole('tabpanel');
    const overview = page.getByTestId('facility-overview');
    const tabs = page.getByRole('tablist', { name: '선수단·스태프 보기' });
    for (const [tab, kind, stage] of [
      ['선수', 'locker', scenario.stadium],
      ['감독', 'manager', 0],
      ['스태프', 'staff', 0],
    ] as const) {
      await tabs.getByRole('tab', { name: tab, exact: true }).click();
      await expectArt(page, kind, scenario.era, stage);
      await expect(people.locator(':scope > :first-child')).toHaveAttribute(
        'data-testid',
        'facility-overview',
      );
      const art = overview.locator('[data-facility-art]');
      const bounds = (await art.boundingBox())!;
      expect(bounds.height).toBeGreaterThanOrEqual(144);
      expect(bounds.height).toBeLessThanOrEqual(240);
      await expectHomeBounds(page);
    }
    await tabs.getByRole('tab', { name: '이적시장', exact: true }).click();
    await expect(overview).toHaveCount(0);
    await page.getByRole('button', { name: '훈련·육성', exact: true }).click();
    await expectArt(page, 'training', scenario.era, scenario.training);
    await expect(page.getByRole('tabpanel').locator(':scope > :first-child')).toHaveAttribute(
      'data-testid',
      'facility-overview',
    );
    const scene = (await overview.boundingBox())!;
    const focus = (await page
      .getByRole('region', { name: '훈련 방향', exact: true })
      .boundingBox())!;
    expect(scene.y + scene.height).toBeLessThanOrEqual(focus.y);
    expect([...requested].sort()).toEqual(
      [
        `/art/scenes/${scenario.era}/locker-${scenario.stadium}.webp`,
        `/art/scenes/${scenario.era}/stadium-${scenario.stadium}.webp`,
        `/art/scenes/${scenario.era}/training-${scenario.training}.webp`,
        '/art/scenes/manager-office-v1.webp',
        '/art/scenes/staff-office-v1.webp',
      ].sort(),
    );
  });
}

test('updates the era on 1 January and the training scene on actual completion, retaining both after reload', async ({
  page,
}) => {
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  const w = artWorld(1969);
  operate(w, {
    type: 'settings',
    settings: {
      ...w.settings!,
      responsibilities: {
        manager: 'delegated',
        staff: 'delegated',
        contracts: 'delegated',
        recruitment: 'delegated',
        sales: 'delegated',
        academy: 'delegated',
        sponsors: 'delegated',
      },
      observations: { matchEve: false, windowOpen: false },
    },
  });
  advanceDays(w, 63, undefined, false);
  operate(w, { type: 'facility', part: 'training' });
  advanceDays(w, 89, undefined, false);
  expect(w.calendar?.day).toBe(152);
  expect(w.trainingGround).toBe(0);
  expect(w.facilityWorks?.training?.to).toBe(1);
  for (const item of w.inbox || []) item.read = true;
  await load(page, w);
  await expectArt(page, 'stadium', 'heritage', 0);
  await page.getByRole('button', { name: '훈련·육성', exact: true }).click();
  await expectArt(page, 'training', 'heritage', 0);
  await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
  await expectArt(page, 'training', 'terraces', 1);
  await acknowledgeEvents(page);
  const stop = page.getByRole('button', { name: '자동 진행 정지', exact: true });
  if (await stop.isVisible()) await stop.click();
  await expect(page.getByTestId('game-date')).toContainText('1970년 1월');
  await page.getByRole('button', { name: '클럽 홈', exact: true }).click();
  await expectArt(page, 'stadium', 'terraces', 0);
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  await expectArt(page, 'stadium', 'terraces', 0);
  await page.getByRole('button', { name: '훈련·육성', exact: true }).click();
  await expectArt(page, 'training', 'terraces', 1);
});
