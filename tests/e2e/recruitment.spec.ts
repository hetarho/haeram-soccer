import { marketRows, marketFilters, marketInfo, marketCandidate, closeMarketPanel } from './market';
import { createWorld, makePlayer, joinClub } from '../../packages/engine/src/index';
import { movePerson } from '../../packages/engine/src/npc-continuity';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { lineOf } from '../../packages/engine/src/player';
import { chooseOption } from './select';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { decode } from '../../apps/web/src/adapters/persistence';
import { recruitmentPreview } from '../../packages/engine/src/recruitment';
import { transferOffers, operatingCost } from '../../packages/engine/src/operations';
import { clubOf, startingSquad } from '../../packages/engine/src/world';
import { currentDay, daysUntilNextMatch } from '../../packages/engine/src/calendar';
import { lineupSummary } from '../../packages/engine/src/strategy';
import { compactMoney, money } from '../../apps/web/src/ui/format';
import type { World } from '../../packages/contracts/src/types';
import { horizontalOverflow } from './layout';
import { chooseLevel, setResponsibility } from './events';

async function exportWorld(page: Page): Promise<World> {
  await page.getByRole('button', { name: '전체 메뉴', exact: true }).click();
  const menu = page.getByRole('dialog', { name: '전체 메뉴' });
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
}

/** The market is 사람's second tab. */
const marketTab = (page: Page) =>
  page
    .getByRole('tablist', { name: '선수단·스태프 보기' })
    .getByRole('tab', { name: '이적시장', exact: true });
async function openMarket(page: Page) {
  await page
    .getByRole('navigation', { name: '모바일 게임 메뉴' })
    .getByRole('button', { name: '선수단·스태프', exact: true })
    .click();
  await marketTab(page).click();
  await expect(marketTab(page)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('region', { name: '선수 영입 데스크' })).toBeVisible();
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
    await expect(rows).toHaveCount(8);
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

test('filters and compares stable candidates, discloses free wages, and saves real recruit and loan costs', async ({
  page,
}) => {
  await foundMarket(page, 'recruitment-ui');
  const before = await exportWorld(page);
  const offers = transferOffers(before);
  const desk = page.getByRole('region', { name: '선수 영입 데스크' });
  const cards = marketRows(page);
  const filter = await marketFilters(page);
  const roles = filter.getByRole('group', { name: '영입 포지션 선택' });
  const ids = async () =>
    cards.evaluateAll((items) => items.map((item) => item.getAttribute('data-candidate-id')!));
  await expect(cards).toHaveCount(8);
  expect((await ids()).sort()).toEqual(offers.map((offer) => offer.player.id).sort());
  await roles.getByRole('button', { name: 'GK', exact: true }).click();
  await expect(cards).toHaveCount(2);
  expect((await ids()).sort()).toEqual(
    offers
      .filter((offer) => offer.player.position === 'GK')
      .map((offer) => offer.player.id)
      .sort(),
  );
  await chooseOption(
    filter.getByRole('combobox', { name: '영입 후보 정렬', exact: true }),
    'potential',
  );
  const sorted = await ids();
  const ratings = sorted.map(
    (id) => offers.find((offer) => offer.player.id === id)!.player.potential,
  );
  expect(ratings[0]).toBeGreaterThanOrEqual(ratings[1]);
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
  expect(await ids()).toEqual(
    [...offers]
      .sort((a, b) =>
        BigInt(a.fee) < BigInt(b.fee)
          ? -1
          : BigInt(a.fee) > BigInt(b.fee)
            ? 1
            : a.player.id.localeCompare(b.player.id),
      )
      .map((offer) => offer.player.id),
  );

  await closeMarketPanel(page, '영입 필터');
  const free = offers.find((offer) => BigInt(offer.fee) === 0n)!;
  const freeCard = await marketCandidate(page, free.player.id);
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

  const loan = offers.find((offer) => lineOf(offer.player.position) === 'DF')!;
  const loanCard = await marketCandidate(page, loan.player.id);
  const loanPreview = recruitmentPreview(recruited, loan, true);
  await loanCard.getByRole('button', { name: '1시즌 임대', exact: true }).click();
  await expect(loanCard.getByRole('button', { name: '계약 완료', exact: true })).toBeDisabled();
  await closeMarketPanel(page, '영입 후보 상세');
  await expect(await marketInfo(page)).toContainText('선수단 정원 22/40');
  await closeMarketPanel(page, '영입 정보');
  const borrowed = await exportWorld(page);
  expect(BigInt(borrowed.cash)).toBe(BigInt(recruited.cash) - BigInt(loan.loanFee));
  expect(borrowed.cash).toBe(loanPreview.cashAfter);
  expect(borrowed.players.find((player) => player.id === loan.player.id)?.loanUntil).toBe(
    before.year + 1,
  );
  expect(BigInt(operatingCost(borrowed)) - BigInt(operatingCost(recruited))).toBe(
    BigInt(loan.player.wage),
  );
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  await expect(marketTab(page)).toHaveAttribute('aria-selected', 'true');
  await marketCandidate(page, free.player.id);
  await expect(freeCard.getByRole('button', { name: '계약 완료', exact: true })).toBeDisabled();
  await closeMarketPanel(page, '영입 후보 상세');
  await marketCandidate(page, loan.player.id);
  await expect(loanCard.getByRole('button', { name: '1시즌 임대', exact: true })).toBeDisabled();
  await closeMarketPanel(page, '영입 후보 상세');
  const restored = await exportWorld(page);
  expect(restored.cash).toBe(borrowed.cash);
  expect(restored.revision).toBe(borrowed.revision);
  expect(restored.players).toEqual(borrowed.players);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
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
  const before = await exportWorld(page);
  const offers = transferOffers(before);
  const totalFees = offers.reduce((sum, offer) => sum + BigInt(offer.loanFee), 0n);
  expect(BigInt(before.cash)).toBeGreaterThan(totalFees);
  for (const offer of offers) {
    const card = await marketCandidate(page, offer.player.id);
    await card.getByRole('button', { name: '1시즌 임대', exact: true }).click();
    await expect(card.getByRole('button', { name: '계약 완료', exact: true })).toBeDisabled();
    await expect(card.getByRole('button', { name: '1시즌 임대', exact: true })).toBeDisabled();
    await closeMarketPanel(page, '영입 후보 상세');
  }
  await expect(await marketInfo(page)).toContainText('선수단 정원 40/40 · 자리가 가득 찼어요.');
  await closeMarketPanel(page, '영입 정보');
  await expect(marketRows(page).filter({ hasText: '계약 완료' })).toHaveCount(8);
  const full = await exportWorld(page);
  expect(full.players.filter((player) => player.status === 'active')).toHaveLength(40);
  expect(BigInt(full.cash)).toBe(BigInt(before.cash) - totalFees);
  for (const offer of offers)
    expect(full.players.find((player) => player.id === offer.player.id)?.loanUntil).toBe(
      before.year + 1,
    );
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
  const card = await marketCandidate(page, offer.player.id);
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
  // Away from home the clock collapses to its buttons and keeps running.
  await openMarket(page);
  const mini = page.getByTestId('mini-clock');
  await expect(mini.getByRole('button', { name: '자동 진행 정지', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '시즌 진행', exact: true })).toHaveCount(0);
  const desk = page.getByRole('region', { name: '선수 영입 데스크' });
  const filter = await marketFilters(page);
  await filter
    .getByRole('group', { name: '영입 포지션 선택' })
    .getByRole('button', { name: 'GK', exact: true })
    .click();
  await closeMarketPanel(page, '영입 필터');
  for (const row of await marketRows(page).all())
    await row.getByRole('button', { name: / 비교$/ }).click();
  await desk.getByRole('button', { name: '선택한 2명 비교', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '영입 후보 비교' });
  await expect(dialog).toBeVisible();
  const comparing = await date.innerText();
  // Dialogs never pause it either.
  await expect(date).not.toHaveText(comparing);
  await dialog.getByRole('button', { name: '후보 비교 마치기', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  // Only the owner's stop holds the date.
  await mini.getByRole('button', { name: '자동 진행 정지', exact: true }).click();
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
  await expect(owner).toContainText('직접 결정');

  // The sale bar the staff apply shows at every level.
  await expect(offers).toContainText('130%');
  await expect(offers).toContainText('80% 밑으로는 내리지 않아요');
  await closeMarketPanel(page, '영입 정보');
  await chooseLevel(page, 4);
  await marketInfo(page);
  await expect(owner).toContainText('위임');

  // The local ownership link opens the shared explicit-apply screen.
  await owner.getByRole('button', { name: /위임·진행 설정 열기$/ }).click();
  const dialog = page.getByRole('dialog', { name: '위임·진행 설정', exact: true });
  await expect(dialog.getByRole('combobox', { name: '선수 매각', exact: true })).toHaveAttribute(
    'data-value',
    'delegated',
  );
  await expect(dialog.getByRole('combobox', { name: '선수 영입', exact: true })).toHaveAttribute(
    'data-value',
    'delegated',
  );
  await dialog.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await horizontalOverflow(page)).toBe(0);
  // The recruitment level is a line that opens its home on the 방향 board (→WEB-71).
  await page.getByRole('button', { name: /^영입 기조 · 균형/ }).click();
  await expect(page.getByRole('dialog', { name: '영입 운영 방침', exact: true })).toBeVisible();
  await expect(
    page
      .getByRole('dialog', { name: '영입 운영 방침', exact: true })
      .getByRole('radio', { name: '영입 기조 균형', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(page).toHaveURL(/\/people\?view=market$/);
});
