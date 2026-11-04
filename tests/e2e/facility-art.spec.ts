import { seedRawCheckpoint } from './checkpoint-storage';
import { openPersonnel } from './personnel-navigation';
import { openClubhouse } from './competition-navigation';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { checkpoint } from '../../apps/web/src/adapters/persistence';
import { advanceDays, operate } from '../../packages/engine/src/index';
import { careerWorld } from '../../packages/engine/src/career.testkit';
import { startWork } from '../../packages/engine/src/testing';
import type { World } from '../../packages/contracts/src/types';
import { continueSlot } from './slots';
import { acknowledgeEvents } from './events';
import { expectHomeBounds, settle } from './layout';
import { enterOffice, homeAreas, officeDialog } from './office';
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
  // A club taken over in a world made fresh in `year`; its facilities set to the stages shown.
  const w = careerWorld({ country: 'ENG', seed: 'facility-art-browser', year });
  w.stadium = stadium;
  w.trainingGround = trainingGround;
  w.academyFacility = academyFacility;
  w.cash = '999999999999';
  return w;
}

async function load(page: Page, world: World) {
  const { raw } = await checkpoint(world, 1, 0);
  await seedRawCheckpoint(page, raw);
  await page.goto('/');
  await continueSlot(page);
  await expect(page.getByTestId('club-hub')).toBeVisible();
}

/** The clubhouse's office entrance, which shows the manager's room (→WEB-11/72). */
const officeEntrance = (page: Page) =>
  page.getByTestId('club-hub').locator('[data-home-part="office"]');

async function expectArt(
  scope: Page | Locator,
  kind: FacilityKind,
  era: FacilityEra,
  stage: number,
) {
  // Home stays mounted while hidden; inspect only the current place's facility art.
  const img = scope.locator(`[data-facility-art="${kind}"] img`).filter({ visible: true });
  const source = defaultTheme.facility({ era, kind, stage }).src;
  await expect(img).toBeVisible();
  await expect(img).toHaveAttribute('src', source);
  expect(await img.getAttribute('alt')).toMatch(new RegExp(`${defaultThemeLabel}$`));
  // The overview uses the same current facility resource as the home scene.
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

/** The manager's office scene heads the 결재라인 overview, opened from the bottom controls. */
async function expectOverviewArt(page: Page, era: FacilityEra) {
  const sheet = page.getByRole('dialog', { name: '결재 설정', exact: true });
  await page
    .locator('[data-ui="season-transport"]')
    .getByRole('button', { name: '결재 설정', exact: true })
    .click();
  await expect(sheet).toBeVisible();
  // Home's office entrance shows the same room behind the sheet.
  await expectArt(sheet, 'manager', era, 0);
  await sheet.getByRole('button', { name: '창 닫기', exact: true }).click();
  await expect(sheet).toHaveCount(0);
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
    // Home, the office, six office-section visits and the 결재라인 overview.
    test.slow();
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
    // The clubhouse's office entrance keeps the manager room, and each investment area's card
    // under it its own scene (→WEB-11/72).
    const entrance = officeEntrance(page);
    await expect(entrance.locator('[data-facility-art]')).toHaveCount(1);
    await expect(entrance.locator('[data-facility-art]')).toHaveAttribute(
      'data-facility-art',
      'manager',
    );
    await expect(homeAreas(page).locator('[data-facility-art]')).toHaveCount(8);
    await expectHomeBounds(page);
    await expectArt(entrance, 'manager', scenario.era, 0);
    await page.getByRole('button', { name: '상세 리포트', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '다음 경기 상세 리포트' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '확인하고 홈으로', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const overview = page.getByTestId('facility-overview');
    // The 결재함 opens with no room scene in it (→WEB-39); the manager room stays on the home
    // entrance behind it and in 결재 설정 (→WEB-72).
    await settle(page);
    await enterOffice(page);
    await expect(officeDialog(page).locator('[data-facility-art]')).toHaveCount(0);
    await expectHomeBounds(page);
    // 1군 keeps its current locker room, which follows the completed stadium; 코치진 the
    // manager's office and the coaching workroom, each over its own people (→WEB-43/72).
    for (const [tab, rooms] of [
      ['players', [['locker', scenario.stadium]]],
      [
        'coaches',
        [
          ['manager', 0],
          ['staff', 0],
        ],
      ],
    ] as const) {
      // A tab clicked while the page still slides in sits partly outside the view, and Firefox's
      // scroll-into-view then nudges the column by its 2px padding; home bounds need it at rest.
      await settle(page);
      await openPersonnel(page, tab);
      await expect(overview).toHaveCount(rooms.length);
      await expect(page.locator('[data-facility-art]').filter({ visible: true })).toHaveCount(
        rooms.length,
      );
      await expectHomeBounds(page);
      // A lazily loaded room further down loads once it is scrolled to.
      for (const [kind, stage] of rooms) await expectArt(page, kind, scenario.era, stage);
    }
    // The people follow their own rooms: the manager under his office and the posts under the
    // workroom.
    const [office, workroom] = await overview.evaluateAll((figures) =>
      figures.map((figure) => figure.getBoundingClientRect().bottom),
    );
    const manager = (await page.getByTestId('manager-card').boundingBox())!;
    expect(office).toBeLessThanOrEqual(manager.y);
    expect(manager.y + manager.height).toBeLessThanOrEqual(workroom!);
    // The column reads from its top again, as the rest of this visit expects.
    await page.getByTestId('view-scroller').evaluate((element) => element.scrollTo(0, 0));
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
    await expectOverviewArt(page, scenario.era);
    await openPersonnel(page, 'training');
    await expectArt(page, 'training', scenario.era, scenario.training);
    // Home's 경기장 card shows the stadium at its stage from outside (→WEB-11), so that scene may
    // load too; nothing of another era or stage does.
    const stadium = defaultTheme.facility({
      era: scenario.era,
      kind: 'stadium',
      stage: scenario.stadium,
    }).src;
    expect([...requested].filter((scene) => scene !== stadium).sort()).toEqual(
      [
        ...(['training', 'academy', 'manager', 'locker', 'staff'] as const).map(
          (kind) =>
            defaultTheme.facility({
              era: scenario.era,
              kind,
              stage:
                kind === 'training'
                  ? scenario.training
                  : kind === 'academy'
                    ? scenario.academy
                    : kind === 'locker'
                      ? scenario.stadium
                      : 0,
            }).src,
        ),
      ].sort(),
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
  // Works already under way in the saved career: no one starts one now, but these finish on their
  // day (→ECON-32).
  startWork(w, 'training');
  startWork(w, 'academy');
  advanceDays(w, 89, undefined, false);
  expect(w.calendar?.day).toBe(152);
  expect(w.trainingGround).toBe(0);
  expect(w.facilityWorks?.training?.to).toBe(1);
  expect(w.academyFacility).toBe(0);
  expect(w.facilityWorks?.academy?.to).toBe(1);
  for (const item of w.inbox || []) item.read = true;
  await load(page, w);
  await expectOverviewArt(page, 'heritage');
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
  await expect(page.getByTestId('game-date')).toContainText('1970.01.');
  await openPersonnel(page, 'academy');
  await expectArt(page, 'academy', 'terraces', 1);
  await expect(page.getByTestId('facility-overview')).toContainText('1단계 유소년 시설');
  // The home entrance's manager room follows the calendar era too (→WEB-72).
  await openClubhouse(page);
  await expect(officeEntrance(page).locator('[data-facility-art]')).toHaveCount(1);
  await expectArt(officeEntrance(page), 'manager', 'terraces', 0);
  await expectOverviewArt(page, 'terraces');
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  await expectOverviewArt(page, 'terraces');
  await openPersonnel(page, 'training');
  await expectArt(page, 'training', 'terraces', 1);
  await openPersonnel(page, 'academy');
  await expectArt(page, 'academy', 'terraces', 1);
});
