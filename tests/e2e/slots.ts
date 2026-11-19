import { expect, type Page } from '@playwright/test';
import type { World } from '../../packages/contracts/src/types';
import { saveFileOf } from '../fixtures/save-roundtrip';

/** Continues a slot's game from the slot screen the start address opens on (→WEB-62). */
export async function continueSlot(page: Page, slot = 1) {
  await page
    .getByTestId('game-slots')
    .getByRole('listitem', { name: `슬롯 ${slot}` })
    .getByRole('button', { name: '이어하기' })
    .click();
}

/**
 * Puts a game in slot 1 of an empty browser by importing its `.haeram-save` file at the start
 * screen (→SAVE-9, →SAVE-14); the imported game opens and is listed, ready to continue from the
 * slot screen after a reload.
 */
export async function seedSaveFile(page: Page, file: Uint8Array) {
  await page.goto('/');
  await page.getByLabel('기록 파일 가져오기').setInputFiles({
    name: 'seed.haeram-save',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(file),
  });
  await expect(page.getByTestId('club-hub')).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() =>
    (localStorage.getItem('haeram-soccor:games') ?? '').includes('worldId'),
  );
}

/** Puts a world in slot 1 before the first load, to continue from the slot screen. */
export async function seedSlot(page: Page, w: World) {
  await seedSaveFile(page, await saveFileOf(w));
}
