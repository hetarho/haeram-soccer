import { watchNext } from './watch';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { decode, encode } from '../../apps/web/src/adapters/persistence';
import { createWorld, advanceRound } from '../../packages/engine/src/index';
import { startWork } from '../../packages/engine/src/testing';
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
import type { World } from '../../packages/contracts/src/types';
import { horizontalOverflow } from './layout';
import { acknowledgeEvents, chooseLevel } from './events';
import { startCareer, startFlow } from './start';
import { clubhouseTab } from './competition-navigation';
import {
  aroundOffice,
  clubSections,
  enterOffice,
  LOBBY,
  officeBar,
  officeTitle,
  openDirectionInForce,
  openOfficeArea,
  operationsTabs,
  outsideOffice,
} from './office';

/** The export lives in the settings menu, outside the office: step out and back (→WEB-39). */
const exportWorld = (page: Page): Promise<World> =>
  aroundOffice(page, async () => {
    await page.getByRole('button', { name: '설정', exact: true }).click();
    const menu = page.getByRole('dialog', { name: '설정' });
    const downloading = page.waitForEvent('download');
    await menu.getByRole('button', { name: '기록 내보내기', exact: true }).click();
    const file = await downloading;
    const raw = await readFile((await file.path())!, 'utf8');
    await menu.getByRole('button', { name: '창 닫기', exact: true }).click();
    return (await decode(raw)).world;
  });

/** Takes the seed's first club over, with `preset` as its direction when named (→WEB-15). */
async function found(page: Page, seed: string, preset?: string) {
  await page.goto('/');
  await startCareer(page, { seed, preset });
}

/** The owner office's area `area`, the direction in force unless named (→WEB-39, WEB-110). */
const openBusiness = (page: Page, area?: string) =>
  area ? openOfficeArea(page, area) : openDirectionInForce(page);

async function playNext(page: Page) {
  await outsideOffice(page);
  await clubhouseTab(page).click();
  // A match can leave an owner-held decision (a mediation after an injury) before the next one.
  await acknowledgeEvents(page);
  // Read each settled round before progressing again: a running clock can open the next eve
  // over the investment controls while their export/navigation is in flight (CI Firefox).
  await watchNext(page, { manual: true });
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  await expect(page.getByText(/90(\+\d+)?′ ·.*경기 종료/)).toBeVisible();
}

test('older operations addresses open their 구단 운영 section', async ({ page }) => {
  // Takes a club over, then reloads the app cold for each of eight addresses; slow CI browsers need longer.
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  await found(page, 'direction-addresses');
  await enterOffice(page);
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  // The office opens on its lobby and keeps no ?view= there (→WEB-39), as its section bar's
  // 사무실 (→WEB-10); there is no 캠페인 area.
  const office = clubSections(page).getByRole('tab', { name: '사무실', exact: true });
  await expect(officeTitle(page)).toHaveText(LOBBY);
  await expect(page).toHaveURL(/\/direction$/);
  await expect(office).toHaveAttribute('aria-selected', 'true');
  await page.goto('/business');
  await expect(officeTitle(page)).toHaveText(LOBBY);
  await expect(page).toHaveURL(/\/direction$/);
  await expect(office).toHaveAttribute('aria-selected', 'true');
  // Every older unselected money or sponsor address opens its 구단 운영 section (→WEB-110).
  for (const [asked, area, now] of [
    ['/business?view=facility', '재정·투자', /\/club-operations\?view=investment$/],
    ['/business?view=marketing', '재정·투자', /\/club-operations\?view=investment$/],
    ['/business?view=strategy', '재정·투자', /\/club-operations\?view=investment$/],
    ['/business?view=build', '재정·투자', /\/club-operations\?view=investment$/],
    ['/business?view=finance', '재정·투자', /\/club-operations\?view=investment$/],
    ['/business?view=sponsor', '후원', /\/club-operations\?view=sponsor$/],
    ['/direction?view=build', '재정·투자', /\/club-operations\?view=investment$/],
    ['/direction?view=identity', '구단 디자인', /\/club-operations\?view=identity$/],
  ] as const) {
    await page.goto(asked);
    await expect(
      operationsTabs(page).getByRole('tab', { name: area, exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      clubSections(page).getByRole('tab', { name: '운영', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(now);
    await expect(officeBar(page)).toHaveCount(0);
  }
  await expect(page.getByRole('region', { name: '캠페인', exact: true })).toHaveCount(0);
  // Campaigns are no more (→ECON-7): 자금 shows none to start.
  await openBusiness(page, '투자');
  await expect(page.getByRole('region', { name: '클럽 재정', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '캠페인', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '캠페인 시작' })).toHaveCount(0);
});

/** Loads a career built in Node through the slot import, as a saved game opens. */
async function importCareer(page: Page, w: World, name: string) {
  await page.goto('/');
  await expect(startFlow(page)).toBeVisible();
  await page
    .locator('input[type=file]')
    .last()
    .setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(await encode(w)) });
  await expect(page.getByTestId('club-hub')).toBeVisible();
  // The imported career carries unread attention events.
  await acknowledgeEvents(page);
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
]) {
  test(`reads each facility's stage and a work under way at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    // A career saved with a stand being added: no one starts a work now, but this one finishes on
    // its day (→ECON-32).
    const fixture = createWorld({
      country: 'ENG',
      name: 'Facility Fixture',
      color: '#335577',
      seed: `facility-ui-${viewport.width}`,
      level: 'easy' as const,
    });
    fixture.cash = '100000000';
    startWork(fixture, 'stadium');
    await importCareer(page, fixture, 'facility-under-way.json');
    await openBusiness(page, '투자');
    // Three parts read separately with their art (→WEB-14): the stadium's ladder, the training
    // ground and the academy facilities.
    await expect(page.getByTestId('facility-stadium')).toContainText('동네 구장');
    await expect(page.getByTestId('stadium-step-0')).toHaveAttribute('data-state', 'current');
    await expect(page.getByTestId('stadium-step-1')).toHaveAttribute('data-state', 'building');
    await expect(page.getByTestId('facility-work-stadium')).toContainText('완공까지 180일');
    await expect(page.getByTestId('facility-training')).toContainText('0/5단계');
    await expect(page.getByTestId('facility-academy')).toContainText('0/5단계');
    for (const part of ['stadium', 'training', 'academy'])
      await expect(page.getByTestId(`facility-${part}`).locator('[data-facility-art]')).toHaveCount(
        1,
      );
    // Nothing here builds: no review, no start (→WEB-14).
    await expect(page.getByRole('button', { name: /공사 (검토|시작)/ })).toHaveCount(0);
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
  // A 1930 club in England has only the local slot open (→ECON-8).
  const offer = sponsorOffers(before, 'local').find((candidate) => candidate.kind === 'stable')!;
  await openBusiness(page, '후원');
  await expect(page.locator('[data-operations-view="sponsor"]')).toContainText(
    '계약 이후 경기만 지급하며',
  );
  await expect(page.getByTestId('sponsor-slot-shirt')).toContainText('1979/80 시즌부터');
  // The section mounts whole: its 결재 담당 never arrives later above the offers and moves them
  // away from the tap (Firefox CI 41250503124 signed nothing that way).
  expect(await page.getByTestId('desk-responsibilities').count()).toBe(1);
  await page
    .getByTestId('sponsor-local-stable')
    .getByRole('button', { name: '지역 후원 계약', exact: true })
    .click();
  await expect(page.getByRole('button', { name: '지역 후원 계약', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('sponsor-slot-local')).toHaveAttribute('data-slot-state', 'signed');
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
  await expect(owner).toContainText('직접');
  await expect(owner).toContainText('후원 계약은 직접 골라요');
  await expect(page.getByTestId('sponsor-local-stable')).toBeVisible();
  const delegated = await exportWorld(page);
  const best = sponsorOffers(delegated, 'local')
    .filter((offer) => offer.kind === 'stable')
    .reduce((top, offer) => (BigInt(offer.annual) > BigInt(top.annual) ? offer : top));
  // Applying sponsor delegation hands over the already pending empty slot immediately.
  await chooseLevel(page, 4);
  await expect(owner).toContainText('자동');
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
  await expect(page.getByTestId('decision-owner-sponsors')).toContainText('자동');
});

test('builds 지역 기반 over real rounds from the 지역 investment taken over with', async ({
  page,
}) => {
  // Takes a club over and plays real rounds through the owner's event cards; slow CI browsers need longer.
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  // 유스 순혈주의 sets 주변 투자 at 지역 상권 투자 (→ECON-22); no control changes it later.
  await found(page, 'local-base-ui', 'local-pride');
  await openBusiness(page);
  // 주변 투자 is a row of the 지역 area, read beside the 지역 기반 it builds (→ECON-34, WEB-14).
  const local = page
    .getByTestId('direction-areas')
    .getByRole('region', { name: '지역', exact: true });
  await expect(local).toContainText('지역 기반 0');
  await expect(local.locator('[data-row="localInvest"]')).toContainText('지역 상권 투자');
  await expect(local.getByRole('radio')).toHaveCount(0);
  const founded = await exportWorld(page);
  expect(founded.policy?.localInvest).toBe(3);
  expect(BigInt(operatingCosts(founded).investment)).toBeGreaterThan(0n);
  // The base grows each settled league round toward the target the row sets.
  for (let passed = 0; passed < 2;) {
    await playNext(page);
    passed = (await exportWorld(page)).round - founded.round;
  }
  const grown = await exportWorld(page);
  expect(grown.localBase).toBeGreaterThan(0);
  expect(grown.localBase).toBeLessThan(40);
  expect(grown.policy).toEqual(founded.policy);
  await openBusiness(page);
  await expect(local).toContainText(`지역 기반 ${Math.round(grown.localBase!)}`);
});

test('reads the ticket price taken over with and charges it at an actual home gate', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // 상업 제국 sets the ticket at 비싸게 (→ECON-17); no control changes it later (→WEB-14).
  // The seed's club opens its league at home.
  await found(page, 'ticket-draft-ui', 'commercial');
  const before = await exportWorld(page);
  expect(before.ticket).toBe(0.08);
  await openBusiness(page);
  const ticket = page.getByTestId('direction-areas').locator('[data-row="ticket"]');
  await expect(ticket).toContainText('티켓 가격');
  await expect(ticket).toContainText('비싸게');
  await expect(page.getByRole('radiogroup', { name: '티켓 가격' })).toHaveCount(0);
  await playNext(page);
  const settled = await exportWorld(page);
  expect(settled.ticket).toBe(0.08);
  const match = settled.ownMatches.at(-1)!;
  expect(match.home).toBe(settled.playerClub);
  const gate = settled.events.findLast((event) => event.kind === 'gate')!;
  const attendance = Number(gate.detail.match(/관중 (\d+)명/)?.[1]);
  expect(attendance).toBeGreaterThan(0);
  const perFan = gateProjection(settled, match.id).perFan;
  // League gates are sized for a 46-game season (→ECON-19).
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

test('reads a genuine negative operating balance with no owner capital to add', async ({
  page,
}) => {
  const fixture = createWorld({
    country: 'ENG',
    name: 'Budget Fixture',
    color: '#bf7956',
    seed: 'business-budget-recovery',
    level: 'hard' as const,
  });
  // A price off the presets, as an older save keeps it (→ECON-17).
  fixture.ticket = 0.01;
  // Real costs, not an edited balance, take the club below zero within a round or two.
  fixture.cash = '1';
  for (let i = 0; i < 46 && BigInt(fixture.cash) >= 0n; i++)
    advanceRound(fixture, undefined, false);
  expect(BigInt(fixture.cash)).toBeLessThan(0n);
  await page.setViewportSize({ width: 390, height: 844 });
  await importCareer(page, fixture, 'synthetic-operating-loss.json');
  await openBusiness(page, '투자');
  await expect(page.getByRole('region', { name: '클럽 재정' })).toBeVisible();
  // The owner adds no capital (→ECON-11): the debt reads, and only the club's income clears it.
  await expect(page.getByRole('button', { name: /출자/ })).toHaveCount(0);
  await expect(page.getByText(/추가 출자/)).toHaveCount(0);
  await page.getByRole('button', { name: '수입·지출 장부', exact: true }).click();
  const ledger = page.getByRole('region', { name: '수입과 지출 장부' });
  await expect(ledger).toContainText('시즌 수지');
  await expect(ledger).toContainText('보유 현금');
  await expect(ledger).toContainText('자동으로 자금이 보충되지 않습니다.');
  await page.getByRole('button', { name: '장부 확인 마치기', exact: true }).click();
  expect(BigInt((await exportWorld(page)).cash)).toBe(BigInt(fixture.cash));
});

test('ends a bankrupt career on the game-over page and starts a new game from it', async ({
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
  await expect(startFlow(page)).toBeVisible();
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
  await expect(startFlow(page)).toContainText('슬롯 1 · 새 게임');
  await expect(startFlow(page).getByTestId('start-tiers')).toBeVisible();
});
