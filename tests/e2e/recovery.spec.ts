import { openPersonnel } from './personnel-navigation';
import { clubhouseTab, openLeague } from './competition-navigation';
import { advanceOneRound } from './season-progression';
import { test, expect } from '@playwright/test';
import { saveFileOf } from '../fixtures/save-file';
import { careerWorld } from '../../packages/engine/src/career.testkit';
import { MANAGER_GONE } from '../../packages/engine/src/operations';
import { openSaveMenu } from './save-menu';
import { savedFacts } from './club-identity-helpers';
import { FUTURE_FILES } from '../fixtures/club-identity';
import { startCareer, startFlow } from './start';
const found = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await startCareer(page);
  await expect(page.getByTestId('save-status')).toContainText('저장 완료 · r0');
};
/** The world revision the save status names. */
const shownRevision = async (page: import('@playwright/test').Page) =>
  Number(/· r(\d+) ·/.exec((await page.getByTestId('save-status').textContent()) ?? '')?.[1]);
/**
 * Plays one round and returns the revision it reached: a round is lived one day at a time, one
 * revision each (→LEAGUE-11), and the page receives the world once the round is over.
 */
const advanceRound = async (page: import('@playwright/test').Page) => {
  const before = await shownRevision(page);
  await advanceOneRound(page);
  await expect.poll(() => shownRevision(page)).toBeGreaterThan(before);
  const revision = await shownRevision(page);
  return revision;
};
test('one writer, live read-only updates and ownership after reload', async ({ page, context }) => {
  // A takeover, a second tab, a round and a reload: Firefox CI 40077037075 ran past 30 s twice.
  test.slow();
  await found(page);
  const second = await context.newPage();
  await second.goto('/');
  // A new tab opens on the slot screen; read-only, it can only continue the game in play.
  const slots = second.getByTestId('game-slots');
  await expect(slots.getByRole('status').filter({ hasText: '읽기 전용' })).toBeVisible();
  await expect(
    slots
      .getByRole('listitem', { name: '슬롯 2 · 빈 슬롯' })
      .getByRole('button', { name: '새 게임' }),
  ).toBeDisabled();
  await slots
    .getByRole('listitem', { name: '슬롯 1' })
    .getByRole('button', { name: '이어하기' })
    .click();
  await expect(second.getByRole('status').filter({ hasText: '읽기 전용' })).toContainText(
    '읽기 전용',
  );
  await expect(second.getByRole('button', { name: '자동 진행 시작', exact: true })).toBeDisabled();
  await page.bringToFront();
  const revision = await advanceRound(page);
  await expect(page.getByTestId('save-status')).toContainText(`저장 완료 · r${revision} ·`);
  await second.bringToFront();
  await expect(second.getByTestId('game-round')).toHaveText('1', { timeout: 10000 });
  await page.close();
  await second.reload();
  await clubhouseTab(second).click();
  await expect(second.getByRole('button', { name: '자동 진행 시작', exact: true })).toBeEnabled();
  await second.close();
});
test('unsupported import leaves the current world intact', async ({ page }) => {
  await found(page);
  const before = await savedFacts(page);
  // A file of a database schema this version does not know, and an old JSON envelope.
  const future = await FUTURE_FILES['database schema 2'](
    careerWorld({ country: 'ENG', seed: 'recovery-future' }),
  );
  await (
    await openSaveMenu(page)
  )
    .locator('input[type=file]')
    .last()
    .setInputFiles({
      name: 'future.haeram-save',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(future),
    });
  await page.getByRole('button', { name: '기록 교체하고 가져오기' }).click();
  await expect(page.getByRole('alert')).toContainText('지원하지 않는');
  await expect(page.getByTestId('game-round')).toHaveText('0');
  expect(await savedFacts(page)).toBe(before);
});
test('a terminated real worker exposes recovery and retains the last committed save', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeWorker = Worker;
    globalThis.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        // The engine worker, not the codec or fixture helper workers the client creates beside it.
        if (!/codec|fixtureHelper/.test(String(url)))
          (globalThis as typeof globalThis & { testWorker?: Worker }).testWorker = this;
      }
    };
  });
  await found(page);
  await page.evaluate(() => {
    const worker = (globalThis as typeof globalThis & { testWorker?: Worker }).testWorker!;
    const handler = worker.onerror;
    worker.terminate();
    handler?.call(
      worker,
      new ErrorEvent('error', {
        message: 'Synthetic error notification after real worker termination',
      }),
    );
  });
  await expect(page.getByRole('alert')).toContainText('Worker가 종료');
  await page.reload();
  await expect(page.getByTestId('game-round')).toHaveText('0');
  await expect(
    page.getByTestId('club-hub').getByRole('button', { name: '상세 리포트', exact: true }),
  ).toBeEnabled();
});
test('a new game goes into another slot, both careers survive switching and back navigation works', async ({
  page,
}) => {
  await found(page);
  await openPersonnel(page, 'players');
  await expect(page).toHaveURL(/\/first-team\?view=players$/);
  await openPersonnel(page, 'coaches');
  await expect(page).toHaveURL(/\/staff\?view=coaches$/);
  // Team is a real history entry before each detailed workflow; local tabs replace its lens.
  await page.goBack();
  await expect(page).toHaveURL(/\/team\?view=coaches$/);
  await expect(page.getByTestId('team-coaches')).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/staff\?view=coaches$/);
  await expect(page.getByTestId('manager-card')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/team\?view=coaches$/);
  await expect(page.getByTestId('team-coaches')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/first-team\?view=players$/);
  await expect(page.getByTestId('roster-availability')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/team\?view=players$/);
  await expect(page.getByTestId('team-players')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/journal$/);
  await expect(page.getByTestId('club-hub')).toBeVisible();
  // Whichever tab a game was left on, a game entered from the slot screen opens on home.
  await openPersonnel(page, 'training');
  await expect(page).toHaveURL(/\/training$/);
  await expect(page.getByTestId('training-focus')).toBeVisible();
  await (await openSaveMenu(page)).getByRole('button', { name: '게임 슬롯', exact: true }).click();
  const slotScreen = page.getByTestId('game-slots');
  await expect(slotScreen.getByRole('listitem', { name: '슬롯 1' })).toContainText('진행 중');
  await slotScreen
    .getByRole('listitem', { name: '슬롯 2 · 빈 슬롯' })
    .getByRole('button', { name: '새 게임' })
    .click();
  await expect(startFlow(page)).toContainText('슬롯 2 · 새 게임');
  // Another world and a German club, so nothing of it shows in the first career's league.
  // A new game builds and saves a whole career before the HUD shows it.
  const club = await startCareer(page, {
    seed: 'recovery-second-slot',
    country: 'GER',
    division: 0,
  });
  await expect(page.getByText(club, { exact: true }).first()).toBeVisible();
  await expect(page).toHaveURL(/\/journal$/);
  // A reload of a tab in a game continues it.
  await page.reload();
  await expect(page.getByText(club, { exact: true }).first()).toBeVisible();
  // The first career waited in its slot and comes back intact.
  await openLeague(page);
  await expect(page).toHaveURL(/\/season\?competition=league/);
  // The URL updates before the deferred page commits. Wait for the intended departure page
  // before scrolling to its footer, which moves when that page replaces the previous one.
  await expect(page.getByRole('tab', { name: '순위표', exact: true })).toBeVisible();
  await (await openSaveMenu(page)).getByRole('button', { name: '게임 슬롯', exact: true }).click();
  await expect(slotScreen.getByRole('listitem', { name: '슬롯 2' })).toContainText('진행 중');
  await slotScreen
    .getByRole('listitem', { name: '슬롯 1' })
    .getByRole('button', { name: '이어하기' })
    .click();
  await expect(page.getByTestId('club-hub')).toBeVisible({ timeout: 30000 });
  await expect(page).toHaveURL(/\/journal$/);
  await expect(page.getByTestId('save-status')).toContainText('저장 완료 · r0');
  await expect(page.getByText(club, { exact: true })).toHaveCount(0);
  // A fresh window opens on the slot screen.
  const second = await page.context().newPage();
  await second.goto('/');
  await expect(second.getByTestId('game-slots')).toBeVisible();
  await expect(second.getByRole('listitem', { name: '슬롯 2' })).toContainText(club);
  await second.close();
});
test('deleting the game in play stays on the slot screen, even with every slot empty', async ({
  page,
}) => {
  await found(page);
  await (await openSaveMenu(page)).getByRole('button', { name: '게임 슬롯', exact: true }).click();
  const slotScreen = page.getByTestId('game-slots');
  const slot = slotScreen.getByRole('listitem', { name: '슬롯 1' });
  await expect(slot).toContainText('진행 중');
  await slot.getByText('관리', { exact: true }).click();
  await slot.getByRole('button', { name: '삭제', exact: true }).click();
  // The page reloads without the game, back on the slots (→WEB-62).
  const reloaded = page.waitForEvent('load');
  await page
    .getByRole('dialog', { name: '게임 삭제 확인' })
    .getByRole('button', { name: '삭제', exact: true })
    .click();
  await reloaded;
  const empty = slotScreen.getByRole('listitem', { name: '슬롯 1 · 빈 슬롯' });
  await expect(empty).toBeVisible();
  await expect(startFlow(page)).toHaveCount(0);
  await empty.getByRole('button', { name: '새 게임' }).click();
  await expect(startFlow(page)).toContainText('슬롯 1 · 새 게임');
});
test('a new game beside a parked game shows none of its club, cash or bands', async ({ page }) => {
  const fixture = careerWorld({ country: 'ENG', seed: 'parked-crisis' });
  const parkedClub = fixture.clubs.find((club) => club.id === fixture.playerClub)!.name;
  // In debt and without a manager: retain the cash band and the floating manager notice.
  fixture.cash = '-1';
  fixture.critical = MANAGER_GONE;
  await page.goto('/');
  await expect(startFlow(page)).toBeVisible();
  await page
    .locator('input[type=file]')
    .last()
    .setInputFiles({
      name: 'parked-crisis.haeram-save',
      mimeType: 'application/json',
      buffer: Buffer.from(await saveFileOf(fixture)),
    });
  const alarm = page.getByTestId('cash-alarm');
  const notice = page.getByText('감독이 떠났어요.');
  await expect(alarm).toBeVisible();
  await expect(notice).toBeVisible();
  await (await openSaveMenu(page)).getByRole('button', { name: '게임 슬롯', exact: true }).click();
  const slotScreen = page.getByTestId('game-slots');
  await slotScreen
    .getByRole('listitem', { name: '슬롯 2 · 빈 슬롯' })
    .getByRole('button', { name: '새 게임' })
    .click();
  await expect(startFlow(page)).toContainText('슬롯 2 · 새 게임');
  await expect(page.getByTestId('calendar')).toHaveText('1930 · A NEW OWNER');
  await expect(page.getByTestId('hud-cash')).toHaveCount(0);
  await expect(page.getByText(parkedClub)).toHaveCount(0);
  await expect(page.getByTestId('save-status')).toHaveCount(0);
  await expect(alarm).toHaveCount(0);
  await expect(notice).toHaveCount(0);
  // The parked game brings its bands back when it is continued.
  await page.getByRole('button', { name: '← 게임 슬롯' }).click();
  await slotScreen
    .getByRole('listitem', { name: '슬롯 1' })
    .getByRole('button', { name: '이어하기' })
    .click();
  await expect(alarm).toBeVisible();
  await expect(notice).toBeVisible();
});
