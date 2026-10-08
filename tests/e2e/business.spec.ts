import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { decode, encode } from '../../apps/web/src/adapters/persistence';
import { createWorld, advanceRound, operate } from '../../packages/engine/src/index';
import {
  facilityInvestmentPreview,
  ticketInvestmentPreview,
} from '../../packages/engine/src/investment';
import { campaignOffers, sponsorOffers, sponsorAnnual } from '../../packages/engine/src/operations';
import {
  operatingCosts,
  roundShare,
  gateProjection,
  FINANCE_CONFIG,
} from '../../packages/engine/src/finance';
import { clubOf, quote } from '../../packages/engine/src/world';
import { money, number } from '../../apps/web/src/ui/format';
import type { World } from '../../packages/contracts/src/types';
import { horizontalOverflow, settle } from './layout';
import { acknowledgeEvents } from './events';

async function exportWorld(page: Page): Promise<World> {
  await page.getByRole('button', { name: '전체 메뉴', exact: true }).click();
  const menu = page.getByRole('dialog', { name: '전체 메뉴' });
  const downloading = page.waitForEvent('download');
  await menu.getByRole('button', { name: '기록 내보내기', exact: true }).click();
  const file = await downloading;
  const raw = await readFile((await file.path())!, 'utf8');
  await menu.getByRole('button', { name: '창 닫기', exact: true }).click();
  return (await decode(raw)).world;
}

async function found(page: Page, seed: string) {
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill(seed);
  await page.getByRole('button', { name: '넉넉한 출발' }).click();
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
}

async function openBusiness(page: Page) {
  await page
    .getByRole('navigation', { name: '모바일 게임 메뉴' })
    .getByRole('button', { name: '구단 운영', exact: true })
    .click();
  await expect(page.getByRole('region', { name: '클럽 투자 계획' })).toBeVisible();
}

async function playNext(page: Page) {
  await page
    .getByRole('navigation', { name: '모바일 게임 메뉴' })
    .getByRole('button', { name: '클럽 홈', exact: true })
    .click();
  await page.getByTestId('hub-play').click();
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  await expect(page.getByText(/90′ ·.*경기 종료/)).toBeVisible();
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
]) {
  test(`reviews and settles exact facility investment at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await found(page, `facility-ui-${viewport.width}`);
    const before = await exportWorld(page);
    const preview = facilityInvestmentPreview(before);
    const format = (value: string) => money(value, clubOf(before).country, before.year);
    await openBusiness(page);
    await expect(page.getByRole('tab', { name: '시설', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const review = page.getByRole('button', { name: '시설 투자 검토', exact: true });
    // The policy board now sits above the workbench; scrolling must bring the CTA clear of the nav.
    await review.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await settle(page);
    const reviewBounds = await review.boundingBox();
    const menuBounds = await page
      .getByRole('navigation', { name: '모바일 게임 메뉴' })
      .boundingBox();
    expect(reviewBounds!.height).toBeGreaterThanOrEqual(44);
    expect(reviewBounds!.y + reviewBounds!.height).toBeLessThanOrEqual(menuBounds!.y);
    await review.click();
    const dialog = page.getByRole('dialog', { name: '시설 투자 확인' });
    await expect(dialog).toContainText(format(preview.cost));
    await expect(dialog).toContainText(format(preview.cashAfter));
    await expect(dialog).toContainText(
      `${number(preview.capacityBefore)} → ${number(preview.capacityAfter)}명`,
    );
    await expect(dialog).toContainText(format(preview.maintenanceIncrease));
    const confirm = dialog.getByRole('button', { name: '시설 확장', exact: true });
    await settle(page);
    const bounds = await confirm.boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    await dialog.getByRole('button', { name: '취소', exact: true }).click();
    expect(await exportWorld(page)).toEqual(before);
    await review.click();
    await confirm.click();
    await expect(dialog).toHaveCount(0);
    const after = await exportWorld(page);
    expect(after.facilities).toBe(before.facilities + 1);
    expect(after.cash).toBe(preview.cashAfter);
    expect(BigInt(after.expense) - BigInt(before.expense)).toBe(BigInt(preview.cost));
    expect(operatingCosts(after).maintenance).toBe(preview.maintenanceAfter);
    expect(operatingCosts(after).annual).toBe(preview.annualAfter);
    await page.getByRole('button', { name: '수입·지출 장부', exact: true }).click();
    await expect(page.getByRole('region', { name: '수입과 지출 장부' })).toContainText('시설 확장');
    await page.getByRole('button', { name: '장부 확인 마치기', exact: true }).click();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
}

test('pays sponsor installments only for league games after the actual contract', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await found(page, 'sponsor-installment-ui');
  await playNext(page);
  const before = await exportWorld(page);
  const offer = sponsorOffers(before).find((candidate) => candidate.kind === 'stable')!;
  await openBusiness(page);
  await page.getByRole('tab', { name: '후원', exact: true }).click();
  await expect(page.getByRole('tabpanel', { name: '후원', exact: true })).toContainText(
    '지난 경기를 소급해 받지 않아요.',
  );
  await page
    .getByTestId('sponsor-stable')
    .getByRole('button', { name: '후원 계약', exact: true })
    .click();
  await expect(page.getByRole('button', { name: '후원 계약', exact: true })).toHaveCount(0);
  const signed = await exportWorld(page);
  expect(signed.cash).toBe(before.cash);
  expect(signed.income).toBe(before.income);
  expect(signed.sponsor?.annual).toBe(offer.annual);
  expect(signed.events.filter((event) => event.kind === 'sponsor-payment')).toHaveLength(0);
  await playNext(page);
  const settled = await exportWorld(page);
  const games = settled.fixtures.filter(
    (fixture) =>
      ['league', 'lower'].includes(fixture.kind) &&
      (fixture.home === settled.playerClub || fixture.away === settled.playerClub),
  ).length;
  const payments = settled.events.filter((event) => event.kind === 'sponsor-payment');
  expect(payments).toHaveLength(1);
  expect(payments[0].amount).toBe(
    roundShare(sponsorAnnual(settled), settled.tables[settled.playerClub].played, games),
  );
  expect(BigInt(settled.cash) - BigInt(signed.cash)).toBe(
    BigInt(settled.income) -
      BigInt(signed.income) -
      (BigInt(settled.expense) - BigInt(signed.expense)),
  );
});

test('separates campaign recovery and net ranges and settles after four real rounds', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await found(page, 'campaign-range-ui');
  const before = await exportWorld(page);
  const offer = campaignOffers(before).find((candidate) => candidate.kind === 'outreach')!;
  const format = (value: string) => money(value, clubOf(before).country, before.year);
  await openBusiness(page);
  await page.getByRole('tab', { name: '캠페인', exact: true }).click();
  const card = page.getByTestId('campaign-outreach');
  await expect(card).toContainText(`예상 총 회수${format(offer.min)}–${format(offer.max)}`);
  await expect(card).toContainText(
    `예상 순수익${format((BigInt(offer.min) - BigInt(offer.cost)).toString())}–${format((BigInt(offer.max) - BigInt(offer.cost)).toString())}`,
  );
  await card.getByRole('button', { name: '캠페인 시작', exact: true }).click();
  await expect(card.getByRole('button', { name: '4라운드 남음', exact: true })).toBeDisabled();
  const started = await exportWorld(page);
  expect(BigInt(started.cash)).toBe(BigInt(before.cash) - BigInt(offer.cost));
  expect(started.campaigns.find((campaign) => campaign.kind === 'outreach')?.remaining).toBe(4);
  await expect(card).toContainText(`지급한 비용${format(offer.cost)}`);
  await expect(card).toContainText(`현재 운영 자금${format(started.cash)}`);
  for (let i = 1; i <= 4; i++) {
    await playNext(page);
    const world = await exportWorld(page);
    if (i < 4) {
      expect(world.events.filter((event) => event.kind === 'campaign-result')).toHaveLength(0);
      expect(world.campaigns.find((campaign) => campaign.kind === 'outreach')?.remaining).toBe(
        4 - i,
      );
    } else {
      expect(world.campaigns.find((campaign) => campaign.kind === 'outreach')).toBeUndefined();
      expect(world.events.filter((event) => event.kind === 'campaign-result')).toHaveLength(1);
    }
  }
});

test('keeps ticket drafts out of the save and applies their price to an actual home gate', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await found(page, 'ticket-draft-ui');
  const before = await exportWorld(page);
  const price = 0.12;
  const preview = ticketInvestmentPreview(before, price);
  const format = (value: string) => money(value, clubOf(before).country, before.year);
  await openBusiness(page);
  const dial = page
    .getByRole('region', { name: '구단 운영 방침' })
    .getByRole('radiogroup', { name: '티켓 가격', exact: true });
  const premium = dial.getByRole('radio', { name: '티켓 가격 프리미엄', exact: true });
  await expect(dial.getByRole('radio', { name: '티켓 가격 보통', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await premium.click();
  const ticket = page.locator('[data-policy="ticket"]');
  await expect(ticket).toContainText(
    `홈 관중 ${number(preview.after.attendanceLow)}–${number(preview.after.attendanceHigh)}명`,
  );
  await expect(ticket).toContainText(
    `경기당 입장 수입 ${format(preview.after.incomeLow)}–${format(preview.after.incomeHigh)}`,
  );
  expect(preview.after.attendanceHigh).toBeLessThan(preview.before.attendanceHigh);
  await expect(premium).toHaveAttribute('aria-checked', 'false');
  expect(await exportWorld(page)).toEqual(before);
  await ticket.getByRole('button', { name: '‘프리미엄’ 적용', exact: true }).click();
  await expect(premium).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('action-outcome')).toContainText('티켓 가격을 바꿨어요');
  const applied = await exportWorld(page);
  expect(applied.ticket).toBe(price);
  expect(applied.cash).toBe(before.cash);
  await page.reload();
  await expect(premium).toHaveAttribute('aria-checked', 'true');
  await playNext(page);
  const settled = await exportWorld(page);
  const match = settled.ownMatches.at(-1)!;
  expect(match.home).toBe(settled.playerClub);
  const gate = settled.events.findLast((event) => event.kind === 'gate')!;
  const attendance = Number(gate.detail.match(/관중 (\d+)명/)?.[1]);
  expect(attendance).toBeGreaterThan(0);
  const perFan = gateProjection(settled, match.id).perFan;
  expect(gate.amount).toBe(quote(clubOf(settled).country, settled.year, attendance * perFan));
  expect(settled.events.findLast((event) => event.kind === 'match-cost')?.amount).toBe(
    quote(
      clubOf(settled).country,
      settled.year,
      FINANCE_CONFIG.homeMatchBaseCost + attendance * FINANCE_CONFIG.homeMatchCostPerFan,
    ),
  );
});

test('recovers a genuine negative operating balance and enforces the three-contribution limit', async ({
  page,
}) => {
  const fixture = createWorld({
    country: 'ENG',
    name: 'Budget Fixture',
    color: '#bf7956',
    seed: 'business-budget-recovery',
    difficulty: 0.5,
  });
  operate(fixture, { type: 'ticket', price: 0.01 });
  for (let i = 0; i < 46 && BigInt(fixture.cash) >= 0n; i++)
    advanceRound(fixture, undefined, false);
  expect(BigInt(fixture.cash)).toBeLessThan(0n);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '클럽 창단' })).toBeEnabled();
  await page
    .locator('input[type=file]')
    .last()
    .setInputFiles({
      name: 'synthetic-operating-loss.json',
      mimeType: 'application/json',
      buffer: Buffer.from(await encode(fixture)),
    });
  await expect(page.getByTestId('club-hub')).toBeVisible();
  // The imported mid-season career carries unread attention events (e.g. the winter window).
  await acknowledgeEvents(page);
  await openBusiness(page);
  const support = page.getByRole('button', { name: '추가 출자', exact: true });
  await expect(support).toBeEnabled();
  await support.click();
  await expect(
    page.getByRole('status').filter({ hasText: '추가 출자를 기록했어요.' }),
  ).toBeVisible();
  await page.getByText('운영을 이어갈 추가 출자', { exact: true }).click();
  await support.click();
  await expect(page.getByRole('region', { name: '클럽 투자 계획' })).toContainText(
    '이번 시즌 2/3회',
  );
  await support.click();
  await expect(support).toBeDisabled();
  const recovered = await exportWorld(page);
  expect(BigInt(recovered.cash)).toBe(
    BigInt(fixture.cash) + BigInt(quote(clubOf(fixture).country, fixture.year, 150)) * 3n,
  );
  expect(
    recovered.events.filter((event) => event.kind === 'support' && event.year === fixture.year),
  ).toHaveLength(3);
  expect(recovered.critical).toBeUndefined();
});
