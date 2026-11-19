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
 * screen (→SAVE-9, →SAVE-14); the imported game opens, is listed and stays in play in this tab, so
 * a reload continues it.
 */
export async function seedSaveFile(page: Page, file: Uint8Array) {
  await page.goto('/');
  const input = page.getByLabel('기록 파일 가져오기');
  // The input stays disabled while the engine worker starts its database pool, and a file set on
  // it then is dropped; setInputFiles does not wait for enabled on its own.
  await expect(input).toBeEnabled({ timeout: 60_000 });
  await input.setInputFiles({
    name: 'seed.haeram-save',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(file),
  });
  await expect(page.getByTestId('club-hub')).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() =>
    (localStorage.getItem('haeram-soccor:games') ?? '').includes('worldId'),
  );
}

/**
 * Puts a game file in slot 1 before the journey, to continue from the slot screen. The import puts
 * this tab in the game, and a tab in a game continues it at the start address (→WEB-62); the tab
 * forgets that, so the next start address opens the slot screen as a new tab would.
 */
export async function seedSlotFile(page: Page, file: Uint8Array) {
  await seedSaveFile(page, file);
  await page.evaluate(() => sessionStorage.removeItem('haeram-soccor:in-game'));
}

/** Puts a world in slot 1 before the first load, to continue from the slot screen. */
export async function seedSlot(page: Page, w: World) {
  await seedSlotFile(page, await saveFileOf(w));
}
