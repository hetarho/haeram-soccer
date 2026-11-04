import { expect, test, type Locator, type Page } from '@playwright/test';
import { lineOf } from '../../packages/engine/src/player';
import { preparedWorld } from '../fixtures/prepared-world';
import { readPresentationBaselines } from '../fixtures/presentation';
import { horizontalOverflow, settle } from './layout';
import { marketRows } from './market';
import { clubSections, officeMenu, teamDirectory, teamEntry, teamReturn, teamTabs } from './office';
import { openPersonnel } from './personnel-navigation';
import { continueSlot, seedSlot } from './slots';

const PREFERENCE_KEY = 'haeram-soccor:presentation';
const { localeRegistry, themeRegistry } = readPresentationBaselines();

/** A 44 CSS px target each way; layout works in 1/64 px, so snap the float noise. */
async function expectTarget(target: Locator) {
  const size = await target.evaluate((element) => {
    const { width, height } = element.getBoundingClientRect();
    const snap = (value: number) => Math.round(value * 64) / 64;
    return { width: snap(width), height: snap(height) };
  });
  expect(size.width).toBeGreaterThanOrEqual(44);
  expect(size.height).toBeGreaterThanOrEqual(44);
}
/** The rendered height of a list's first body row. */
const rowHeight = (row: Locator) =>
  row.evaluate((element) => Math.round(element.getBoundingClientRect().height * 64) / 64);
const list = (page: Page, view: 'players' | 'academy' | 'coaches') =>
  teamDirectory(page).getByTestId(`team-${view}`);
const tab = (page: Page, name: string) => teamTabs(page).getByRole('tab', { name, exact: true });
const scroller = (page: Page) => page.getByTestId('view-scroller');

/** Opens a 팀 list by its tab, once the list agrees with the address. */
async function chooseList(page: Page, name: string, view: 'players' | 'academy' | 'coaches') {
  await tab(page, name).click();
  await expect(tab(page, name)).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(new RegExp(`/team\\?view=${view}$`));
  await expect(list(page, view)).toBeVisible();
}

// Every registered theme, from the registry rather than a list of our own (→ARCH-32, →WEB-91).
for (const theme of themeRegistry.entries) {
  test(`${theme.id}: 팀 lists our actual people compactly at the market's density and leads to their detailed work at 360px and desktop`, async ({
    page,
  }) => {
    // Two widths through three lists, a sheet, a detailed page, a reload and the market.
    test.slow();
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
      PREFERENCE_KEY,
      JSON.stringify({ themeId: theme.id, localeId: localeRegistry.defaultId }),
    ] as const);
    await page.setViewportSize({ width: 360, height: 740 });
    const w = preparedWorld('manager-journey');
    w.settings!.mode = 'manual';
    w.settings!.observations = { matchEve: false, windowOpen: false };
    // One vacant post, as a resignation leaves it (→STAFF-11).
    w.staff = (w.staff ?? []).filter((member) => member.role !== 'attack');
    const active = w.players.filter((player) => player.status === 'active');
    const prospects = (w.academy?.players ?? []).filter((player) => player.status === 'active');
    expect(prospects.length).toBeGreaterThan(0);
    await seedSlot(page, w);
    await page.goto('/');
    await continueSlot(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.id);

    // The primary 팀 entry opens 1군; 팀 alone is current, with no office bar (→WEB-10/112).
    const entry = teamEntry(page);
    await expectTarget(entry);
    await entry.click();
    await expect(page).toHaveURL(/\/team\?view=players$/);
    await expect(entry).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('nav [aria-current="page"]').filter({ visible: true })).toHaveCount(
      1,
    );
    await expect(clubSections(page)).toHaveCount(0);
    await expect(officeMenu(page)).toHaveCount(0);
    await expect(teamTabs(page).getByRole('tab')).toHaveText(['1군', '유소년', '코치']);
    for (const name of ['1군', '유소년', '코치']) await expectTarget(tab(page, name));

    // One compact row per actual first-team player, each with its real position on its
    // family's badge; all four families appear (→WEB-112/113).
    const players = list(page, 'players');
    const rows = players.locator('tbody tr');
    await expect(rows).toHaveCount(active.length);
    const badges = players.locator('[data-ui="position-badge"]');
    await expect(badges).toHaveCount(active.length);
    const shown = await badges.evaluateAll((all) =>
      all.map((badge) => ({
        line: badge.getAttribute('data-line'),
        code: badge.lastChild?.textContent?.trim(),
        fill: getComputedStyle(badge).backgroundColor,
        visible: badge.getBoundingClientRect().width > 0,
      })),
    );
    expect(new Set(shown.map((badge) => badge.line))).toEqual(new Set(['GK', 'DF', 'MF', 'FW']));
    for (const badge of shown) {
      expect(badge.visible).toBe(true);
      expect(lineOf(badge.code as Parameters<typeof lineOf>[0])).toBe(badge.line);
    }
    // Each family keeps its own visible fill in this theme.
    const fills = new Map(shown.map((badge) => [badge.line, badge.fill]));
    expect(new Set(fills.values()).size).toBe(4);
    for (const player of active)
      await expect(
        players.getByTestId(`team-row-${player.id}`).getByRole('button', {
          name: `${player.name} 선수 기록`,
          exact: true,
        }),
      ).toHaveCount(1);
    const first = rows.first();
    const firstName = first.getByRole('button');
    await expectTarget(firstName);
    // Name, position and the core facts share one row on the phone, without cards or art.
    const phoneTeamRow = await rowHeight(first);
    expect(phoneTeamRow).toBeLessThanOrEqual(64);
    await expect(players.locator('article, img, figure')).toHaveCount(0);
    expect(
      await players.evaluate((table) => table.scrollWidth - table.clientWidth),
    ).toBeLessThanOrEqual(0);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    // The list stays above the controller.
    const transport = (await page.locator('[data-ui="season-transport"]').boundingBox())!;
    const firstBox = (await first.boundingBox())!;
    expect(firstBox.y + firstBox.height).toBeLessThanOrEqual(transport.y);

    // A name opens the existing player sheet; closing it returns to the list (→WEB-59).
    const firstPlayer = (await firstName.locator('b').innerText()).trim();
    await firstName.click();
    const sheet = page.getByRole('dialog', { name: firstPlayer, exact: true });
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(firstName).toBeFocused();

    // Each list keeps its own search and scroll while the owner moves between them (→WEB-74).
    await scroller(page).evaluate((element) => element.scrollTo(0, 260));
    const kept = await scroller(page).evaluate((element) => element.scrollTop);
    expect(kept).toBeGreaterThan(0);
    await chooseList(page, '유소년', 'academy');
    await expect(list(page, 'academy').locator('tbody tr')).toHaveCount(prospects.length);
    await chooseList(page, '1군', 'players');
    await expect
      .poll(() => scroller(page).evaluate((element) => element.scrollTop))
      .toBeGreaterThanOrEqual(kept - 2);
    const search = teamDirectory(page).getByRole('searchbox', { name: '이름 찾기' });
    await search.fill(active[0].name);
    await expect(rows.filter({ hasText: active[0].name })).not.toHaveCount(0);
    expect(await rows.count()).toBeLessThan(active.length);

    // 코치 lists the manager and every post, the vacancy named as a post (→WEB-112).
    await chooseList(page, '코치', 'coaches');
    const coaches = list(page, 'coaches').locator('tbody tr');
    await expect(coaches).toHaveCount(9);
    await expect(coaches.first()).toContainText(w.manager.name);
    await expect(list(page, 'coaches').locator('tr[data-vacant]')).toHaveCount(1);
    await expect(list(page, 'coaches').locator('tr[data-vacant]')).toContainText('공석');
    for (const member of w.staff) await expect(list(page, 'coaches')).toContainText(member.name);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    // A prospect opens his existing review in 유소년, which reads until a choice is made.
    await chooseList(page, '유소년', 'academy');
    await list(page, 'academy')
      .getByRole('button', { name: `${prospects[0].name} 유소년 검토` })
      .click();
    await expect(page).toHaveURL(/\/academy$/);
    const review = page.getByRole('dialog', { name: '유소년 승격·방출 검토', exact: true });
    await expect(review).toContainText(prospects[0].name);
    await page.keyboard.press('Escape');
    await expect(review).toHaveCount(0);
    await expect(teamReturn(page)).toHaveText('← 팀 · 유소년');
    await expect(entry).toHaveAttribute('aria-current', 'page');

    // 1군 관리 opens the illustrated roster workflow; its way back resumes the searched list.
    await teamReturn(page).click();
    await chooseList(page, '1군', 'players');
    await expect(search).toHaveValue(active[0].name);
    const manage = teamDirectory(page).getByRole('button', { name: '1군 관리', exact: true });
    await expectTarget(manage);
    await manage.click();
    await expect(page).toHaveURL(/\/first-team\?view=players$/);
    await expect(page.getByTestId('facility-overview')).toHaveAccessibleName('드레싱 룸');
    await expect(page.getByTestId('roster-availability')).toBeVisible();
    await expect(entry).toHaveAttribute('aria-current', 'page');
    await expectTarget(teamReturn(page));
    await teamReturn(page).click();
    await expect(page).toHaveURL(/\/team\?view=players$/);
    await expect(search).toHaveValue(active[0].name);
    await search.fill('');

    // Each list loads and reloads from its own address, as the static deployment serves it.
    await expect(page.getByTestId('save-status')).toContainText('저장 완료');
    const loaded = await page.goto('/team?view=coaches');
    expect(loaded?.status()).toBe(200);
    await expect(tab(page, '코치')).toHaveAttribute('aria-selected', 'true');
    await expect(list(page, 'coaches')).toBeVisible();
    await page.reload();
    await expect(tab(page, '코치')).toHaveAttribute('aria-selected', 'true');
    await page.goto('/team');
    await expect(page).toHaveURL(/\/team\?view=players$/);
    await expect(list(page, 'players').locator('tbody tr')).toHaveCount(active.length);

    // A Team row is no taller than a market row at the same width and theme (→WEB-112).
    await openPersonnel(page, 'market');
    await expect(marketRows(page).first()).toBeVisible();
    await settle(page);
    const phoneMarketRow = await rowHeight(marketRows(page).first());
    expect(phoneTeamRow).toBeLessThanOrEqual(phoneMarketRow + 1);
    await expect(entry).not.toHaveAttribute('aria-current', 'page');

    // Desktop adds aligned columns to the same compact rows.
    await page.setViewportSize({ width: 1280, height: 900 });
    await settle(page);
    const desktopMarketRow = await rowHeight(marketRows(page).first());
    await teamEntry(page).click();
    await expect(page).toHaveURL(/\/team\?view=players$/);
    const desktopRows = list(page, 'players').locator('tbody tr');
    await expect(desktopRows).toHaveCount(active.length);
    for (const header of ['선수', 'OVR', 'POT', '피로', '연봉', '계약'])
      await expect(
        list(page, 'players').getByRole('columnheader', { name: header, exact: true }),
      ).toBeVisible();
    expect(await rowHeight(desktopRows.first())).toBeLessThanOrEqual(desktopMarketRow + 1);
    await expect(desktopRows.first().locator('[data-ui="position-badge"]')).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await chooseList(page, '코치', 'coaches');
    for (const header of ['코치', '능력', '나이', '연봉', '계약'])
      await expect(
        list(page, 'coaches').getByRole('columnheader', { name: header, exact: true }),
      ).toBeVisible();
    const coachManage = teamDirectory(page).getByRole('button', {
      name: '코치진 관리',
      exact: true,
    });
    await coachManage.click();
    await expect(page).toHaveURL(/\/staff\?view=coaches$/);
    await expect(page.getByTestId('manager-card')).toBeVisible();
    await expect(teamReturn(page)).toHaveText('← 팀 · 코치');
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
}
