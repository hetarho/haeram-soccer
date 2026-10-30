import { expect, test, type Locator, type Page } from '@playwright/test';
import { versionLabel } from '../../apps/web/src/ui/versionLabel';
import { readPresentationBaselines } from '../fixtures/presentation';
import { preparedWorld } from '../fixtures/prepared-world';
import { textContrast } from './contrast';
import { gameHud, horizontalOverflow } from './layout';
import { enterOffice, LOBBY, officeBar, officeTitle } from './office';
import { continueSlot, seedSlot } from './slots';

test.use({ reducedMotion: 'reduce' });

const VIEWPORTS = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
];
const world = () => preparedWorld('manager-journey');
const clubName = () => {
  const w = world();
  return w.clubs.find((club) => club.id === w.playerClub)!.name;
};
/** The play HUD names the club beside BETA; phones show its crest alone, BETA beside it. */
const hudClub = (page: Page, hud: Locator) =>
  page.viewportSize()!.width <= 760
    ? hud.locator('[data-ui="hud-club"] > svg')
    : hud.getByText(clubName(), { exact: true });
/** The start HUD, before a club is in play (founding, recovery and error screens share it). */
const startHud = (page: Page) => page.locator('[data-ui="game-shell"] > main > header');

/** A quiet, legible label on the name's row, never a tap target of its own (→WEB-101). */
async function expectMark(name: Locator, mark: Locator, text: string) {
  await expect(mark).toBeVisible();
  await expect(mark).toHaveText(text);
  expect(
    await mark.evaluate(
      (node) =>
        !node.closest('button, a, [role="button"], [tabindex]') &&
        getComputedStyle(node).cursor !== 'pointer',
    ),
  ).toBe(true);
  expect((await mark.evaluate(textContrast)).ratio).toBeGreaterThanOrEqual(4.5);
  const [named, marked] = [await name.boundingBox(), await mark.boundingBox()];
  expect(marked!.x).toBeGreaterThanOrEqual(named!.x + named!.width - 1);
  const middle = marked!.y + marked!.height / 2;
  expect(middle).toBeGreaterThan(named!.y);
  expect(middle).toBeLessThan(named!.y + named!.height);
}

/** The controls beside the mark keep their full 44 px touch targets. */
async function expectTargets(controls: Locator[]) {
  for (const control of controls) {
    const box = await control.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
}

/**
 * Opens the slot screen over a prepared game and checks its mark, then the play HUD's and the
 * shared HUD's while the owner office is open (→WEB-39).
 */
async function slotsThenPlay(page: Page, theme?: string) {
  const seeded = world();
  seeded.settings!.mode = 'manual';
  await seedSlot(page, seeded);
  await page.goto('/');
  if (theme) await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  const slots = page.getByTestId('game-slots');
  await expect(slots).toBeVisible();
  const head = slots.locator('header').first();
  await expectMark(
    head.getByText('HAERAM FOOTBALL', { exact: true }),
    head.getByTestId('beta-mark'),
    versionLabel(),
  );
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await continueSlot(page);
  await expect(page.getByTestId('club-hub')).toBeVisible();
  const hud = gameHud(page);
  await expectMark(hudClub(page, hud), hud.getByTestId('beta-mark'), 'BETA');
  await expectTargets([
    hud.getByRole('button', { name: '설정', exact: true }),
    page.getByTestId('communications-button'),
  ]);
  expect((await page.getByTestId('hud-cash').boundingBox())!.width).toBeGreaterThanOrEqual(44);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // The office keeps the shared HUD and does not duplicate BETA or cash in local navigation.
  await enterOffice(page);
  const bar = officeBar(page);
  await expect(officeTitle(page)).toHaveText(LOBBY);
  await expectMark(hudClub(page, hud), hud.getByTestId('beta-mark'), 'BETA');
  await expect(bar.getByTestId('beta-mark')).toHaveCount(0);
  await expect(bar.getByTestId('hud-cash')).toHaveCount(0);
  await expect(bar.getByRole('button', { name: '나가기', exact: true })).toHaveCount(0);
  await expectTargets([
    page
      .getByRole('navigation')
      .getByRole('button', { name: '클럽하우스', exact: true })
      .filter({ visible: true })
      .first(),
  ]);
  expect((await hud.getByTestId('hud-cash').boundingBox())!.width).toBeGreaterThanOrEqual(44);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
}

for (const viewport of VIEWPORTS) {
  test(`the BETA mark shows on the start screen, the save slots and the play HUD at ${viewport.width} px`, async ({
    page,
    browser,
  }) => {
    await page.setViewportSize(viewport);
    // Every slot empty: the start address opens 새 게임 for slot 1 under the start HUD (→WEB-62).
    await page.goto('/');
    const start = startHud(page);
    await expectMark(
      start.getByText('Haeram Football', { exact: true }),
      start.getByTestId('beta-mark'),
      versionLabel(),
    );
    await expect(start.getByTestId('beta-mark')).toHaveText('v0.7 BETA');
    await expectTargets([start.getByTestId('presentation-settings-trigger')]);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    // The slot screen, the play HUD and the owner office bar, over a game kept in slot 1.
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    try {
      await slotsThenPlay(await context.newPage());
    } finally {
      await context.close();
    }
  });
}

for (const theme of readPresentationBaselines().themeRegistry.entries) {
  test(`${theme.id}: the BETA mark reads on save slots and the shared HUD including the office`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(
      (themeId) =>
        localStorage.setItem(
          'haeram-soccor:presentation',
          JSON.stringify({ themeId, localeId: 'ko-KR' }),
        ),
      theme.id,
    );
    await slotsThenPlay(page, theme.id);
  });
}
