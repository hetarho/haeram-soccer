import { expect, type Page } from '@playwright/test';
import { encode } from '../../apps/web/src/adapters/persistence';
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
      name: 'legacy-direction.json',
      mimeType: 'application/json',
      buffer: Buffer.from(await encode(world)),
    });
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await acknowledgeEvents(page);
}
