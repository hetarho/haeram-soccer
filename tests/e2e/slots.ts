import type { Page } from '@playwright/test';
import { encode } from '../../apps/web/src/adapters/persistence';
import type { World } from '../../packages/contracts/src/types';

/** Continues a slot's game from the slot screen the start address opens on (→WEB-62). */
export async function continueSlot(page: Page, slot = 1) {
  await page
    .getByTestId('game-slots')
    .getByRole('listitem', { name: `슬롯 ${slot}` })
    .getByRole('button', { name: '이어하기' })
    .click();
}

/** Puts a world in slot 1 before the first load, to continue from the slot screen. */
export async function seedSlot(page: Page, w: World) {
  const raw = await encode(w, 1, 0);
  await page.addInitScript((raw) => {
    if (localStorage.getItem('haeram-soccor:manifest')) return;
    const envelope = JSON.parse(raw);
    localStorage.setItem('haeram-soccor:slot:a', raw);
    localStorage.setItem(
      'haeram-soccor:manifest',
      JSON.stringify({
        slot: 0,
        worldId: envelope.worldId,
        generation: envelope.generation,
        parentGeneration: envelope.parentGeneration,
      }),
    );
  }, raw);
}
