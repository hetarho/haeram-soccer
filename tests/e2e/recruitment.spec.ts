import { openPersonnel } from './personnel-navigation';
import { marketRows, marketFilters, marketInfo, marketCandidate, closeMarketPanel } from './market';
import {
  createWorld,
  makePlayer,
  joinClub,
  operate,
  advanceDays,
} from '../../packages/engine/src/index';
import { movePerson } from '../../packages/engine/src/npc-continuity';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { worldMarketPage } from '../../packages/engine/src/world-market';
import { DEFAULT_MARKET_QUERY, marketLeagueKey } from '../../apps/web/src/ui/worldMarket';
import { configureResponsibilities, acknowledgeEvents } from './events';
import { pendingDecisions } from '../../packages/engine/src/stopping';
import { finishSeason } from './season-progression';
import { chooseOption } from './select';
import { expect, test, type Page, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { decode } from '../../apps/web/src/adapters/persistence';
import { recruitmentPreview } from '../../packages/engine/src/recruitment';
import { transferOffers, operatingCost } from '../../packages/engine/src/operations';
import { clubOf, startingSquad } from '../../packages/engine/src/world';
import { currentDay, daysUntilNextMatch } from '../../packages/engine/src/calendar';
import { lineupSummary } from '../../packages/engine/src/strategy';
import { compactMoney, money } from '../../apps/web/src/ui/format';
import type { World, WorldMarketOffer } from '../../packages/contracts/src/types';
import { horizontalOverflow } from './layout';
import { chooseLevel, closeOutcome, setResponsibility } from './events';

async function exportWorld(page: Page): Promise<World> {
  await page.getByRole('button', { name: '설정', exact: true }).click();
  const menu = page.getByRole('dialog', { name: '설정' });
  const downloading = page.waitForEvent('download');
  await menu.getByRole('button', { name: '기록 내보내기', exact: true }).click();
  const download = await downloading;
  const raw = await readFile((await download.path())!, 'utf8');
  await menu.getByRole('button', { name: '창 닫기', exact: true }).click();
  return (await decode(raw)).world;
}

async function foundMarket(page: Page, seed: string, difficulty: '쉬움' | '어려움' = '쉬움') {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill(seed);
  await page.getByRole('button', { name: difficulty }).click();
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await openMarket(page);
  await configureResponsibilities(page, {
    mode: 'manual',
    observations: { matchEve: false, windowOpen: false },
  });
}

/** Contextual market entry retains the same global market as the owner recruitment desk. */
const marketTab = (page: Page) =>
  page
    .getByRole('tablist', { name: '감독 사무실' })
    .getByRole('tab', { name: '이적시장', exact: true });
async function openMarket(page: Page) {
  await openPersonnel(page, 'players');
  await marketTab(page).click();
  await expect(marketTab(page)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('region', { name: '선수 영입 데스크' })).toBeVisible();
}

/** Select a reproducible successful bid, using real commands on an isolated preparation copy.
 * No displayed row or array index is used as the submitted identity. */
function acceptedLoan(w: World): WorldMarketOffer {
  const offers = worldMarketPage(w, { world: w.id, sort: 'fee', direction: 'asc' }).items;
  for (const offer of offers.filter(
    (one) =>
      one.available &&
      !one.freeAgent &&
      !w.bids?.some(
        (bid) =>
          bid.playerId === one.player.id &&
          (bid.status === 'pending' || bid.status === 'countered'),
      ),
  )) {
    const copy = structuredClone(w);
    operate(copy, { type: 'recruit', target: offer.target, loan: true });
    for (let day = 0; day < 4; day++) advanceDays(copy, 1, undefined, false);
    if (
      copy.bids?.some(
        (bid) => bid.playerId === offer.player.id && bid.loan && bid.status === 'completed',
      )
    )
      return offer;
  }
  throw new Error('No deterministic accepted paid loan in this seeded page');
}

async function completeLoan(page: Page, before: World, offer: WorldMarketOffer, card: Locator) {
  await card.getByRole('button', { name: '1시즌 임대', exact: true }).click();
  await expect(card.getByTestId('pending-bid')).toContainText('협상 중');
  await closeMarketPanel(page, '영입 후보 상세');
  await closeOutcome(page, '이적 제안을 보냈어요');
  const pending = await exportWorld(page);
  const bid = pending.bids!.find((one) => one.playerId === offer.player.id && one.loan)!;
  expect(bid).toMatchObject({
    status: 'pending',
    playerId: offer.player.id,
    club: offer.source?.club,
  });
  expect(pending.players.some((one) => one.id === offer.player.id && one.status === 'active')).toBe(
    false,
  );
  expect(pending.cash).toBe(before.cash);
  const answered = await settlePaidLoans(page, [offer.player.id]);
  const completed = answered.bids!.find((one) => one.id === bid.id)!;
  expect(completed).toMatchObject({
    status: 'completed',
    playerId: offer.player.id,
    fee: offer.loanFee,
    loan: true,
    club: offer.source?.club,
  });
  expect(answered.players.find((one) => one.id === offer.player.id)).toMatchObject({
    status: 'active',
    wage: offer.player.wage,
    loanUntil: before.year + 1,
  });
  await page.getByRole('button', { name: /^이적 협상 ·/ }).click();
  const negotiations = page.getByRole('dialog', { name: '이적 협상', exact: true });
  await expect(
    negotiations.locator('[data-status="completed"]').filter({ hasText: offer.player.name }),
  ).toContainText('이적 완료');
  await closeMarketPanel(page, '이적 협상');
  return answered;
}

/** Let real dates answer pending bids; explicitly decline unrelated owner requests when needed. */
async function settlePaidLoans(page: Page, players: string[]) {
  const nav = page.getByRole('navigation', {
    name: (page.viewportSize()?.width ?? 1280) <= 760 ? '모바일 게임 메뉴' : '게임 메뉴',
    exact: true,
  });
  for (let event = 0; event < 10; event++) {
    const current = await exportWorld(page);
    const bids = players.map((id) => current.bids!.find((bid) => bid.playerId === id && bid.loan)!);
    if (bids.every((bid) => bid.status === 'completed')) {
      await openMarket(page);
      return current;
    }
    expect(bids.every((bid) => bid.status === 'completed' || bid.status === 'pending')).toBe(true);
    await nav.getByRole('button', { name: '클럽하우스', exact: true }).click();
    if (pendingDecisions(current).length) await acknowledgeEvents(page);
    else await page.getByRole('button', { name: '다음 이벤트', exact: true }).click();
  }
  throw new Error('Paid loans did not settle within ten actual stopping events');
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
])
  test(`compact market exposes rows before optional panels at ${viewport.width}`, async ({
    page,
  }) => {
    await foundMarket(page, `compact-market-${viewport.width}`);
    await page.setViewportSize(viewport);
    const rows = marketRows(page);
    await expect(rows).toHaveCount(DEFAULT_MARKET_QUERY.pageSize!);
    for (const row of (await rows.all()).slice(0, 4)) await expect(row).toBeInViewport();
    expect((await page.getByTestId('transfer-window').boundingBox())!.height).toBeLessThanOrEqual(
      34,
    );
    await expect(page.getByRole('region', { name: '감독 영입 요청' })).toHaveCount(0);
    await expect(page.getByRole('group', { name: '영입 포지션 선택' })).toHaveCount(0);
    expect(await horizontalOverflow(page)).toBe(0);
    const opener = rows.first().getByRole('button', { name: / 상세 보기$/ });
    await opener.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: '영입 후보 상세' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
    await rows.first().getByRole('cell').nth(1).click();
    await expect(page.getByRole('dialog', { name: '영입 후보 상세' })).toBeVisible();
    await closeMarketPanel(page, '영입 후보 상세');
    const info = await marketInfo(page);
    await expect(info.getByRole('region', { name: '감독 영입 요청' })).toBeVisible();
    await expect(info.getByRole('region', { name: '스카우트 명단' })).toBeVisible();
    await closeMarketPanel(page, '영입 정보');
    await rows.last().scrollIntoViewIfNeeded();
    await expect(rows.last()).toBeInViewport();
    expect(await horizontalOverflow(page)).toBe(0);
  });

test('pages the global market, filters and sorts all scopes, and approaches a non-recommended player by identity', async ({
  page,
  context,
}) => {
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  const world = createWorld({
    country: 'ENG',
    name: 'Synthetic Global Market',
    color: '#224433',
    seed: 'global-page-approach',
    level: 'easy',
  });
  world.cash = world.income = '999999999999';
  world.settings!.mode = 'manual';
  world.settings!.observations = { matchEve: false, windowOpen: false };
  await importResponsibilityCareer(page, world);
  await openMarket(page);
  const ids = () =>
    marketRows(page).evaluateAll((rows) =>
      rows.map((row) => row.getAttribute('data-candidate-id')!),
    );
  const expected = (patch = {}) =>
    worldMarketPage(world, { world: world.id, ...DEFAULT_MARKET_QUERY, ...patch });
  const first = expected();
  expect(first.total).toBeGreaterThan(first.pageSize);
  await expect.poll(ids).toEqual(first.items.map((row) => row.player.id));
  const pages = page.getByRole('navigation', { name: '영입 목록 페이지', exact: true });
  await expect(pages).toContainText(`총 ${first.total}명`);
  await pages.getByRole('button', { name: '다음 페이지', exact: true }).click();
  await expect.poll(ids).toEqual(expected({ page: 1 }).items.map((row) => row.player.id));
  await expect(pages).toContainText('2 /');
  const filters = await marketFilters(page);
  for (const sort of ['name', 'age', 'ovr', 'potential', 'fee', 'wage']) {
    await chooseOption(
      filters.getByRole('combobox', { name: '영입 후보 정렬', exact: true }),
      sort,
    );
    for (const direction of ['asc', 'desc']) {
      await chooseOption(
        filters.getByRole('combobox', { name: '영입 정렬 방향', exact: true }),
        direction,
      );
      await expect
        .poll(ids)
        .toEqual(expected({ sort, direction }).items.map((row) => row.player.id));
    }
  }
  await filters.getByRole('button', { name: '초기화', exact: true }).click();
  await filters.getByRole('button', { name: '스카우트 추천만', exact: true }).click();
  await expect
    .poll(ids)
    .toEqual(expected({ recommendedOnly: true }).items.map((row) => row.player.id));
  await filters.getByRole('button', { name: '스카우트 추천만', exact: true }).click();
  for (const country of ['ENG', 'ESP', 'GER', 'ITA', 'FRA', 'POR', 'NED', 'BEL']) {
    const team = world.clubs.find((club) => club.country === country && club.tier === 0)!;
    const league = { country, tier: team.tier, group: team.group };
    await chooseOption(
      filters.getByRole('combobox', { name: '영입 리그', exact: true }),
      marketLeagueKey(team),
    );
    await chooseOption(filters.getByRole('combobox', { name: '영입 구단', exact: true }), team.id);
    await expect
      .poll(ids)
      .toEqual(expected({ league, team: team.id }).items.map((row) => row.player.id));
  }
  await filters.getByRole('button', { name: '초기화', exact: true }).click();
  await chooseOption(filters.getByRole('combobox', { name: '영입 포지션', exact: true }), 'CM');
  await filters.getByRole('button', { name: '선발 보강 후보', exact: true }).click();
  await expect
    .poll(ids)
    .toEqual(expected({ position: 'CM', fit: 'improves' }).items.map((row) => row.player.id));
  await filters.getByRole('button', { name: '초기화', exact: true }).click();
  await closeMarketPanel(page, '영입 필터');
  const search = page.getByRole('searchbox', { name: '선수 이름 검색', exact: true });
  await search.fill('No such synthetic player 12345');
  await expect(marketRows(page)).toHaveCount(0);
  await expect(page.getByRole('table', { name: '영입 후보 목록' })).toContainText(
    '이 조건에 맞는 선수가 없어요',
  );
  await page.getByRole('button', { name: '필터 지우기', exact: true }).click();
  await expect.poll(ids).toEqual(first.items.map((row) => row.player.id));
  // A second tab can still inspect and filter while its writer protection disables commands.
  const readonly = await context.newPage();
  await readonly.goto('/first-team?view=market');
  await expect(readonly.getByText('읽기 전용', { exact: false }).first()).toBeVisible();
  const readCard = await marketCandidate(
    readonly,
    first.items[0].player.id,
    first.items[0].player.name,
  );
  await expect(
    readCard.getByRole('button', { name: /^(이적 제안|자유계약 영입|계약 완료)$/ }),
  ).toBeDisabled();
  await readonly.close();
  const target = expected({ page: 1 }).items.find(
    (row) => row.available && !row.recommended && row.source,
  )!;
  expect(target).toBeDefined();
  const card = await marketCandidate(page, target.player.id, target.player.name);
  await expect(card).toContainText('직접 발굴');
  await expect(card).toContainText(target.source!.name);
  await card.getByRole('button', { name: '이적 제안', exact: true }).click();
  const bid = page.getByRole('dialog', { name: '이적 제안', exact: true });
  await bid.getByRole('button', { name: /제안 보내기$/ }).click();
  await expect(bid).toHaveCount(0);
  await closeOutcome(page, '이적 제안을 보냈어요');
  const after = await exportWorld(page);
  expect(after.bids!.find((bid) => bid.playerId === target.player.id)).toMatchObject({
    club: target.source!.club,
    status: 'pending',
    fee: target.fee,
  });
  expect(after.cash).toBe(world.cash);
  expect(after.players).toEqual(world.players);
  expect(after.calendar).toEqual(world.calendar);
});

test('filters and compares stable candidates, discloses free wages, and saves real recruit and loan costs', async ({
  page,
}) => {
  test.slow();
  await foundMarket(page, 'recruitment-ui');
  const before = await exportWorld(page);
  const offers = transferOffers(before);
  const desk = page.getByRole('region', { name: '선수 영입 데스크' });
  const cards = marketRows(page);
  const filter = await marketFilters(page);
  const roles = filter.getByRole('group', { name: '영입 포지션 선택' });
  const ids = async () =>
    cards.evaluateAll((items) => items.map((item) => item.getAttribute('data-candidate-id')!));
  const expected = (patch = {}) =>
    worldMarketPage(before, { world: before.id, ...DEFAULT_MARKET_QUERY, ...patch }).items;
  await expect.poll(ids).toEqual(expected().map((offer) => offer.player.id));
  await roles.getByRole('button', { name: 'GK', exact: true }).click();
  await expect.poll(ids).toEqual(expected({ line: 'GK' }).map((offer) => offer.player.id));
  await chooseOption(
    filter.getByRole('combobox', { name: '영입 후보 정렬', exact: true }),
    'potential',
  );
  await expect
    .poll(ids)
    .toEqual(expected({ line: 'GK', sort: 'potential' }).map((offer) => offer.player.id));
  const sorted = (await ids()).slice(0, 2);
  await closeMarketPanel(page, '영입 필터');
  for (const id of sorted)
    await desk
      .getByTestId(`market-candidate-${id}`)
      .getByRole('button', { name: / 비교$/ })
      .click();
  await marketFilters(page);
  await roles.getByRole('button', { name: 'MF', exact: true }).click();
  await closeMarketPanel(page, '영입 필터');
  await desk.getByRole('button', { name: '선택한 2명 비교', exact: true }).click();
  const comparison = page.getByRole('dialog', { name: '영입 후보 비교' });
  expect(
    (
      await comparison
        .getByRole('article')
        .evaluateAll((items) => items.map((item) => item.getAttribute('data-candidate-id')!))
    ).sort(),
  ).toEqual([...sorted].sort());
  await expect(
    comparison.getByText('새 연봉 포함, 미래 수입 제외', { exact: false }).first(),
  ).toBeVisible();
  await comparison.getByRole('button', { name: '후보 비교 마치기', exact: true }).click();
  await marketFilters(page);
  await roles.getByRole('button', { name: '전체', exact: true }).click();
  await chooseOption(filter.getByRole('combobox', { name: '영입 후보 정렬', exact: true }), 'fee');
  await chooseOption(filter.getByRole('combobox', { name: '영입 정렬 방향', exact: true }), 'asc');
  await expect
    .poll(ids)
    .toEqual(expected({ sort: 'fee', direction: 'asc' }).map((offer) => offer.player.id));

  await closeMarketPanel(page, '영입 필터');
  const free = offers.find((offer) => BigInt(offer.fee) === 0n)!;
  const freeCard = await marketCandidate(page, free.player.id, free.player.name);
  expect(BigInt(free.player.wage)).toBeGreaterThan(0n);
  await expect(freeCard).toContainText('이적료 없음 · 연봉은 계속 지급해요');
  // The wage reads in the one notation (→WEB-67); the exact amount is the title and opens on tap.
  const country = clubOf(before).country;
  const wage = compactMoney(free.player.wage, country, before.year),
    exactWage = money(free.player.wage, country, before.year);
  await expect(freeCard).toContainText(wage);
  const disclosure = freeCard.locator(`button[title="${exactWage}"]`).first();
  await expect(disclosure).toHaveText(wage);
  await disclosure.click();
  await expect(disclosure).toHaveText(exactWage);
  await disclosure.click();
  await expect(disclosure).toHaveText(wage);
  const preview = recruitmentPreview(before, free);
  await expect(freeCard.getByLabel('영입 전력 변화')).toContainText(
    `${preview.beforeStrength} → ${preview.afterStrength}`,
  );
  await freeCard.getByRole('button', { name: '자유계약 영입', exact: true }).click();
  await expect(freeCard.getByRole('button', { name: '계약 완료', exact: true })).toBeDisabled();
  await closeMarketPanel(page, '영입 후보 상세');
  await closeOutcome(page, '선수를 영입했어요');
  await expect(await marketInfo(page)).toContainText('선수단 정원 21/40');
  await closeMarketPanel(page, '영입 정보');
  const recruited = await exportWorld(page);
  expect(recruited.cash).toBe(before.cash);
  expect(recruited.players.find((player) => player.id === free.player.id)?.wage).toBe(
    free.player.wage,
  );
  expect(BigInt(operatingCost(recruited)) - BigInt(operatingCost(before))).toBe(
    BigInt(free.player.wage),
  );
  expect(
    lineupSummary(startingSquad(recruited, clubOf(recruited)), recruited.tactic).strength,
  ).toBe(preview.afterStrength);

  const loan = acceptedLoan(recruited);
  const loanCard = await marketCandidate(page, loan.player.id, loan.player.name);
  const loanPreview = recruitmentPreview(recruited, loan, true);
  await completeLoan(page, recruited, loan, loanCard);
  await expect(await marketInfo(page)).toContainText('선수단 정원 22/40');
  await closeMarketPanel(page, '영입 정보');
  const borrowed = await exportWorld(page);
  // The calendar may settle ordinary income/costs while the bid is answered. The transfer's
  // retained fee and cash at submission/completion verify the actual loan cost separately.
  const completed = borrowed.bids!.find((bid) => bid.playerId === loan.player.id && bid.loan)!;
  expect(completed.status).toBe('completed');
  expect(completed.fee).toBe(loan.loanFee);
  const expectedBorrowed = structuredClone(recruited);
  operate(expectedBorrowed, { type: 'bid', target: loan.target, fee: loan.loanFee, loan: true });
  advanceDays(expectedBorrowed, currentDay(borrowed) - currentDay(recruited), undefined, false);
  expect(borrowed.cash).toBe(expectedBorrowed.cash);
  expect(
    borrowed.transfers!.facts.find(
      (fact) => fact.player === loan.player.id && fact.direction === 'in',
    ),
  ).toMatchObject({ player: loan.player.id, fee: loan.loanFee, loan: true });
  expect(loanPreview.cashAfter).toBe((BigInt(recruited.cash) - BigInt(loan.loanFee)).toString());
  expect(borrowed.players.find((player) => player.id === loan.player.id)?.loanUntil).toBe(
    before.year + 1,
  );
  expect(BigInt(operatingCost(borrowed)) - BigInt(operatingCost(recruited))).toBe(
    BigInt(loan.player.wage),
  );
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  await expect(marketTab(page)).toHaveAttribute('aria-selected', 'true');
  await marketCandidate(page, free.player.id, free.player.name);
  await expect(freeCard.getByRole('button', { name: '계약 완료', exact: true })).toBeDisabled();
  await closeMarketPanel(page, '영입 후보 상세');
  await marketCandidate(page, loan.player.id, loan.player.name);
  await expect(loanCard.getByRole('button', { name: '이적 제안', exact: true })).toHaveCount(0);
  await expect(loanCard.getByRole('button', { name: '1시즌 임대', exact: true })).toBeDisabled();
  await closeMarketPanel(page, '영입 후보 상세');
  const restored = await exportWorld(page);
  expect(restored.cash).toBe(borrowed.cash);
  expect(restored.revision).toBe(borrowed.revision);
  expect(restored.players).toEqual(borrowed.players);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await finishSeason(page);
  const returned = await exportWorld(page);
  expect(returned.players.find((one) => one.id === loan.player.id)?.status).toBe('sold');
  expect(
    returned.events.some(
      (event) => event.kind === 'loan-return' && event.title.includes(loan.player.name),
    ),
  ).toBe(true);
  if (loan.source) expect(returned.people![loan.player.id].club).toBe(loan.source.club);
});

test('reaches the forty-player ceiling with eight loans and prevents any further contract', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Marked synthetic 32-player career; all eight subsequent loans use real public commands.
  const setup = createWorld({
    country: 'ENG',
    name: 'Synthetic Capacity',
    color: '#224433',
    seed: 'recruitment-full-ui',
    level: 'easy',
  });
  while (setup.players.length < 32) {
    const player = makePlayer(
      'ENG',
      setup.seed,
      `capacity:bench:${setup.players.length}`,
      setup.year,
      20,
      'CM',
      20,
    );
    joinClub(player, 'domestic', setup.year);
    setup.players.push(player);
    movePerson(setup, player, setup.playerClub, true);
  }
  await importResponsibilityCareer(page, setup);
  await openMarket(page);
  await configureResponsibilities(page, {
    mode: 'manual',
    observations: { matchEve: false, windowOpen: false },
  });
  test.slow();
  const loans: WorldMarketOffer[] = [];
  const before = await exportWorld(page);
  let current = before;
  // Submit all eight within the same real window, then let the shared calendar answer them.
  // Each selected loan is independently accepted by this deterministic seeded preparation.
  for (let count = 0; count < 8; count++) {
    const offer = acceptedLoan(current);
    const card = await marketCandidate(page, offer.player.id, offer.player.name);
    await card.getByRole('button', { name: '1시즌 임대', exact: true }).click();
    await expect(card.getByTestId('pending-bid')).toContainText('협상 중');
    await closeMarketPanel(page, '영입 후보 상세');
    await closeOutcome(page, '이적 제안을 보냈어요');
    current = await exportWorld(page);
    expect(current.cash).toBe(before.cash);
    expect(current.players).toEqual(before.players);
    loans.push(offer);
  }
  expect(loans.reduce((total, offer) => total + BigInt(offer.loanFee), 0n)).toBeLessThan(
    BigInt(before.cash),
  );
  current = await settlePaidLoans(
    page,
    loans.map((offer) => offer.player.id),
  );
  await expect(await marketInfo(page)).toContainText('선수단 정원 40/40 · 자리가 가득 찼어요.');
  await closeMarketPanel(page, '영입 정보');
  const free = transferOffers(current).find((offer) => offer.freeAgent && offer.available)!;
  const blocked = await marketCandidate(page, free.player.id, free.player.name);
  await expect(blocked.getByRole('button', { name: '자유계약 영입', exact: true })).toBeDisabled();
  await expect(blocked.getByRole('button', { name: '1시즌 임대', exact: true })).toBeDisabled();
  await closeMarketPanel(page, '영입 후보 상세');
  const full = await exportWorld(page);
  expect(full.players.filter((player) => player.status === 'active')).toHaveLength(40);
  const expectedFull = structuredClone(before);
  for (const offer of loans)
    operate(expectedFull, { type: 'bid', target: offer.target, fee: offer.loanFee, loan: true });
  advanceDays(expectedFull, currentDay(full) - currentDay(before), undefined, false);
  expect(full.cash).toBe(expectedFull.cash);
  for (const offer of loans) {
    expect(full.players.find((player) => player.id === offer.player.id)?.loanUntil).toBe(
      setup.year + 1,
    );
    expect(full.bids!.find((bid) => bid.playerId === offer.player.id)).toMatchObject({
      status: 'completed',
      fee: offer.loanFee,
      loan: true,
    });
  }
});

test('disables an unaffordable fee while keeping a cheaper loan available with honest ongoing costs', async ({
  page,
}) => {
  await foundMarket(page, 'recruitment-poor-ui', '어려움');
  const before = await exportWorld(page);
  const offer = transferOffers(before).find(
    (candidate) =>
      !recruitmentPreview(before, candidate).affordable &&
      recruitmentPreview(before, candidate, true).affordable,
  )!;
  expect(offer).toBeDefined();
  const card = await marketCandidate(page, offer.player.id, offer.player.name);
  await expect(card).toContainText('보유 자금이 부족합니다.');
  await expect(card.getByRole('button', { name: '1시즌 임대', exact: true })).toBeEnabled();
  await expect(card).toContainText('새 연봉 포함, 미래 수입 제외');
  // Fee moves are offers now: the owner can open one, but cannot send a fee the club cannot pay.
  await card.getByRole('button', { name: '이적 제안', exact: true }).click();
  const bid = page.getByRole('dialog', { name: '이적 제안' });
  const fees = bid.getByRole('radiogroup', { name: '제안 이적료' });
  const send = bid.getByRole('button', { name: /제안 보내기$/ });
  await expect(fees.getByRole('radio', { name: /^100%/ })).toHaveAttribute('aria-checked', 'true');
  // A step and the send button read in the notation with the exact fee as the title (→WEB-67).
  const country = clubOf(before).country,
    exactFee = money(offer.fee, country, before.year),
    askedStep = fees.getByRole('radio', { name: /^100%/ }).locator('[data-money]');
  await expect(askedStep).toHaveText(compactMoney(offer.fee, country, before.year));
  await expect(askedStep).toHaveAttribute('title', exactFee);
  await expect(send.locator('[data-money]')).toHaveAttribute('title', exactFee);
  expect(BigInt(offer.fee)).toBeGreaterThan(BigInt(before.cash));
  await expect(send).toBeDisabled();
  await expect(bid).toContainText('자금이 부족해요.');
  await fees.getByRole('radio', { name: /^130%/ }).click();
  await expect(send).toBeDisabled();
  await bid.getByRole('button', { name: '취소', exact: true }).click();
  await expect(bid).toHaveCount(0);
  expect(await exportWorld(page)).toEqual(before);
});

test('keeps the clock running while comparing candidates away from home until the owner stops it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill('recruitment-dialog-clock');
  await page.getByRole('button', { name: '쉬움' }).click();
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  // This journey exercises an uninterrupted clock, independently of browser speed.
  await chooseLevel(page, 4);
  await setResponsibility(page, '선수 영입', 'direct');
  const before = await exportWorld(page);
  // The clock runs for a few days below; it must not reach the first match day.
  expect(daysUntilNextMatch(before)).toBeGreaterThan(4);
  const date = page.getByTestId('game-date');
  await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
  await expect(date).toHaveText('1950년 8월 2일');
  // The reserved transport remains available and keeps running away from home.
  await openMarket(page);
  const mini = page.getByRole('region', { name: '시즌 진행', exact: true });
  await expect(mini.getByRole('button', { name: '자동 진행 정지', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '시즌 진행', exact: true })).toHaveCount(1);
  const desk = page.getByRole('region', { name: '선수 영입 데스크' });
  const filter = await marketFilters(page);
  await filter
    .getByRole('group', { name: '영입 포지션 선택' })
    .getByRole('button', { name: 'GK', exact: true })
    .click();
  await closeMarketPanel(page, '영입 필터');
  await expect(marketRows(page).first()).toBeVisible();
  await marketRows(page)
    .first()
    .getByRole('button', { name: / 상세 보기$/ })
    .click();
  const runningCandidate = page.getByRole('dialog', { name: '영입 후보 상세', exact: true });
  await expect(
    runningCandidate.getByRole('button', { name: /^(이적 제안|자유계약 영입)$/ }),
  ).toBeDisabled();
  await expect(
    runningCandidate.getByRole('button', { name: '1시즌 임대', exact: true }),
  ).toBeDisabled();
  await closeMarketPanel(page, '영입 후보 상세');
  for (const row of (await marketRows(page).all()).slice(0, 2))
    await row.getByRole('button', { name: / 비교$/ }).click();
  await desk.getByRole('button', { name: '선택한 2명 비교', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '영입 후보 비교' });
  await expect(dialog).toBeVisible();
  const comparing = await date.innerText();
  // Dialogs never pause it either.
  await expect(date).not.toHaveText(comparing);
  await dialog.getByRole('button', { name: '후보 비교 마치기', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  // Only the owner's stop holds the date, once the days computed ahead are shown (→WEB-18): play
  // is offered again when the last of them is.
  await mini.getByRole('button', { name: '자동 진행 정지', exact: true }).click();
  await expect(mini.getByRole('button', { name: '자동 진행 시작', exact: true })).toBeEnabled();
  const stopped = await date.innerText();
  await page.waitForTimeout(1200);
  await expect(date).toHaveText(stopped);
  const after = await exportWorld(page);
  expect(currentDay(after)).toBeGreaterThan(currentDay(before));
  // Staff may sell while time runs, but comparison never recruits a new player.
  expect(after.players.every((player) => before.players.some((old) => old.id === player.id))).toBe(
    true,
  );
});

test('the market ends with who answers offers and names the recruitment level, opening the board', async ({
  page,
}) => {
  await foundMarket(page, 'offer-switch-journey');
  await marketInfo(page);
  // Who answers is the intervention level's alone: no switch of its own (→WEB-45, CLUB-18).
  const offers = page.getByRole('region', { name: '이적 제안 위임' });
  const owner = offers.getByTestId('decision-owner-sales');
  await expect(offers.getByRole('checkbox')).toHaveCount(0);
  await expect(owner).toContainText('직접');

  // The sale bar the staff apply shows at every level.
  await expect(offers).toContainText('130%');
  await expect(offers).toContainText('80% 밑으로는 내리지 않아요');
  await closeMarketPanel(page, '영입 정보');
  await chooseLevel(page, 4);
  await marketInfo(page);
  await expect(owner).toContainText('자동');

  // The local ownership link opens the office's shared explicit-apply screen, 결재라인 모아보기.
  await owner.getByRole('button', { name: /결재라인 모아보기$/ }).click();
  const office = page.getByTestId('owner-office');
  for (const name of ['선수 매각', '선수 영입'])
    await expect(
      office
        .getByRole('group', { name, exact: true })
        .getByRole('button', { name: '자동', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/first-team\?view=market$/);
  expect(await horizontalOverflow(page)).toBe(0);
  // The recruitment level is a line that opens its home on the 방향 board (→WEB-71).
  await page.getByRole('button', { name: /^영입 기조 · 균형/ }).click();
  await expect(page.getByRole('dialog', { name: '영입 업무 기준', exact: true })).toBeVisible();
  await expect(
    page
      .getByRole('dialog', { name: '영입 업무 기준', exact: true })
      .getByRole('radio', { name: '영입 기조 균형', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(page).toHaveURL(/\/first-team\?view=market$/);
});
