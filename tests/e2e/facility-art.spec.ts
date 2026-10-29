import { openPersonnel } from './personnel-navigation';
import { expect, test, type Page } from '@playwright/test';
import { checkpoint } from '../../apps/web/src/adapters/persistence';
import { currency } from '../../packages/catalogs/src/index';
import { advanceDays, createWorld, operate, prepareSeason } from '../../packages/engine/src/index';
import type { World } from '../../packages/contracts/src/types';
import { continueSlot } from './slots';
import { acknowledgeEvents } from './events';
import { expectHomeBounds, expectHomeSceneRatio, settle } from './layout';
import { readPresentationBaselines } from '../fixtures/presentation';
import { createThemeResolver } from '../../apps/web/src/presentation/theme';
import {
  FACILITY_ERAS,
  FACILITY_KINDS,
  type FacilityEra,
  type FacilityKind,
} from '../../apps/web/src/presentation/contracts';
import { facilityStageTop } from '../../apps/web/src/presentation/facilityImages';

const presentation = readPresentationBaselines();
const defaultThemeLabel = presentation.themeEntry.label;
const defaultTheme = createThemeResolver(presentation.theme, { url: presentation.themeUrl });
/** Each registered scene's resource paths (its default and responsive variants) → its default. */
const facilitySources = new Map(
  FACILITY_ERAS.flatMap((era) =>
    FACILITY_KINDS.flatMap((kind) =>
      Array.from({ length: facilityStageTop(kind) + 1 }, (_, stage) => {
        const scene = defaultTheme.facility({ era, kind, stage });
        return [scene.src, ...scene.variants.map((variant) => variant.src)].map(
          (src) => [new URL(src, 'https://presentation.invalid').pathname, scene.src] as const,
        );
      }).flat(),
    ),
  ),
);

/** Synthetic presentation fixture, not a claim to have simulated the intervening seasons. */
function artWorld(year: number, stadium = 0, trainingGround = 0, academyFacility = 0) {
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
  w.academyFacility = academyFacility;
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

async function expectArt(page: Page, kind: FacilityKind, era: FacilityEra, stage: number) {
  // Home stays mounted while hidden; inspect only the current place's facility art.
  const img = page.locator(`[data-facility-art="${kind}"] img`).filter({ visible: true });
  const source = defaultTheme.facility({ era, kind, stage }).src;
  await expect(img).toBeVisible();
  await expect(img).toHaveAttribute('src', source);
  expect(await img.getAttribute('alt')).toMatch(new RegExp(`${defaultThemeLabel}$`));
  // The overview uses the same current facility resource as preparation and the home scene.
  await img.scrollIntoViewIfNeeded();
  // A responsive variant reports its natural size at the chosen density (a 110px office
  // thumbnail reads 109×36), so the 3:1 check allows that rounding.
  await expect
    .poll(() =>
      img.evaluate(
        (el: HTMLImageElement) =>
          el.complete &&
          el.naturalHeight > 0 &&
          Math.abs(el.naturalWidth - 3 * el.naturalHeight) <= 3,
      ),
    )
    .toBe(true);
}

for (const scenario of [
  { year: 1950, era: 'heritage', stadium: 0, training: 0, academy: 0, width: 360, height: 740 },
  { year: 1980, era: 'terraces', stadium: 4, training: 3, academy: 2, width: 390, height: 844 },
  {
    year: 2020,
    era: 'contemporary',
    stadium: 8,
    training: 5,
    academy: 5,
    width: 1440,
    height: 960,
  },
] as const) {
  test(`loads only current ${scenario.era} facility scenes at ${scenario.width}px`, async ({
    page,
  }) => {
    const requested = new Set<string>();
    page.on('request', (request) => {
      const pathname = new URL(request.url()).pathname;
      // Only registered facility scenes count here, in whichever size the browser picked; UI
      // materials and frames load independently.
      const scene = facilitySources.get(pathname);
      if (scene) requested.add(scene);
    });
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await load(
      page,
      artWorld(scenario.year, scenario.stadium, scenario.training, scenario.academy),
    );
    await expectArt(page, 'stadium', scenario.era, scenario.stadium);
    const panorama = await expectHomeSceneRatio(page);
    await page.setViewportSize({ width: scenario.width, height: scenario.height + 160 });
    const taller = await expectHomeSceneRatio(page);
    expect(taller.height).toBeCloseTo(panorama.height, 2);
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await expectHomeBounds(page);
    await page.getByRole('button', { name: '전술·선발 준비', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '다음 경기 전술과 선발 준비' });
    await expect(dialog).toBeVisible();
    await expectArt(page, 'locker', scenario.era, scenario.stadium);
    await dialog.getByRole('button', { name: '준비 마치고 돌아가기', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await openPersonnel(page, 'players');
    const people = page.getByRole('tabpanel');
    const overview = page.getByTestId('facility-overview');
    for (const [tab, kind, stage] of [
      ['players', 'locker', scenario.stadium],
      ['manager', 'manager', 0],
      ['coaches', 'staff', 0],
    ] as const) {
      // A tab clicked while the page still slides in sits partly outside the view, and Firefox's
      // scroll-into-view then nudges the column by its 2px padding; home bounds need it at rest.
      await settle(page);
      await openPersonnel(page, tab);
      await expectArt(page, kind, scenario.era, stage);
      await expect(people.locator(':scope > :first-child')).toHaveAttribute(
        'data-testid',
        'facility-overview',
      );
      const art = overview.locator('[data-facility-art]');
      const bounds = (await art.boundingBox())!;
      expect(bounds.height).toBeGreaterThanOrEqual(144);
      // Firefox lays out in 1/60px units, so the 240px clamp can measure 240.00002.
      expect(Math.round(bounds.height)).toBeLessThanOrEqual(240);
      await expectHomeBounds(page);
    }
    await openPersonnel(page, 'market');
    await expect(overview).toHaveCount(0);
    await openPersonnel(page, 'training');
    await expect(page).toHaveURL(/\/training$/);
    await expectArt(page, 'training', scenario.era, scenario.training);
    const scene = (await overview.boundingBox())!;
    const focus = (await page
      .getByRole('region', { name: '훈련 방향', exact: true })
      .boundingBox())!;
    expect(scene.y + scene.height).toBeLessThanOrEqual(focus.y);
    await settle(page);
    await openPersonnel(page, 'academy');
    await expect(page).toHaveURL(/\/academy$/);
    await expectArt(page, 'academy', scenario.era, scenario.academy);
    await expect(overview).toHaveAccessibleName('유소년 아카데미');
    await expect(overview).toContainText(
      scenario.academy ? `${scenario.academy}단계 유소년 시설` : '기본 유소년 시설',
    );
    const academyScene = (await overview.boundingBox())!;
    const prospects = (await page
      .getByRole('region', { name: '유소년 아카데미', exact: true })
      .boundingBox())!;
    expect(academyScene.y + academyScene.height).toBeLessThanOrEqual(prospects.y);
    await expectHomeBounds(page);
    await openPersonnel(page, 'training');
    await expectArt(page, 'training', scenario.era, scenario.training);
    expect([...requested].sort()).toEqual(
      (['stadium', 'locker', 'training', 'academy', 'manager', 'staff'] as const)
        .map(
          (kind) =>
            defaultTheme.facility({
              era: scenario.era,
              kind,
              stage:
                kind === 'training'
                  ? scenario.training
                  : kind === 'academy'
                    ? scenario.academy
                    : kind === 'manager' || kind === 'staff'
                      ? 0
                      : scenario.stadium,
            }).src,
        )
        .sort(),
    );
  });
}

test('updates era, training and academy scenes only on actual completion, retaining them after reload', async ({
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
  operate(w, { type: 'facility', part: 'academy' });
  advanceDays(w, 89, undefined, false);
  expect(w.calendar?.day).toBe(152);
  expect(w.trainingGround).toBe(0);
  expect(w.facilityWorks?.training?.to).toBe(1);
  expect(w.academyFacility).toBe(0);
  expect(w.facilityWorks?.academy?.to).toBe(1);
  for (const item of w.inbox || []) item.read = true;
  await load(page, w);
  await expectArt(page, 'stadium', 'heritage', 0);
  await openPersonnel(page, 'training');
  await expectArt(page, 'training', 'heritage', 0);
  await openPersonnel(page, 'academy');
  await expectArt(page, 'academy', 'heritage', 0);
  await expect(page.getByTestId('facility-overview')).toContainText('기본 유소년 시설');
  await openPersonnel(page, 'training');
  await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
  await expectArt(page, 'training', 'terraces', 1);
  await acknowledgeEvents(page);
  const stop = page.getByRole('button', { name: '자동 진행 정지', exact: true });
  if (await stop.isVisible()) await stop.click();
  await expect(page.getByTestId('game-date')).toContainText('1970년 1월');
  await openPersonnel(page, 'academy');
  await expectArt(page, 'academy', 'terraces', 1);
  await expect(page.getByTestId('facility-overview')).toContainText('1단계 유소년 시설');
  await page.getByRole('button', { name: '클럽하우스', exact: true }).click();
  await expectArt(page, 'stadium', 'terraces', 0);
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  await expectArt(page, 'stadium', 'terraces', 0);
  await openPersonnel(page, 'training');
  await expectArt(page, 'training', 'terraces', 1);
  await openPersonnel(page, 'academy');
  await expectArt(page, 'academy', 'terraces', 1);
});
