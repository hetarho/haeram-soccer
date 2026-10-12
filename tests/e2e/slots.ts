import type { Page } from '@playwright/test';

/** Continues a slot's game from the slot screen the start address opens on (→WEB-62). */
export async function continueSlot(page: Page, slot = 1) {
  await page
    .getByTestId('game-slots')
    .getByRole('listitem', { name: `슬롯 ${slot}` })
    .getByRole('button', { name: '이어하기' })
    .click();
}
