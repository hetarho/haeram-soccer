import { openPersonnel } from './personnel-navigation';
import { openDirectionInForce } from './office';
import { closeMarketPanel } from './market';
import { openOffice } from './events';
import { test, expect, type Page } from '@playwright/test';
import { combinedCareerFixture, exportedCareer } from './career-fixtures';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { transferOffers } from '../../packages/engine/src/index';
import { detectMediations } from '../../packages/engine/src/mediation';
import { lineOf } from '../../packages/engine/src/player';
import { leaveOffice } from './office';
/** 구단 운영 › 재정·투자's direction in force, entered through the club sections (→WEB-110). */
async function operations(page: Page) {
  await openDirectionInForce(page);
  await expect(page.getByTestId('direction-areas').getByRole('radio')).toHaveCount(0);
}

test('rules three retains a joint career and promise through handover and portable reload', async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  const { w, player } = await combinedCareerFixture();
  // Marked synthetic financial conflict, detected by the real signing verdict after real joint approval.
  w.cash = '0';
  const offer = transferOffers(w).find((o) => o.available && lineOf(o.player.position) === 'MF')!;
  w.shortlist = {
    year: w.year,
    day: 0,
    entries: [{ playerId: offer.player.id, line: 'MF' }],
    requests: [{ kind: 'short', line: 'MF', pick: offer.player.id }],
  };
  expect(detectMediations(w)).toHaveLength(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await importResponsibilityCareer(page, w);
  // The direction reads as saved; nothing in the career edits it (→ECON-25).
  await operations(page);
  await expect(
    page.getByTestId('direction-areas').locator('[data-row="finance"]').first(),
  ).toContainText('표준');
  await leaveOffice(page);
  const office = await openOffice(page);
  await office
    .getByRole('group', { name: '선수 영입', exact: true })
    .getByRole('button', { name: '자동', exact: true })
    .click();
  const settings = page.getByRole('dialog', { name: '자동으로 처리하겠습니다.', exact: true });
  await expect(settings.getByRole('region', { name: '대기 업무 이관 미리보기' })).toContainText(
    '선수 영입 1건',
  );
  await settings.getByRole('button', { name: '자동으로 맡기기', exact: true }).click();
  // The changed choice shows the result itself; no outcome card follows (→WEB-36).
  await expect(settings).toHaveCount(0);
  await expect(page.getByTestId('action-outcome')).toHaveCount(0);
  await operations(page);
  const saved = await exportedCareer(page);
  expect(saved.direction?.finance ?? 'standard').toBe('standard');
  expect(saved.playingCoachProposals![player.id].status).toBe('accepted');
  expect(saved.staff!.filter((s) => s.person === player.id)).toHaveLength(1);
  expect(saved.mediations![0].status).toBe('resolved');
  expect(saved.promises).toHaveLength(1);
  expect(saved.promises![0].status).toBe('pending');
  await page.reload();
  const reloaded = await exportedCareer(page);
  expect(reloaded.people![player.id]).toEqual(saved.people![player.id]);
  expect(reloaded.promises).toEqual(saved.promises);
  expect(reloaded.cash).toBe(saved.cash);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const imported = await context.newPage();
    await importResponsibilityCareer(imported, reloaded);
    const portable = await exportedCareer(imported);
    expect(portable.people![player.id]).toEqual(saved.people![player.id]);
    expect(portable.promises).toEqual(saved.promises);
    expect(portable.cash).toBe(saved.cash);
    await operations(imported);
    expect(portable.direction).toEqual(saved.direction);
  } finally {
    await context.close();
  }
});

test('the market discloses combined departure compensation before its approval', async ({
  page,
}) => {
  const { prepareSeason } = await import('../../packages/engine/src/season');
  const { playingCoachDepartureCost } = await import('../../packages/engine/src/playing-coach');
  const { w, player } = await combinedCareerFixture();
  w.year++;
  prepareSeason(w);
  const bid = {
    id: 'synthetic-market-combined-sale',
    direction: 'in' as const,
    playerId: player.id,
    club: w.clubs.find((c) => c.id !== w.playerClub)!.id,
    fee: '9999999',
    year: w.year,
    day: 0,
    due: 5,
    status: 'pending' as const,
  };
  w.bids = [bid];
  const compensation = playingCoachDepartureCost(w, player.id);
  await page.setViewportSize({ width: 390, height: 844 });
  await importResponsibilityCareer(page, w);
  await openPersonnel(page, 'market');
  await page.getByRole('button', { name: /^이적 협상 ·/ }).click();
  const negotiation = page.getByRole('region', { name: '진행 중인 협상' });
  await expect(negotiation).toContainText('선수·코치 계약 함께 종료');
  await expect(negotiation).toContainText('코치 계약 종료 보상');
  await negotiation.getByRole('button', { name: '매각', exact: true }).click();
  await closeMarketPanel(page, '이적 협상');
  const saved = await exportedCareer(page);
  expect(saved.staff!.some((s) => s.person === player.id)).toBe(false);
  expect(saved.people![player.id].club).toBe(bid.club);
  expect(BigInt(saved.cash)).toBe(BigInt(w.cash) + BigInt(bid.fee) - BigInt(compensation));
});
