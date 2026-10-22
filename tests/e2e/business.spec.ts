import { watchNext } from './watch';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { decode, encode } from '../../apps/web/src/adapters/persistence';
import { createWorld, advanceRound, operate } from '../../packages/engine/src/index';
import {
  facilityInvestmentPreview,
  ticketInvestmentPreview,
} from '../../packages/engine/src/investment';
import { sponsorOffers, sponsorAnnual } from '../../packages/engine/src/operations';
import {
  operatingCosts,
  roundShare,
  gateProjection,
  FINANCE_CONFIG,
  isLeagueMatch,
  leagueMatchFactor,
} from '../../packages/engine/src/finance';
import { clubOf, quote } from '../../packages/engine/src/world';
import { compactMoney, number } from '../../apps/web/src/ui/format';
import type { World } from '../../packages/contracts/src/types';
import { horizontalOverflow, settle } from './layout';
import { acknowledgeEvents, chooseLevel } from './events';

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
  await page.getByRole('button', { name: '쉬움' }).click();
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
}

/** 방향 opens on the direction board; `tab` picks 증축, 자금 or 후원 (→WEB-39). */
async function openBusiness(page: Page, tab?: string) {
  await page
    .getByRole('navigation', { name: '모바일 게임 메뉴' })
    .getByRole('button', { name: '구단 운영', exact: true })
    .click();
  await expect(page.getByRole('tablist', { name: '구단 운영 보기' })).toBeVisible();
  if (tab) await page.getByRole('tab', { name: tab, exact: true }).click();
}

async function playNext(page: Page) {
  await page
    .getByRole('navigation', { name: '모바일 게임 메뉴' })
    .getByRole('button', { name: '클럽 홈', exact: true })
    .click();
  // A match can leave an owner-held decision (a mediation after an injury) before the next one.
  await acknowledgeEvents(page);
  await watchNext(page);
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  await expect(page.getByText(/90(\+\d+)?′ ·.*경기 종료/)).toBeVisible();
}

test('older operations addresses open their tab', async ({ page }) => {
  // Founds a club, then reloads the app cold for each of eight addresses; slow CI browsers need longer.
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  await found(page, 'direction-addresses');
  await openBusiness(page);
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  // 방향 is the first page tab and keeps no ?view= (→WEB-39, →WEB-69); there is no 캠페인 tab.
  await expect(page.getByRole('tab', { name: '운영 방침', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page).toHaveURL(/\/direction$/);
  await expect(page.getByRole('tab', { name: '캠페인', exact: true })).toHaveCount(0);
  // Every older /business address opens its tab under /direction.
  for (const [asked, tab, now] of [
    ['/business', '운영 방침', /\/direction$/],
    ['/business?view=facility', '시설', /\/direction\?view=build$/],
    ['/business?view=marketing', '재정', /\/direction\?view=finance$/],
    ['/business?view=strategy', '운영 방침', /\/direction$/],
    ['/business?view=build', '시설', /\/direction\?view=build$/],
    ['/business?view=finance', '재정', /\/direction\?view=finance$/],
    ['/business?view=sponsor', '후원', /\/direction\?view=sponsor$/],
    ['/direction?view=build', '시설', /\/direction\?view=build$/],
  ] as const) {
    await page.goto(asked);
    await expect(page.getByRole('tab', { name: tab, exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page).toHaveURL(now);
  }
  await expect(page.getByRole('region', { name: '캠페인', exact: true })).toHaveCount(0);
  // Campaigns are no more (→ECON-7): 자금 shows none to start.
  await page.getByRole('tab', { name: '재정', exact: true }).click();
  await expect(page.getByRole('region', { name: '클럽 재정', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '캠페인', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '캠페인 시작' })).toHaveCount(0);
});

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
]) {
  test(`reviews and starts a stadium expansion at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await found(page, `facility-ui-${viewport.width}`);
    const before = await exportWorld(page);
    const preview = facilityInvestmentPreview(before, 'stadium');
    // Every amount reads in the one notation (→WEB-67); the exact value opens on tap or hover.
    const format = (value: string) => compactMoney(value, clubOf(before).country, before.year);
    await openBusiness(page, '시설');
    await expect(page.getByRole('tab', { name: '시설', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // Three parts built separately (→ECON-32): the stadium's ladder, the training ground and the
    // academy facilities.
    await expect(page.getByTestId('facility-stadium')).toContainText('동네 구장');
    await expect(page.getByTestId('stadium-step-0')).toHaveAttribute('data-state', 'current');
    await expect(page.getByTestId('facility-training')).toContainText('0/5단계');
    await expect(page.getByTestId('facility-academy')).toContainText('0/5단계');
    const review = page.getByRole('button', { name: '경기장 공사 검토', exact: true });
    // Scrolling must bring the CTA clear of the nav.
    await review.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await settle(page);
    const reviewBounds = await review.boundingBox();
    const menuBounds = await page
      .getByRole('navigation', { name: '모바일 게임 메뉴' })
      .boundingBox();
    expect(reviewBounds!.height).toBeGreaterThanOrEqual(44);
    expect(reviewBounds!.y + reviewBounds!.height).toBeLessThanOrEqual(menuBounds!.y);
    await review.click();
    const dialog = page.getByRole('dialog', { name: '경기장 공사 확인' });
    await expect(dialog).toContainText('증축 · 관중석 증축');
    await expect(dialog).toContainText(format(preview.cost));
    await expect(dialog).toContainText(format(preview.cashAfter));
    // A stand is added: 10% of the ground closes while it is built.
    await expect(dialog).toContainText('2,500 → 2,250 → 5,000석');
    await expect(dialog).toContainText('180일');
    const confirm = dialog.getByRole('button', { name: '공사 시작', exact: true });
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
    expect(after.stadium).toBe(0);
    expect(after.facilityWorks?.stadium).toMatchObject({ to: 1 });
    expect(after.cash).toBe(preview.cashAfter);
    expect(BigInt(after.expense) - BigInt(before.expense)).toBe(BigInt(preview.cost));
    // Upkeep waits for the opening.
    expect(operatingCosts(after).maintenance).toBe(preview.maintenanceBefore);
    await expect(page.getByTestId('facility-work-stadium')).toContainText('완공까지 180일');
    await expect(page.getByRole('button', { name: '경기장 공사 검토', exact: true })).toHaveCount(
      1,
    );
    await expect(
      page.getByRole('button', { name: '경기장 공사 검토', exact: true }),
    ).toBeDisabled();
    await page.getByRole('tab', { name: '재정', exact: true }).click();
    await page.getByRole('button', { name: '수입·지출 장부', exact: true }).click();
    await expect(page.getByRole('region', { name: '수입과 지출 장부' })).toContainText('시설 공사');
    await page.getByRole('button', { name: '장부 확인 마치기', exact: true }).click();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
}

test('pays sponsor installments only for league games after the actual contract', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await found(page, 'sponsor-installment-ui');
  const before = await exportWorld(page);
  // A 1950 club in England has only the local slot open (→ECON-8).
  const offer = sponsorOffers(before, 'local').find((candidate) => candidate.kind === 'stable')!;
  await openBusiness(page);
  await page.getByRole('tab', { name: '후원', exact: true }).click();
  await expect(page.getByRole('tabpanel', { name: '후원', exact: true })).toContainText(
    '계약 이후 경기만 지급하며',
  );
  await expect(page.getByTestId('sponsor-slot-shirt')).toContainText('1979/80 시즌부터');
  await page
    .getByTestId('sponsor-local-stable')
    .getByRole('button', { name: '지역 후원 계약', exact: true })
    .click();
  await expect(page.getByRole('button', { name: '지역 후원 계약', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('sponsor-contract-local')).toContainText(offer.name);
  const signed = await exportWorld(page);
  expect(signed.cash).toBe(before.cash);
  expect(signed.income).toBe(before.income);
  expect(signed.sponsors).toEqual([
    expect.objectContaining({ slot: 'local', annual: offer.annual }),
  ]);
  expect(signed.events.filter((event) => event.kind === 'sponsor:local')).toHaveLength(0);
  await playNext(page);
  const settled = await exportWorld(page);
  const games = settled.fixtures.filter(
    (fixture) =>
      ['league', 'lower'].includes(fixture.kind) &&
      (fixture.home === settled.playerClub || fixture.away === settled.playerClub),
  ).length;
  const payments = settled.events.filter((event) => event.kind === 'sponsor:local');
  expect(payments).toHaveLength(1);
  expect(payments[0].amount).toBe(
    roundShare(
      sponsorAnnual(settled, settled.sponsors![0]),
      settled.tables[settled.playerClub].played,
      games,
    ),
  );
  expect(BigInt(settled.cash) - BigInt(signed.cash)).toBe(
    BigInt(settled.income) -
      BigInt(signed.income) -
      (BigInt(settled.expense) - BigInt(signed.expense)),
  );
});

test("at level 4 the commercial staff sign an empty slot's best offer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await found(page, 'sponsor-switch-ui');
  await chooseLevel(page, 2);
  await openBusiness(page, '후원');
  // 후원 ends with who signs sponsors at the current level, never a switch (→ECON-21, WEB-45).
  const delegation = page.getByRole('region', { name: '후원 위임' });
  const owner = delegation.getByTestId('decision-owner-sponsors');
  await expect(delegation.getByRole('checkbox')).toHaveCount(0);
  await expect(owner).toContainText('직접 결정');
  await expect(owner).toContainText('후원 계약은 직접 골라요');
  await expect(page.getByTestId('sponsor-local-stable')).toBeVisible();
  const delegated = await exportWorld(page);
  const best = sponsorOffers(delegated, 'local')
    .filter((offer) => offer.kind === 'stable')
    .reduce((top, offer) => (BigInt(offer.annual) > BigInt(top.annual) ? offer : top));
  // Applying sponsor delegation hands over the already pending empty slot immediately.
  await chooseLevel(page, 4);
  await expect(owner).toContainText('위임');
  await expect(owner).toContainText('안정형 제안 중 보장 금액이 가장 큰');
  const signed = await exportWorld(page);
  expect(signed.sponsors).toEqual([
    expect.objectContaining({
      slot: 'local',
      kind: 'stable',
      name: best.name,
      annual: best.annual,
    }),
  ]);
  await openBusiness(page, '후원');
  await expect(page.getByTestId('sponsor-contract-local')).toContainText(best.name);
  await expect(page.getByRole('button', { name: '지역 후원 계약', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('decision-owner-sponsors')).toContainText('위임');
});

test('drafts a 지역 investment row with its spend and builds 지역 기반 over real rounds', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await found(page, 'local-base-ui');
  await openBusiness(page);
  // 주변 투자 is a row of the 지역 area, whose header names 지역 기반 (→ECON-34, →WEB-60).
  const board = page.getByTestId('strategy-board');
  const local = board.getByRole('region', { name: '지역', exact: true });
  await expect(local.getByTestId('area-base-local')).toHaveText('지역 기반 0');
  await local.locator('button[aria-controls^="board-area-body-"]').click();
  await local.getByRole('radio', { name: '주변 투자 지역 상권 투자', exact: true }).click();
  const row = page.locator('[data-row="localInvest"]');
  await expect(row).toContainText('관중 수요 +4% · 지역 기반 목표 40 (지금 0)');
  await expect(row).toContainText('투자비 연');
  const draft = board.getByTestId('strategy-draft');
  await expect(draft).toContainText('주변 투자 없음 → 지역 상권 투자');
  await expect(draft).toContainText('라운드마다 +');
  await draft.getByRole('button', { name: '적용', exact: true }).click();
  await expect(draft).toHaveCount(0);
  const applied = await exportWorld(page);
  expect(applied.policy?.localInvest).toBe(3);
  expect(BigInt(operatingCosts(applied).investment)).toBeGreaterThan(0n);
  // The base grows each settled league round toward the target the row sets.
  for (let passed = 0; passed < 2;) {
    await playNext(page);
    passed = (await exportWorld(page)).round - applied.round;
  }
  const grown = await exportWorld(page);
  expect(grown.localBase).toBeGreaterThan(0);
  expect(grown.localBase).toBeLessThan(40);
  await openBusiness(page);
  await expect(page.getByTestId('area-base-local')).toHaveText(
    `지역 기반 ${Math.round(grown.localBase!)}`,
  );
});

test('keeps ticket drafts out of the save and applies their price to an actual home gate', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await found(page, 'ticket-draft-ui');
  const before = await exportWorld(page);
  const price = 0.12;
  const preview = ticketInvestmentPreview(before, price);
  const format = (value: string) => compactMoney(value, clubOf(before).country, before.year);
  await openBusiness(page);
  // The ticket price is a row of the 지역 area on the 방향 board, beside its card row.
  const board = page.getByTestId('strategy-board');
  const fans = board.getByRole('region', { name: '지역', exact: true });
  await fans.locator('button[aria-controls^="board-area-body-"]').click();
  const dial = fans.getByRole('radiogroup', { name: '티켓 가격', exact: true });
  const premium = dial.getByRole('radio', { name: '티켓 가격 프리미엄', exact: true });
  await expect(dial.getByRole('radio', { name: '티켓 가격 보통', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await premium.click();
  const ticket = page.locator('[data-row="ticket"]');
  await expect(ticket).toContainText(
    `홈 관중 ${number(preview.after.attendanceLow)}–${number(preview.after.attendanceHigh)}명`,
  );
  await expect(ticket).toContainText(
    `경기당 입장 수입 ${format(preview.after.incomeLow)}–${format(preview.after.incomeHigh)}`,
  );
  expect(preview.after.attendanceHigh).toBeLessThan(preview.before.attendanceHigh);
  // The pinned draft bar carries the gate projection; drafting writes nothing to the save.
  const draft = board.getByTestId('strategy-draft');
  await expect(draft).toContainText('티켓 가격 보통 → 프리미엄');
  await expect(draft).toContainText(
    `경기당 입장 수입 ${format(preview.after.incomeLow)}–${format(preview.after.incomeHigh)}`,
  );
  await expect(premium).toHaveAttribute('aria-checked', 'false');
  expect(await exportWorld(page)).toEqual(before);
  await draft.getByRole('button', { name: '적용', exact: true }).click();
  await expect(draft).toHaveCount(0);
  await expect(premium).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('action-outcome')).toContainText('티켓 가격을 바꿨어요');
  const applied = await exportWorld(page);
  expect(applied.ticket).toBe(price);
  expect(applied.cash).toBe(before.cash);
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  await fans.locator('button[aria-controls^="board-area-body-"]').click();
  await expect(premium).toHaveAttribute('aria-checked', 'true');
  await playNext(page);
  const settled = await exportWorld(page);
  const match = settled.ownMatches.at(-1)!;
  expect(match.home).toBe(settled.playerClub);
  const gate = settled.events.findLast((event) => event.kind === 'gate')!;
  const attendance = Number(gate.detail.match(/관중 (\d+)명/)?.[1]);
  expect(attendance).toBeGreaterThan(0);
  const perFan = gateProjection(settled, match.id).perFan;
  // League gates are sized for a 46-game season (the 30-game amateur league pays ×46/30).
  const factor = isLeagueMatch(match.kind) ? leagueMatchFactor(settled) : 1;
  expect(gate.amount).toBe(
    quote(clubOf(settled).country, settled.year, attendance * perFan * factor),
  );
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
    level: 'hard' as const,
  });
  operate(fixture, { type: 'ticket', price: 0.01 });
  // Real costs, not an edited balance, take the club below zero within a round or two.
  fixture.cash = '1';
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
  await openBusiness(page, '재정');
  const support = page.getByRole('button', { name: '추가 출자', exact: true });
  await expect(support).toBeEnabled();
  await support.click();
  await expect(
    page.getByRole('status').filter({ hasText: '추가 출자를 기록했어요.' }),
  ).toBeVisible();
  await page.getByText('운영을 이어갈 추가 출자', { exact: true }).click();
  await support.click();
  await expect(page.getByRole('region', { name: '클럽 재정' })).toContainText('이번 시즌 2/3회');
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

test('ends a bankrupt career on the game-over page and founds a new club from it', async ({
  page,
}) => {
  const fixture = createWorld({
    country: 'ENG',
    name: 'Bankrupt Fixture',
    color: '#bf7956',
    seed: 'business-bankruptcy',
    level: 'hard' as const,
  });
  // Debt deeper than half a season's fixed costs ends the career at the next settlement.
  fixture.cash = '-999999999';
  advanceRound(fixture, undefined, false);
  expect(fixture.bankrupt).toBeDefined();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '클럽 창단' })).toBeEnabled();
  await page
    .locator('input[type=file]')
    .last()
    .setInputFiles({
      name: 'synthetic-bankruptcy.json',
      mimeType: 'application/json',
      buffer: Buffer.from(await encode(fixture)),
    });
  const over = page.getByTestId('game-over');
  await expect(over).toContainText('Bankrupt Fixture 파산');
  await expect(over).toContainText('함께한 시즌');
  await expect(page.getByRole('region', { name: '시즌 진행', exact: true })).toHaveCount(0);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await over.getByRole('button', { name: '이 슬롯에서 새 게임', exact: true }).click();
  await expect(page.getByTestId('club-founding')).toContainText('슬롯 1 · 새 게임');
  await expect(page.getByRole('button', { name: '클럽 창단' })).toBeVisible();
});
