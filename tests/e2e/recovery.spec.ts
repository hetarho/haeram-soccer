import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { decode, encode } from '../../apps/web/src/adapters/persistence';
import { createWorld } from '../../packages/engine/src/index';
import { MANAGER_GONE } from '../../packages/engine/src/operations';
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
  await page
    .getByTestId('club-hub')
    .getByRole('button', { name: '시즌 상세', exact: true })
    .click();
  const journal = page.getByRole('dialog', { name: '시즌 상세와 클럽 소식' });
  const before = await shownRevision(page);
  await journal.getByRole('button', { name: '한 라운드 진행', exact: true }).click();
  await expect.poll(() => shownRevision(page)).toBeGreaterThan(before);
  const revision = await shownRevision(page);
  await journal.getByRole('button', { name: '창 닫기', exact: true }).click();
  return revision;
};
test('one writer, live read-only updates and ownership after reload', async ({ page, context }) => {
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
  await expect(second.getByTestId('hub-play')).toBeDisabled();
  await page.bringToFront();
  const revision = await advanceRound(page);
  await expect(page.getByTestId('save-status')).toContainText(`저장 완료 · r${revision} ·`);
  await second.bringToFront();
  await expect(second.getByTestId('calendar')).toContainText('라운드 1', { timeout: 10000 });
  await page.close();
  await second.reload();
  await expect(second.getByTestId('hub-play')).toBeEnabled();
  await second.close();
});
test('recovers prior checkpoint after active corruption without clearing another application key', async ({
  page,
}) => {
  await found(page);
  const first = await advanceRound(page);
  await expect(page.getByTestId('save-status')).toContainText(`저장 완료 · r${first} ·`);
  await page.evaluate(() => {
    localStorage.setItem('another-app:keep', 'present');
    const m = JSON.parse(localStorage.getItem('haeram-soccor:manifest')!);
    localStorage.setItem(`haeram-soccor:slot:${m.slot ? 'b' : 'a'}`, 'corrupt');
  });
  await page.reload();
  // The recovery is an unread system notification in the HUD inbox, never a banner (→WEB-66).
  await page.getByRole('button', { name: /^소식함 · 읽지 않은 소식/ }).click();
  const inbox = page.getByRole('dialog', { name: '소식함' });
  await expect(inbox.getByRole('listitem').filter({ hasText: '시스템' })).toContainText(
    '체크포인트로 복구',
  );
  await inbox.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '체크포인트로 복구' })).toHaveCount(0);
  await expect(page.getByTestId('calendar')).toContainText('라운드 0');
  expect(await page.evaluate(() => localStorage.getItem('another-app:keep'))).toBe('present');
  const again = await advanceRound(page);
  await expect(page.getByTestId('save-status')).toContainText(`저장 완료 · r${again} ·`);
  await page.reload();
  await expect(page.getByTestId('calendar')).toContainText('라운드 1');
});
test('quota failure preserves disk save, exports actual memory progress and retries', async ({
  page,
}) => {
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
  const before = await page.evaluate(() => localStorage.getItem('haeram-soccor:manifest'));
  await page.evaluate(() => {
    (globalThis as typeof globalThis & { failWrites?: boolean }).failWrites = true;
  });
  const revision = await advanceRound(page);
  await expect(page.getByRole('alert')).toContainText('저장 실패');
  // The status names the last save, the founding one, beside the revision this round reached.
  await expect(page.getByTestId('save-status')).toContainText(
    new RegExp(`(방금|초 전) 저장 · r${revision} ·`),
  );
  expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:manifest'))).toBe(before);
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: '기록 내보내기', exact: true }).click();
  const download = await event;
  const memory = (await decode(readFileSync((await download.path())!, 'utf8'))).world;
  expect(memory.round).toBe(1);
  expect(memory.revision).toBe(revision);
  await page.evaluate(() => {
    (globalThis as typeof globalThis & { failWrites?: boolean }).failWrites = false;
  });
  await page.getByRole('button', { name: '저장 재시도' }).click();
  await expect(page.getByTestId('save-status')).toContainText(`저장 완료 · r${revision} ·`);
  await page.reload();
  await expect(page.getByTestId('calendar')).toContainText('라운드 1');
});
test('unsupported import leaves the current world and manifest intact', async ({ page }) => {
  await found(page);
  const data = await page.evaluate(() => {
    const m = localStorage.getItem('haeram-soccor:manifest')!;
    const raw = localStorage.getItem('haeram-soccor:slot:a')!;
    return { manifest: m, raw };
  });
  const future = { ...JSON.parse(data.raw), schema: 99 };
  await page
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
  await expect(page.getByTestId('calendar')).toContainText('라운드 0');
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
  await expect(page.getByTestId('calendar')).toContainText('라운드 0');
  await expect(page.getByTestId('hub-play')).toBeEnabled();
});
test('a new game goes into another slot, both careers survive switching and back navigation works', async ({
  page,
}) => {
  await found(page);
  await page.getByRole('button', { name: '선수·스태프', exact: true }).click();
  await expect(page).toHaveURL(/\/people$/);
  await page.goBack();
  await expect(page.getByRole('button', { name: '다음 경기 관전' })).toBeVisible();
  // Whichever tab a game was left on, a game entered from the slot screen opens on home.
  await page.getByRole('button', { name: '훈련·육성', exact: true }).click();
  await expect(page).toHaveURL(/\/training$/);
  await page.getByRole('button', { name: '게임 슬롯' }).click();
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
  await page.getByRole('button', { name: '구단 운영', exact: true }).click();
  await expect(page).toHaveURL(/\/business\?view=strategy$/);
  await page.getByRole('button', { name: '게임 슬롯' }).click();
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
test('founding beside a parked game shows none of its club, cash or bands', async ({ page }) => {
  const fixture = createWorld({
    country: 'ENG',
    name: 'Parked Crisis',
    color: '#bf7956',
    seed: 'parked-crisis',
    difficulty: 0.5,
  });
  // In debt and without a manager: the red band and the manager notice sit under the HUD.
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
  await page.getByRole('button', { name: '게임 슬롯' }).click();
  const slotScreen = page.getByTestId('game-slots');
  await slotScreen
    .getByRole('listitem', { name: '슬롯 2 · 빈 슬롯' })
    .getByRole('button', { name: '새 게임' })
    .click();
  await expect(page.getByTestId('club-founding')).toContainText('슬롯 2 · 새 게임');
  await expect(page.getByTestId('calendar')).toHaveText('1950 · A NEW BEGINNING');
  await expect(page.getByTestId('hud-cash')).toHaveCount(0);
  await expect(page.getByText('Parked Crisis')).toHaveCount(0);
  await expect(page.getByTestId('save-status')).toHaveText('로그인 없이 시작하세요');
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
