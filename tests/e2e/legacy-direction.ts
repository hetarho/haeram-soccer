import { expect, type Page } from '@playwright/test';
import { saveFileOf } from '../fixtures/save-file';
import { careerWorld } from '../../packages/engine/src/career.testkit';
import { acknowledgeEvents } from './events';

/** Existing saved directions are still supported; new takeovers never select one. */
export async function importLegacyDirection(page: Page, preset: string, seed = 'legacy-direction') {
  const world = careerWorld({ country: 'ENG', year: 1930, seed, preset });
  await page.goto('/');
  await expect(page.getByTestId('start-flow')).toBeVisible();
  await page
    .locator('input[type=file]')
    .last()
    .setInputFiles({
      name: 'legacy-direction.haeram-save',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(await saveFileOf(world)),
    });
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await acknowledgeEvents(page);
}
