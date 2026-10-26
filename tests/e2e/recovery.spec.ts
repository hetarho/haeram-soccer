import { advanceOneRound } from './season-progression';
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { decode, encode } from '../../apps/web/src/adapters/persistence';
import { createWorld } from '../../packages/engine/src/index';
import { currentDay } from '../../packages/engine/src/calendar';
import { configureResponsibilities } from './events';
import { MANAGER_GONE } from '../../packages/engine/src/operations';
import { openSaveMenu } from './save-menu';
import { committedRaw, idbGet, idbPut } from './club-identity-helpers';
const found = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
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
  // A founding, a second tab, a round and a reload: Firefox CI 40077037075 ran past 30 s twice.
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
  await second.getByRole('button', { name: '클럽 홈', exact: true }).first().click();
  await expect(second.getByRole('button', { name: '자동 진행 시작', exact: true })).toBeEnabled();
  await second.close();
});
test('recovers prior checkpoint after active corruption without clearing another application key', async ({
  page,
}) => {
  // Two rounds, a reload, the recovery and an export: Firefox CI 39971746291 reached the last
  // reload at 30.0 s with every step on time.
  test.slow();
  await found(page);
  const first = await advanceRound(page);
  await expect(page.getByTestId('save-status')).toContainText(`저장 완료 · r${first} ·`);
  await page.evaluate(() => localStorage.setItem('another-app:keep', 'present'));
  // The active copy and its committed predecessor are kept in IndexedDB (→SAVE-3).
  const previousRaw = (await idbGet(page, 'checkpoints', 'previous'))!;
  await idbPut(page, 'checkpoints', 'active', 'corrupt');
  const previous = (await decode(previousRaw)).world;
  await page.reload();
  // The recovery is an unread system notification in the HUD inbox, never a banner (→WEB-66).
  await page.getByRole('button', { name: /^알림·뉴스 · 새 소식/ }).click();
  const inbox = page.getByRole('dialog', { name: '알림·뉴스', exact: true });
  await expect(inbox.getByRole('listitem').filter({ hasText: '시스템' })).toContainText(
    '체크포인트로 복구',
  );
  await inbox.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '체크포인트로 복구' })).toHaveCount(0);
  await expect(page.getByTestId('game-round')).toHaveText(`${previous.round}`);
  const downloading = page.waitForEvent('download');
  const saveMenu = await openSaveMenu(page);
  await saveMenu.getByRole('button', { name: '기록 내보내기', exact: true }).click();
  const download = await downloading;
  await saveMenu.getByRole('button', { name: '창 닫기', exact: true }).click();
  const restored = (await decode(readFileSync((await download.path())!, 'utf8'))).world;
  expect({
    day: currentDay(restored),
    round: restored.round,
    cash: restored.cash,
    players: restored.players,
    matches: restored.ownMatches,
  }).toEqual({
    day: currentDay(previous),
    round: previous.round,
    cash: previous.cash,
    players: previous.players,
    matches: previous.ownMatches,
  });

  expect(await page.evaluate(() => localStorage.getItem('another-app:keep'))).toBe('present');
  const again = await advanceRound(page);
  await expect(page.getByTestId('save-status')).toContainText(`저장 완료 · r${again} ·`);
  await page.reload();
  await expect(page.getByTestId('game-round')).toHaveText(`${previous.round + 1}`);
});
test('quota failure preserves disk save, exports actual memory progress and retries', async ({
  page,
}) => {
  // A founding, a round, an export and a retry: 42 s in a local Firefox run against 30 s.
  test.slow();
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (
        (globalThis as typeof globalThis & { failWrites?: boolean }).failWrites &&
        k.startsWith('haeram-soccor:')
      )
        throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      original.call(this, k, v);
    };
  });
  await found(page);
  // Prepare the first match before failing storage: once a write fails, public progression
  // correctly stops until retry. One match action then demonstrates unsaved memory progress.
  await configureResponsibilities(page, {
    responsibilities: { recruitment: 'delegated', sales: 'delegated' },
    mode: 'manual',
    observations: { matchEve: true, windowOpen: false },
  });
  await page.getByRole('button', { name: '다음 이벤트', exact: true }).click();
  await expect(page.getByTestId('event-card')).toContainText('내일 경기');
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  const before = await page.evaluate(() => localStorage.getItem('haeram-soccor:manifest'));
  await page.evaluate(() => {
    (globalThis as typeof globalThis & { failWrites?: boolean }).failWrites = true;
  });
  const revision = await advanceRound(page);
  await expect(page.getByRole('alert')).toContainText('저장 실패');
  const alerts = page.getByTestId('runtime-alerts');
  await expect(
    alerts.getByRole('button', { name: '저장 다시 불러오기', exact: true }),
  ).toBeVisible();
  expect(
    await alerts.evaluate((element) => ({
      portal: element.parentElement === document.body,
      position: getComputedStyle(element).position,
    })),
  ).toEqual({ portal: true, position: 'fixed' });
  // The status names the last committed save beside the revision this match reached.
  await expect(page.getByTestId('save-status')).toContainText(
    new RegExp(`(방금|초 전) 저장 · r${revision} ·`),
  );
  expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:manifest'))).toBe(before);
  const event = page.waitForEvent('download');
  const saveMenu = await openSaveMenu(page);
  await saveMenu.getByRole('button', { name: '기록 내보내기', exact: true }).click();
  const download = await event;
  const memory = (await decode(readFileSync((await download.path())!, 'utf8'))).world;
  expect(memory.round).toBe(1);
  expect(memory.revision).toBe(revision);
  await page.evaluate(() => {
    (globalThis as typeof globalThis & { failWrites?: boolean }).failWrites = false;
  });
  await page.getByRole('button', { name: '저장 재시도' }).click();
  await saveMenu.getByRole('button', { name: '창 닫기', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText(`저장 완료 · r${revision} ·`);
  await page.reload();
  await expect(page.getByTestId('game-round')).toHaveText('1');
});
test('unsupported import leaves the current world and manifest intact', async ({ page }) => {
  await found(page);
  const data = {
    manifest: (await page.evaluate(() => localStorage.getItem('haeram-soccor:manifest')))!,
    raw: (await committedRaw(page))!,
  };
  const future = { ...JSON.parse(data.raw), schema: 99 };
  await (
    await openSaveMenu(page)
  )
    .locator('input[type=file]')
    .last()
    .setInputFiles({
      name: 'future.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(future)),
    });
  await page.getByRole('button', { name: '기록 교체하고 가져오기' }).click();
  await expect(page.getByRole('alert')).toContainText('지원하지 않는');
  expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:manifest'))).toBe(
    data.manifest,
  );
  await expect(page.getByTestId('game-round')).toHaveText('0');
});
test('a terminated real worker exposes recovery and retains the last committed checkpoint', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeWorker = Worker;
    globalThis.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        // The engine worker, not the codec worker the client creates beside it.
        if (!String(url).includes('codec'))
          (globalThis as typeof globalThis & { testWorker?: Worker }).testWorker = this;
      }
    };
  });
  await found(page);
  const manifest = await page.evaluate(() => localStorage.getItem('haeram-soccor:manifest'));
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
  expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:manifest'))).toBe(manifest);
  await page.reload();
  await expect(page.getByTestId('game-round')).toHaveText('0');
  await expect(
    page.getByTestId('club-hub').getByRole('button', { name: '전술·선발 준비', exact: true }),
  ).toBeEnabled();
});
test('a new game goes into another slot, both careers survive switching and back navigation works', async ({
  page,
}) => {
  await found(page);
  await page.getByRole('button', { name: '선수단·스태프', exact: true }).click();
  await expect(page).toHaveURL(/\/people$/);
  await expect(
    page.getByRole('tablist', { name: '선수단·스태프 보기', exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  // Whichever tab a game was left on, a game entered from the slot screen opens on home.
  await page.getByRole('button', { name: '훈련·육성', exact: true }).click();
  await expect(page).toHaveURL(/\/training$/);
  await expect(page.getByRole('tablist', { name: '훈련·육성 보기', exact: true })).toBeVisible();
  await (await openSaveMenu(page)).getByRole('button', { name: '게임 슬롯', exact: true }).click();
  const slotScreen = page.getByTestId('game-slots');
  await expect(slotScreen.getByRole('listitem', { name: '슬롯 1' })).toContainText('진행 중');
  await slotScreen
    .getByRole('listitem', { name: '슬롯 2 · 빈 슬롯' })
    .getByRole('button', { name: '새 게임' })
    .click();
  await expect(page.getByTestId('club-founding')).toContainText('슬롯 2 · 새 게임');
  await page.getByLabel('클럽 이름').fill('New Fictional Club');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  // A new game builds and saves a whole career before the HUD shows it; a loaded WebKit worker
  // can take longer than 15 s.
  await expect(page.getByText('New Fictional Club', { exact: true }).first()).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await expect(page).toHaveURL(/\/journal$/);
  // A reload of a tab in a game continues it.
  await page.reload();
  await expect(page.getByText('New Fictional Club', { exact: true }).first()).toBeVisible();
  // The first career waited in its slot and comes back intact.
  await page.getByRole('button', { name: '리그', exact: true }).first().click();
  await expect(page).toHaveURL(/\/leagues/);
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
  await expect(page.getByText('New Fictional Club', { exact: true })).toHaveCount(0);
  // A fresh window opens on the slot screen.
  const second = await page.context().newPage();
  await second.goto('/');
  await expect(second.getByTestId('game-slots')).toBeVisible();
  await expect(second.getByRole('listitem', { name: '슬롯 2' })).toContainText(
    'New Fictional Club',
  );
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
  await expect(page.getByTestId('club-founding')).toHaveCount(0);
  await empty.getByRole('button', { name: '새 게임' }).click();
  await expect(page.getByTestId('club-founding')).toContainText('슬롯 1 · 새 게임');
});
test('founding beside a parked game shows none of its club, cash or bands', async ({ page }) => {
  const fixture = createWorld({
    country: 'ENG',
    name: 'Parked Crisis',
    color: '#bf7956',
    seed: 'parked-crisis',
    level: 'hard' as const,
  });
  // In debt and without a manager: retain the cash band and the floating manager notice.
  fixture.cash = '-1';
  fixture.critical = MANAGER_GONE;
  await page.goto('/');
  await expect(page.getByRole('button', { name: '클럽 창단' })).toBeEnabled();
  await page
    .locator('input[type=file]')
    .last()
    .setInputFiles({
      name: 'parked-crisis.json',
      mimeType: 'application/json',
      buffer: Buffer.from(await encode(fixture)),
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
  await expect(page.getByTestId('club-founding')).toContainText('슬롯 2 · 새 게임');
  await expect(page.getByTestId('calendar')).toHaveText('1950 · A NEW BEGINNING');
  await expect(page.getByTestId('hud-cash')).toHaveCount(0);
  await expect(page.getByText('Parked Crisis')).toHaveCount(0);
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
