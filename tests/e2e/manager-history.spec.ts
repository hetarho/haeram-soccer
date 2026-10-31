import { expect, test, type Page } from '@playwright/test';
import { decode, encode } from '../../apps/web/src/adapters/persistence';
import { canonical } from '../../packages/contracts/src/index';
import { MANAGER_HISTORY_CHECKPOINT_SCHEMA } from '../../packages/contracts/src/versions';
import { seasonName } from '../../apps/web/src/ui/format';
import {
  managerActivationCareer,
  managerJourneyCareer,
  type ManagerJourneyCareer,
} from '../fixtures/manager-careers';
import {
  committedRaw,
  exportRaw,
  exportWorld,
  foundHere,
  newGameIn,
  continueGame,
  notice,
  openNotices,
  closeNotices,
  SAVE_DATA_UPDATED,
  seedCheckpoints,
} from './club-identity-helpers';
import { horizontalOverflow } from './layout';
import {
  managerHistoryList,
  openManagerHistory,
  tenureCard,
  viewScroll,
} from './record-navigation';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { advanceOneRound } from './season-progression';

/**
 * 감독 이력 in the build (T308; →WEB-92/74/54, HIST-18/19, SAVE-24): real careers imported or seeded
 * as a writer left them, with every expected label read in Node through the worker host's own read
 * and T305's view mapping (tests/fixtures/manager-careers.ts), never restated here.
 */
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];
const toggle = (card: ReturnType<typeof tenureCard>) =>
  card.getByRole('button', { name: /^(자세히|접기)/ });
async function inspect(card: ReturnType<typeof tenureCard>) {
  const button = toggle(card);
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
}
/** Scrolls the content region so `card` is in view, and returns where the region stands. */
async function scrollTo(page: Page, card: ReturnType<typeof tenureCard>) {
  await card.scrollIntoViewIfNeeded();
  return viewScroll(page);
}
const footer = (page: Page) => managerHistoryList(page).getByText(/^\d+ \/ \d+건$/);

for (const viewport of VIEWPORTS)
  test(`reads tenures page by page and comes back from their seasons on ${viewport.name}`, async ({
    page,
  }) => {
    // Prepared validated setup is shared across browsers; the current Host still reads its facts.
    test.setTimeout(240_000);
    await page.setViewportSize(viewport);
    const career: ManagerJourneyCareer = await managerJourneyCareer();
    const total = career.views.length;
    expect(total).toBeGreaterThan(career.pageSize);
    await importResponsibilityCareer(page, career.world);
    const list = await openManagerHistory(page);

    // The first page: newest first, the current manager on top with a provisional place.
    await expect(list.getByRole('article')).toHaveCount(career.pageSize);
    await expect(footer(page)).toHaveText(`${career.pageSize} / ${total}건`);
    const current = tenureCard(page, career.current);
    await expect(current).toContainText('현재 감독');
    for (const line of career.current.provisional) await expect(current).toContainText(line);
    // The existing appointment story and the current manager stay beside it (→WEB-54).
    await expect(page.getByRole('heading', { name: '감독들이 남긴 계절' })).toBeVisible();
    await expect(page.getByText(/ · 현재$/)).toBeVisible();

    // The next page joins the first.
    await list.getByRole('button', { name: '더 보기', exact: true }).click();
    await expect(list.getByRole('article')).toHaveCount(total);
    await expect(footer(page)).toHaveText(`${total} / ${total}건`);
    await expect(list.getByRole('button', { name: '더 보기', exact: true })).toHaveCount(0);
    for (const view of career.views) {
      if (view.kind !== 'tenure') continue;
      const card = tenureCard(page, view);
      await expect(card).toContainText(view.honoursLine);
      await expect(card).toContainText(view.record.line);
      if (view.end) await expect(card).toContainText(view.end);
    }
    // Distinct tenures: the interim, the same-day replacement without a match and the manager
    // appointed twice, each on its own card.
    await expect(tenureCard(page, career.interim)).toContainText('감독대행');
    await expect(tenureCard(page, career.replacedSameDay)).toContainText('지휘한 공식전 없음');
    await expect(
      list.getByRole('article', { name: new RegExp(`^${career.closer.name} · `) }),
    ).toHaveCount(2);
    expect(career.reappointed.name).toBe(career.closer.name);

    // The season the successor finished and the cup won before the mid-season change: both
    // labelled as results of a season they did not manage whole. One tenure is open at a time.
    const closer = tenureCard(page, career.closer);
    await inspect(closer);
    for (const honour of career.closer.honours) {
      await expect(
        closer.getByRole('button', { name: honour.action.accessibleLabel }),
      ).toBeVisible();
      if (honour.note) await expect(closer).toContainText(honour.note);
    }
    const winner = tenureCard(page, career.cupWinner);
    await inspect(winner);
    await expect(toggle(closer)).toHaveAttribute('aria-expanded', 'false');
    const cup = career.cupWinner.honours.find((honour) => honour.label.endsWith('컵 우승'))!;
    await expect(winner.getByRole('button', { name: cup.action.accessibleLabel })).toBeVisible();

    // The cup opens its season of our records under the records' tabs (→WEB-54).
    await scrollTo(page, winner);
    await winner.getByRole('button', { name: cup.action.accessibleLabel }).click();
    await expect(page).toHaveURL(new RegExp(`/history\\?section=club&season=${career.cupSeason}$`));
    await expect(
      page.getByRole('heading', { name: `${seasonName(career.cupSeason)} · 구단 시즌 기록` }),
    ).toBeVisible();
    // Its tab, entered again, keeps the loaded list and the inspected tenure (→WEB-74).
    const managers = page.getByRole('tab', { name: '감독 이력', exact: true });
    await managers.click();
    await expect(page).toHaveURL(/\/history\?section=club&view=managers$/);
    await expect(managers).toHaveAttribute('aria-selected', 'true');
    await expect(list.getByRole('article')).toHaveCount(total);
    await expect(toggle(winner)).toHaveAttribute('aria-expanded', 'true');

    // A tenure's season through the browser's back button: the same list, tenure and place.
    const source = career.closer.sources[0]!;
    await inspect(closer);
    const there = await scrollTo(page, closer);
    await closer.getByRole('button', { name: source.accessibleLabel }).click();
    await expect(page).toHaveURL(
      new RegExp(`/history\\?section=club&season=${source.season.year}$`),
    );
    await page.goBack();
    await expect(page).toHaveURL(/\/history\?section=club&view=managers$/);
    await expect(list.getByRole('article')).toHaveCount(total);
    await expect(toggle(closer)).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(() => viewScroll(page)).toBeGreaterThan(there - 8);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    // Reading changed nothing: the saved career is the imported one.
    expect(canonical(await exportWorld(page))).toBe(canonical(career.world));
  });

test('starts tracking an older career at the writer, never in a read-only tab', async ({
  page,
  context,
  browser,
}) => {
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  const career = await managerActivationCareer();
  const raw = await encode(career.world, 1, 0);
  const envelope = JSON.parse(raw);
  // Another tab holds the writer lock: this one opens the stored career read-only (→SAVE-6).
  const holder = await context.newPage();
  await holder.goto('/');
  await expect(holder.getByRole('button', { name: '클럽 창단' })).toBeVisible();
  await seedCheckpoints(page, {
    active: raw,
    manifest: JSON.stringify({
      slot: 0,
      worldId: envelope.worldId,
      generation: envelope.generation,
      parentGeneration: envelope.parentGeneration,
    }),
  });
  await page.goto('/journal');
  await expect(page.getByTestId('club-hub')).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('status').filter({ hasText: '읽기 전용' }).first()).toBeVisible();
  await openManagerHistory(page);
  // As stored: the manager in charge without a summary, and the older readable events.
  const stored = tenureCard(page, career.untracked.current);
  await expect(stored).toContainText(career.untracked.current.tracking!);
  for (const event of career.untracked.legacy)
    await expect(managerHistoryList(page)).toContainText(event.title);
  expect(await committedRaw(page)).toBe(raw);

  // The writer closes: this tab takes over and starts tracking at its load (→SAVE-24).
  await holder.close();
  await expect(page.getByRole('status').filter({ hasText: '읽기 전용' })).toHaveCount(0, {
    timeout: 30000,
  });
  await expect(page.getByTestId('save-status')).toContainText('저장 완료', { timeout: 30000 });
  const inbox = await openNotices(page);
  await expect(notice(inbox, SAVE_DATA_UPDATED)).toHaveCount(1);
  await closeNotices(inbox);
  await openManagerHistory(page);
  const card = tenureCard(page, career.current);
  for (const text of [
    career.current.service,
    career.current.tracking!,
    career.current.coverage!,
    career.current.record.line,
    career.current.honoursLine,
  ])
    await expect(card).toContainText(text);
  for (const event of career.legacy)
    await expect(managerHistoryList(page)).toContainText(event.title);

  // Older facts and the known service year as they were; nothing before tracking attributed.
  const activated = await decode(await exportRaw(page));
  expect(activated.envelope.schema).toBe(MANAGER_HISTORY_CHECKPOINT_SCHEMA);
  const facts = activated.world.managerHistory!;
  expect(facts.coverage).toBe('activation');
  // The same writer load records the released full model there too (→SAVE-23).
  expect(activated.world.matchModel?.coverage).toBe('activation');
  expect(facts.tenures).toHaveLength(1);
  expect(facts.tenures[0]!.knownSince).toBe(career.world.manager.since);
  expect(facts.tenures[0]).not.toHaveProperty('appointed');
  expect(canonical(activated.world.ownMatches)).toBe(canonical(career.world.ownMatches));
  expect(canonical(activated.world.history)).toBe(canonical(career.world.history));
  expect(canonical(activated.world.events.slice(0, career.world.events.length))).toBe(
    canonical(career.world.events),
  );

  // Newly settled results belong to the tenure in charge; the old ones stay unattributed.
  await advanceOneRound(page);
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  const played = await exportWorld(page);
  const settled = played.ownMatches.slice(career.world.ownMatches.length);
  expect(settled.length).toBeGreaterThan(0);
  expect(settled.every((match) => match.managerTenure === facts.tenures[0]!.id)).toBe(true);
  expect(
    played.ownMatches
      .slice(0, career.world.ownMatches.length)
      .every((match) => match.managerTenure === undefined),
  ).toBe(true);
  await openManagerHistory(page);
  await expect(card).toContainText(`${settled.length}경기 `);
  const line = await card.innerText();

  // Reloaded, then imported into another browser profile: the same history.
  await page.reload();
  await openManagerHistory(page);
  await expect(card).toHaveText(line, { useInnerText: true });
  const file = await exportRaw(page);
  const elsewhere = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const other = await elsewhere.newPage();
    await other.goto(new URL('/', page.url()).href);
    await expect(other.getByRole('button', { name: '클럽 창단' })).toBeEnabled();
    await other
      .locator('input[type=file]')
      .last()
      .setInputFiles({
        name: 'manager-history.haeram-save.json',
        mimeType: 'application/json',
        buffer: Buffer.from(file),
      });
    await expect(other.getByTestId('club-hub')).toBeVisible({ timeout: 30000 });
    await openManagerHistory(other);
    await expect(tenureCard(other, career.current)).toHaveText(line, { useInnerText: true });
    expect(canonical(await exportWorld(other))).toBe(canonical((await decode(file)).world));
  } finally {
    await elsewhere.close();
  }
});

test('never shows one game’s manager history in another', async ({ page }) => {
  // The same prepared career as above, independently cloned for this browser journey.
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  const career = await managerJourneyCareer();
  await importResponsibilityCareer(page, career.world);
  await openManagerHistory(page);
  await expect(tenureCard(page, career.current)).toBeVisible();
  const names = new Set(
    career.views.flatMap((view) => (view.kind === 'tenure' ? [view.name] : [])),
  );

  // A new game in slot 2: only its founding manager, nothing of the first game's list.
  await newGameIn(page, 2);
  await foundHere(page, 'Second Tenure FC', 'manager-history-second');
  const founding = (await exportWorld(page)).manager.name;
  const list = await openManagerHistory(page);
  await expect(list.getByRole('article')).toHaveCount(1);
  await expect(list.getByRole('article').first()).toContainText(founding);
  for (const name of names) if (name !== founding) await expect(list).not.toContainText(name);

  // Switched away while its read is in flight, and back: the first game's list, not the second's.
  await page.getByRole('tab', { name: '시즌별 기록', exact: true }).click();
  await page.getByRole('tab', { name: '감독 이력', exact: true }).click();
  await continueGame(page, 1);
  await openManagerHistory(page);
  await expect(list.getByRole('article')).toHaveCount(career.pageSize);
  await expect(tenureCard(page, career.current)).toBeVisible();
  if (!names.has(founding)) await expect(list).not.toContainText(founding);
});
