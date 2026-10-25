import { expect, type Page } from '@playwright/test';
import { createWorld, operate, advanceDays, transferOffers } from '../../packages/engine/src/index';
import type { World } from '../../packages/contracts/src/types';
import { ratio } from '../../packages/engine/src/primitives';
import { encode } from '../../apps/web/src/adapters/persistence';

/** A portable checkpoint built through actual bid and settlement commands, never DOM state edits. */
export function pendingAcquisitionCareer() {
  const w = createWorld({
    country: 'ENG',
    name: 'Pending Duties',
    color: '#224466',
    seed: 'responsibility-pending',
    level: 'normal',
  });
  w.cash = w.income = '999999999999';
  const settings = structuredClone(w.settings!);
  settings.responsibilities.staff = 'direct';
  settings.responsibilities.sales = 'delegated';
  operate(w, { type: 'settings', settings });
  const offers = transferOffers(w);
  for (let candidate = 0; candidate < offers.length; candidate++) {
    const offer = offers[candidate];
    if (!offer.available || offer.freeAgent || BigInt(offer.fee) <= 0n) continue;
    operate(w, { type: 'bid', candidate, fee: ratio(offer.fee, 8n, 10n) });
  }
  for (let day = 0; day < 4; day++) advanceDays(w, 1, undefined, false);
  const counters = (w.bids || []).filter(
    (bid) => bid.direction === 'out' && bid.status === 'countered',
  );
  expect(counters.length).toBeGreaterThanOrEqual(2);
  for (const bid of counters.slice(2))
    operate(w, { type: 'respond-bid', id: bid.id, accept: false });
  expect(w.bids?.filter((bid) => bid.status === 'countered')).toHaveLength(2);
  return w;
}
export async function importResponsibilityCareer(page: Page, world: World) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '클럽 창단' })).toBeEnabled();
  await page
    .locator('input[type=file]')
    .last()
    .setInputFiles({
      name: 'responsibilities.json',
      mimeType: 'application/json',
      buffer: Buffer.from(await encode(world, 1, 0)),
    });
  // A 35-round career on the released model: CI WebKit 40233059787 opened it in over 5 s.
  await expect(page.getByTestId('club-hub')).toBeVisible({ timeout: 15000 });
}
export async function closeSettingsOutcome(page: Page) {
  const outcome = page.getByTestId('action-outcome');
  await expect(outcome).toContainText('설정을 적용했어요');
  await outcome.getByRole('button', { name: /^(확인|알림 닫기)$/ }).click();
}
