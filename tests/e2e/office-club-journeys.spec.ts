import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  resolvePackUrl,
  resolveRegistryUrl,
  resolveResourceUrl,
} from '../../apps/web/src/presentation/registry';
import { pendingDecisions } from '../../packages/engine/src/stopping';
import { readPresentationBaselines } from '../fixtures/presentation';
import { clubhouseTab } from './competition-navigation';
import { dismissFeedback } from './feedback';
import { horizontalOverflow, settle } from './layout';
import {
  approvalOrder,
  approvalRows,
  clubSections,
  officeEntrance,
  officeTitle,
  reviewButton,
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

/** A touch target keeps 44 CSS px each way; layout works in 1/64 px, so snap the float noise. */
async function expectTarget(target: Locator) {
  const size = await target.evaluate((element) => {
    const { width, height } = element.getBoundingClientRect();
    const snap = (value: number) => Math.round(value * 64) / 64;
    return { width: snap(width), height: snap(height) };
  });
  expect(size.width).toBeGreaterThanOrEqual(44);
  expect(size.height).toBeGreaterThanOrEqual(44);
}

/** One club section through the shared section bar (→WEB-10). */
async function openSection(page: Page, name: string) {
  const tab = clubSections(page).getByRole('tab', { name, exact: true });
  await expectTarget(tab);
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

// Every registered theme, from the registry rather than a list of our own (→ARCH-32, →WEB-91).
for (const theme of themeRegistry.entries) {
  test(`${theme.id}: 결재함 review returns to the remaining queue and the club sections show the actual people at 360px and desktop`, async ({
    page,
  }) => {
    // Two widths through the queue, a review, its return and three club sections.
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
    // The office holds its queue only: no club-section bar, and its first request is reachable
    // above the bottom controls on the phone's first view.
    await expect(clubSections(page)).toHaveCount(0);
    const first = reviewButton(page, ids[0]!);
    await expectTarget(first);
    const firstBox = (await first.boundingBox())!;
    const transportBox = (await transport.boundingBox())!;
    expect(firstBox.y + firstBox.height).toBeLessThanOrEqual(transportBox.y);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    // Review → decline → the refreshed queue, focused on the request now in its place (→WEB-100).
    await first.click();
    const request = page.getByTestId('approval-request');
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
    await expect(page).toHaveURL(/\/direction$/);
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

    // The clubhouse's entrance reads what is left (→WEB-11).
    await dismissFeedback(page);
    await clubhouseTab(page).click();
    await expect(page.getByTestId('office-waiting')).toContainText(`결재 대기 ${ids.length - 1}건`);

    // 1군 is the actual roster, found by a fixture player's name (→WEB-43).
    await openSection(page, '1군');
    await expect(page).toHaveURL(/\/first-team\?view=players$/);
    const active = w.players.filter((player) => player.status === 'active');
    await expect(page.getByTestId('roster-availability')).toContainText(`/${active.length}명`);
    const search = page.getByRole('textbox', { name: '선수 찾기' });
    await search.fill(active[0].name);
    await expect(page.getByText(active[0].name, { exact: true }).first()).toBeVisible();

    // 코치진 leads with the actual manager and every post's person on the first view.
    await openSection(page, '코치진');
    await expect(page).toHaveURL(/\/staff\?view=coaches$/);
    await expect(managerCard(page)).toBeInViewport();
    await expect(page.getByRole('heading', { name: w.manager.name, exact: true })).toBeVisible();
    for (const member of w.staff ?? [])
      await expect(page.locator(`#staff-post-${member.role}`)).toContainText(member.name);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    // Desktop keeps the same people first and the same queue behind the clubhouse entrance.
    await page.setViewportSize({ width: 1280, height: 900 });
    await settle(page);
    await expect(managerCard(page)).toBeInViewport();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await clubhouseTab(page).click();
    const entrance = officeEntrance(page);
    await expectTarget(entrance);
    await entrance.click();
    await expect(rows).toHaveCount(ids.length - 1);
    await expect(reviewButton(page, ids[1]!)).toBeInViewport();
    await expect(clubSections(page)).toHaveCount(0);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    // Back in the club, 1군 keeps its search (→WEB-74).
    await clubhouseTab(page).click();
    await openSection(page, '1군');
    await expect(search).toHaveValue(active[0].name);
  });
}
