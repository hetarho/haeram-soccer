import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { decode } from '../../apps/web/src/adapters/persistence';
const found = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('save-status')).toContainText('저장 완료 · r0');
};
const advanceRound = async (page: import('@playwright/test').Page) => {
  await page
    .getByTestId('club-hub')
    .getByRole('button', { name: '시즌 상세', exact: true })
    .click();
  const journal = page.getByRole('dialog', { name: '시즌 상세와 클럽 소식' });
  const before = await page.getByTestId('save-status').textContent();
  await journal.getByRole('button', { name: '한 라운드 진행', exact: true }).click();
  await expect(page.getByTestId('save-status')).not.toHaveText(before!);
  await journal.getByRole('button', { name: '창 닫기', exact: true }).click();
};
test('one writer, live read-only updates and ownership after reload', async ({ page, context }) => {
  await found(page);
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.getByRole('status').filter({ hasText: '읽기 전용' })).toContainText(
    '읽기 전용',
  );
  await expect(second.getByTestId('hub-play')).toBeDisabled();
  await page.bringToFront();
  await advanceRound(page);
  await expect(page.getByTestId('save-status')).toContainText('저장 완료 · r1');
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
  await advanceRound(page);
  await expect(page.getByTestId('save-status')).toContainText('저장 완료 · r1');
  await page.evaluate(() => {
    localStorage.setItem('another-app:keep', 'present');
    const m = JSON.parse(localStorage.getItem('haeram-soccor:manifest')!);
    localStorage.setItem(`haeram-soccor:slot:${m.slot ? 'b' : 'a'}`, 'corrupt');
  });
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: '체크포인트로 복구' })).toContainText(
    '체크포인트로 복구',
  );
  await expect(page.getByTestId('calendar')).toContainText('라운드 0');
  expect(await page.evaluate(() => localStorage.getItem('another-app:keep'))).toBe('present');
  await advanceRound(page);
  await expect(page.getByTestId('save-status')).toContainText('저장 완료 · r1');
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
  await advanceRound(page);
  await expect(page.getByRole('alert')).toContainText('저장 실패');
  await expect(page.getByTestId('save-status')).toContainText('저장 대기 · r1');
  expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:manifest'))).toBe(before);
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: '기록 내보내기', exact: true }).click();
  const download = await event;
  const memory = (await decode(readFileSync((await download.path())!, 'utf8'))).world;
  expect(memory.round).toBe(1);
  await page.evaluate(() => {
    (globalThis as typeof globalThis & { failWrites?: boolean }).failWrites = false;
  });
  await page.getByRole('button', { name: '저장 재시도' }).click();
  await expect(page.getByTestId('save-status')).toContainText('저장 완료 · r1');
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
test('safe explicit new-world replacement and browser back navigation', async ({ page }) => {
  await found(page);
  await page.getByRole('button', { name: '스태프', exact: true }).click();
  await expect(page).toHaveURL(/\/manager$/);
  await page.goBack();
  await expect(page.getByRole('button', { name: '다음 경기 관전' })).toBeVisible();
  await page.getByRole('button', { name: '새로운 세계' }).click();
  await page.getByRole('button', { name: '새 세계 설정' }).click();
  await page.getByLabel('클럽 이름').fill('New Fictional Club');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  // Replacing the world builds and saves a whole new career before the HUD shows it.
  await expect(page.getByText('New Fictional Club', { exact: true }).first()).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  await expect(page.getByText('New Fictional Club', { exact: true }).first()).toBeVisible();
});
