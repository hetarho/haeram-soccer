import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  resolvePackUrl,
  resolveRegistryUrl,
  resolveResourceUrl,
} from '../../apps/web/src/presentation/registry';
import {
  FACILITY_ERAS,
  validateThemePack,
  type FacilityKind,
} from '../../apps/web/src/presentation/contracts';
import { facilityStageTop } from '../../apps/web/src/presentation/facilityImages';
import { createThemeResolver } from '../../apps/web/src/presentation/theme';
import { pendingDecisions } from '../../packages/engine/src/stopping';
import { readPresentationBaselines } from '../fixtures/presentation';
import { clubhouseTab } from './competition-navigation';
import { dismissFeedback } from './feedback';
import { horizontalOverflow, settle } from './layout';
import {
  approvalOrder,
  approvalRequest,
  approvalRows,
  leaveOffice,
  officeDialog,
  officeEntrance,
  officeMenu,
  officePage,
  officeTitle,
  reviewButton,
  TEAM_WORK,
  teamDirectory,
  teamEntry,
  teamReturn,
  teamTabs,
} from './office';
import { managerCard } from './personnel-navigation';
import { importResponsibilityCareer, pendingAcquisitionCareer } from './responsibility-fixtures';

const PREFERENCE_KEY = 'haeram-soccor:presentation';
const { localeRegistry, themeRegistry, root } = readPresentationBaselines();

/**
 * The material a pack's progression controller wears (→WEB-91), read from the pack itself: its
 * transport token names an image role, which resolves against the pack's own address.
 */
function controllerMaterial(entry: (typeof themeRegistry.entries)[number]) {
  const url = resolvePackUrl(entry, resolveRegistryUrl('theme'));
  const pack = JSON.parse(readFileSync(`${root}${url.slice(1)}`, 'utf8')) as {
    tokens: { ui: Record<string, string> };
    images: { ui: Record<string, { resource: string }> };
  };
  const role = /^var\(--(.+)\)$/.exec(pack.tokens.ui['image-transport-material'])?.[1];
  expect(role, `${entry.id} names its controller material`).toBeTruthy();
  return resolveResourceUrl(pack.images.ui[role!].resource, url);
}

/**
 * Every resource a pack resolves for one facility role, in any era or stage and responsive size,
 * through the shared resolver (→ARCH-32): a scene shows the selected theme's own artwork.
 */
function sceneResources(entry: (typeof themeRegistry.entries)[number], kind: FacilityKind) {
  const url = resolvePackUrl(entry, resolveRegistryUrl('theme'));
  const pack = validateThemePack(JSON.parse(readFileSync(`${root}${url.slice(1)}`, 'utf8')));
  const resolver = createThemeResolver(pack, { url });
  // The stadium's area card shows its exterior (→WEB-11).
  const views = kind === 'stadium' ? [undefined, 'exterior' as const] : [undefined];
  return FACILITY_ERAS.flatMap((era) =>
    Array.from({ length: facilityStageTop(kind) + 1 }, (_, stage) =>
      views.flatMap((view) => {
        const scene = resolver.facility({ era, kind, stage, view });
        return [scene.src, ...scene.variants.map((variant) => variant.src)];
      }),
    ).flat(),
  ).map((src) => new URL(src, 'https://pack.invalid').pathname);
}
/** Home's scenes: the office entrance's room, then each investment area's card (→WEB-11). */
const HOME_SCENES: readonly FacilityKind[] = [
  'manager',
  'training',
  'academy',
  'staff',
  'stadium',
  'manager',
  'stadium',
  'manager',
  'locker',
];

/**
 * The visible scenes of the current place, in order, each loaded from this theme's resources in a
 * slot reserved before it loads (→WEB-72/91).
 */
async function expectScenes(
  page: Page,
  entry: (typeof themeRegistry.entries)[number],
  kinds: readonly FacilityKind[],
) {
  const art = page.locator('[data-facility-art]').filter({ visible: true });
  await expect(art).toHaveCount(kinds.length);
  for (const [index, kind] of kinds.entries()) {
    const scene = art.nth(index);
    await expect(scene).toHaveAttribute('data-facility-art', kind);
    // The slot holds its height whether or not the image has arrived.
    expect((await scene.boundingBox())!.height).toBeGreaterThanOrEqual(100);
    const image = scene.locator('img');
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        image.evaluate((element: HTMLImageElement) =>
          element.complete && element.naturalWidth > 0 ? new URL(element.currentSrc).pathname : '',
        ),
      )
      .toBeTruthy();
    const loaded = await image.evaluate(
      (element: HTMLImageElement) => new URL(element.currentSrc).pathname,
    );
    expect(sceneResources(entry, kind), `${entry.id} ${kind}`).toContain(loaded);
  }
}

/**
 * A touch target keeps 44 CSS px each way; layout works in 1/64 px, so snap the float noise. It is
 * measured once finite entrance motion has landed: a review card's scale entrance draws its 44px
 * return smaller until it ends.
 */
async function expectTarget(target: Locator) {
  await settle(target.page());
  const size = await target.evaluate((element) => {
    const { width, height } = element.getBoundingClientRect();
    const snap = (value: number) => Math.round(value * 64) / 64;
    return { width: snap(width), height: snap(height) };
  });
  expect(size.width).toBeGreaterThanOrEqual(44);
  expect(size.height).toBeGreaterThanOrEqual(44);
}

/**
 * Our people's detailed page through the primary 팀 entry, its list's tab and its named
 * management link (→WEB-112).
 */
async function openSection(page: Page, name: string) {
  const people = TEAM_WORK[name];
  if (!people) throw new Error(`팀 has no ${name} page`);
  {
    const entry = teamEntry(page);
    await expectTarget(entry);
    await entry.click();
    const list = teamTabs(page).getByRole('tab', { name: people.tab, exact: true });
    await expectTarget(list);
    await list.click();
    await expect(list).toHaveAttribute('aria-selected', 'true');
    const manage = teamDirectory(page).getByRole('button', { name: people.manage, exact: true });
    await expectTarget(manage);
    await manage.click();
    await expect(teamReturn(page)).toBeVisible();
    await expect(officeMenu(page)).toHaveCount(0);
    await expect(entry).toHaveAttribute('aria-current', 'page');
  }
}

// Every registered theme, from the registry rather than a list of our own (→ARCH-32, →WEB-91).
for (const theme of themeRegistry.entries) {
  test(`${theme.id}: 결재함 review returns to the remaining queue and 팀 leads to the actual people under their rooms at 360px and desktop`, async ({
    page,
  }) => {
    // Two widths through home, the queue, a review, its return and 팀's two detailed pages.
    test.slow();
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
      PREFERENCE_KEY,
      JSON.stringify({ themeId: theme.id, localeId: localeRegistry.defaultId }),
    ] as const);
    await page.setViewportSize({ width: 360, height: 740 });
    const w = pendingAcquisitionCareer();
    w.settings!.mode = 'manual';
    w.settings!.observations = { matchEve: false, windowOpen: false };
    const ids = approvalOrder(w);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    await importResponsibilityCareer(page, w);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.id);
    // The controller keeps the selected pack's own material (→WEB-91).
    const transport = page.locator('[data-ui="season-transport"]');
    expect(await transport.evaluate((node) => getComputedStyle(node).backgroundImage)).toContain(
      controllerMaterial(theme),
    );

    // The bottom controls' 결재함 opens the queue straight away (→WEB-18/39).
    const inbox = page.getByTestId('approval-inbox');
    await expect(inbox).toHaveAccessibleName(new RegExp(`^결재함 · 대기 ${ids.length}건`));
    await expectTarget(inbox);
    await inbox.click();
    await expect(officeTitle(page)).toHaveText('결재함');
    const rows = approvalRows(page);
    await expect(rows).toHaveCount(ids.length);
    expect(await rows.evaluateAll((items) => items.map((item) => item.dataset.requestId))).toEqual(
      ids,
    );
    // The queue opens as a modal over the page it was asked from, with no room scene and no
    // immediate owner action in it; its first request is a full touch target on the phone's
    // first view (→WEB-39).
    const queue = officeDialog(page);
    await expect(queue.locator('[data-facility-art]')).toHaveCount(0);
    await expect(queue.getByTestId('quick-actions')).toHaveCount(0);
    const first = reviewButton(page, ids[0]!);
    await expectTarget(first);
    await expect(first).toBeInViewport();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    // Review → decline → the refreshed queue, focused on the request now in its place (→WEB-100).
    await first.click();
    const request = approvalRequest(page);
    await expect(request).toHaveAttribute('data-request-id', ids[0]!);
    // One heading with its 결재 기한, the actual target and one named return, within the phone's
    // width in this theme (→WEB-39/63/100).
    const reviewed = pendingDecisions(w).find((item) => item.id === ids[0])!;
    const target = w.bids!.find((bid) => bid.id === reviewed.ref)!.offer!.player;
    await expect(request.getByRole('heading')).toHaveText([reviewed.title]);
    await expect(request.getByTestId('approval-deadline')).toBeVisible();
    await expect(request.getByTestId('bid-facts')).toContainText(target.name);
    await expect(request.getByTestId('bid-facts')).toContainText('역제안 이적료');
    await expect(request.getByRole('button', { name: '취소', exact: true })).toHaveCount(0);
    await expectTarget(request.getByRole('button', { name: '결재함으로', exact: true }));
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await request.getByRole('button', { name: '거절', exact: true }).click();
    await expect(officeTitle(page)).toHaveText('결재함');
    await expect(rows).toHaveCount(ids.length - 1);
    const next = reviewButton(page, ids[1]!);
    await expect(next).toBeFocused();
    // The keyboard opens the next review; its named return leads back to the same queue.
    await page.keyboard.press('Enter');
    await expect(request).toHaveAttribute('data-request-id', ids[1]!);
    await request.getByRole('button', { name: '결재함으로', exact: true }).click();
    await expect(rows).toHaveCount(ids.length - 1);
    await expect(next).toBeFocused();
    await expect(inbox).toHaveAccessibleName(new RegExp(`^결재함 · 대기 ${ids.length - 1}건`));

    // The clubhouse's illustrated entrance reads what is left above the office's area cards; home
    // keeps no office menu, club summary or quick actions (→WEB-11).
    await dismissFeedback(page);
    await leaveOffice(page);
    await clubhouseTab(page).click();
    const hub = page.getByTestId('club-hub');
    await expect(page.getByTestId('office-waiting')).toContainText(`결재 대기 ${ids.length - 1}건`);
    await expect(officeMenu(page)).toHaveCount(0);
    await expect(page.getByTestId('club-situation')).toHaveCount(0);
    await expectScenes(page, theme, HOME_SCENES);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    const phoneEntrance = officeEntrance(page);
    await expectTarget(phoneEntrance);
    await phoneEntrance.click();
    await expect(hub).toBeHidden();
    await expect(officePage(page).getByTestId('office-effects')).toBeVisible();

    // 1군, through 팀, is the actual roster under its locker room, found by a fixture player's
    // name (→WEB-43/112).
    await openSection(page, '1군');
    await expectScenes(page, theme, ['locker']);
    await expect(page).toHaveURL(/\/first-team\?view=players$/);
    const active = w.players.filter((player) => player.status === 'active');
    await expect(page.getByTestId('roster-availability')).toContainText(`/${active.length}명`);
    const search = page.getByRole('textbox', { name: '선수 찾기' });
    await search.fill(active[0].name);
    await expect(page.getByText(active[0].name, { exact: true }).first()).toBeVisible();

    // 코치진 leads with the actual manager under his office on the first view, and every post's
    // person under the coaching workroom.
    await openSection(page, '코치진');
    await expect(page).toHaveURL(/\/staff\?view=coaches$/);
    await expect(managerCard(page)).toBeInViewport();
    await expect(page.getByRole('heading', { name: w.manager.name, exact: true })).toBeVisible();
    for (const member of w.staff ?? [])
      await expect(page.locator(`#staff-post-${member.role}`)).toContainText(member.name);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    // The lazily loaded workroom loads once scrolled to; the page then reads from its top again.
    await expectScenes(page, theme, ['manager', 'staff']);
    await page.getByTestId('view-scroller').evaluate((element) => element.scrollTo(0, 0));

    // Desktop keeps the same people first under their rooms and the same queue behind the
    // clubhouse entrance.
    await page.setViewportSize({ width: 1280, height: 900 });
    await settle(page);
    await expect(managerCard(page)).toBeInViewport();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await expectScenes(page, theme, ['manager', 'staff']);
    await clubhouseTab(page).click();
    await expect(officeMenu(page)).toHaveCount(0);
    await expectScenes(page, theme, HOME_SCENES);
    const entrance = officeEntrance(page);
    await expectTarget(entrance);
    await entrance.click();
    // The office opens on its effects in force under its menu, with no room scene (→WEB-39/116);
    // the menu's 결재함 holds the same queue.
    await expect(officePage(page).getByTestId('office-effects')).toBeVisible();
    await expect(officeMenu(page)).toHaveCount(1);
    await expectScenes(page, theme, []);
    await officeMenu(page).getByTestId('approval-inbox').click();
    await expect(rows).toHaveCount(ids.length - 1);
    await expect(reviewButton(page, ids[1]!)).toBeInViewport();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await leaveOffice(page);
    // Back in 1군 through 팀, the roster under its room keeps its search (→WEB-74).
    await openSection(page, '1군');
    await expectScenes(page, theme, ['locker']);
    await expect(search).toHaveValue(active[0].name);
  });
}
