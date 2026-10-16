import { test, expect, type Page } from '@playwright/test';
import { combinedCareerFixture, exportedCareer } from './career-fixtures';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { transferOffers } from '../../packages/engine/src/index';
import { detectMediations } from '../../packages/engine/src/mediation';
import { lineOf } from '../../packages/engine/src/player';
const nav = (page: Page) => page.getByRole('navigation', { name: '모바일 게임 메뉴' });
async function operations(page: Page) {
  await nav(page).getByRole('button', { name: '구단 운영', exact: true }).click();
  await expect(page.getByTestId('strategy-board')).toBeVisible();
}

test('rules three retains a joint career and promise through scoped drafts, handover and portable reload', async ({
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
  await operations(page);
  const finance = page.getByRole('region', { name: '재정', exact: true });
  await finance.getByRole('button', { name: /어디서 벌고/ }).click();
  await finance.getByRole('radio', { name: '재정 기조 신중', exact: true }).click();
  await nav(page).getByRole('button', { name: '선수단·스태프', exact: true }).click();
  await page.getByRole('tab', { name: '이적시장', exact: true }).click();
  await page.getByRole('button', { name: /^영입 기조/ }).click();
  const sheet = page.getByRole('dialog', { name: '영입 운영 방침', exact: true });
  await sheet.getByRole('radio', { name: '스카우팅 데이터 스카우팅', exact: true }).click();
  await sheet
    .getByTestId('strategy-draft')
    .getByRole('button', { name: '적용', exact: true })
    .click();
  await expect(sheet).toHaveCount(0);
  await page.getByTestId('intervention-trigger').click();
  const settings = page.getByRole('dialog', { name: '위임·진행 설정', exact: true });
  await settings
    .getByRole('combobox', { name: '선수 영입', exact: true })
    .selectOption('delegated');
  await expect(settings.getByRole('region', { name: '대기 업무 이관 미리보기' })).toContainText(
    '선수 영입 1건',
  );
  await settings.getByRole('button', { name: '적용', exact: true }).click();
  await page
    .getByTestId('action-outcome')
    .getByRole('button', { name: '확인', exact: true })
    .click();
  await operations(page);
  const draft = page.getByTestId('strategy-draft');
  await draft.getByRole('button', { name: /건 변경/ }).click();
  await expect(draft).toContainText('재정 기조 표준 → 신중');
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
    await expect(imported.getByTestId('strategy-draft')).toHaveCount(0);
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
  await nav(page).getByRole('button', { name: '선수단·스태프', exact: true }).click();
  await page.getByRole('tab', { name: '이적시장', exact: true }).click();
  const negotiation = page.getByRole('region', { name: '진행 중인 협상' });
  await expect(negotiation).toContainText('선수·코치 계약 함께 종료');
  await expect(negotiation).toContainText('코치 계약 종료 보상');
  await negotiation.getByRole('button', { name: '매각', exact: true }).click();
  const saved = await exportedCareer(page);
  expect(saved.staff!.some((s) => s.person === player.id)).toBe(false);
  expect(saved.people![player.id].club).toBe(bid.club);
  expect(BigInt(saved.cash)).toBe(BigInt(w.cash) + BigInt(bid.fee) - BigInt(compensation));
});
