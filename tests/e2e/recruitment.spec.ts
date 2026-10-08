import { chooseOption } from './select';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { decode } from '../../apps/web/src/adapters/persistence';
import { recruitmentPreview } from '../../packages/engine/src/recruitment';
import { transferOffers, operatingCost } from '../../packages/engine/src/operations';
import { clubOf, startingSquad } from '../../packages/engine/src/world';
import { lineupSummary } from '../../packages/engine/src/strategy';
import { money } from '../../apps/web/src/ui/format';
import type { World } from '../../packages/contracts/src/types';

async function exportWorld(page: Page): Promise<World> {
  await page
    .getByRole('navigation', { name: '모바일 게임 메뉴' })
    .getByRole('button', { name: '더보기', exact: true })
    .click();
  const menu = page.getByRole('dialog', { name: '전체 메뉴' });
  const downloading = page.waitForEvent('download');
  await menu.getByRole('button', { name: '기록 내보내기', exact: true }).click();
  const download = await downloading;
  const raw = await readFile((await download.path())!, 'utf8');
  await menu.getByRole('button', { name: '창 닫기', exact: true }).click();
  return (await decode(raw)).world;
}

async function foundMarket(
  page: Page,
  seed: string,
  difficulty: '넉넉한 출발' | '작은 출발' = '넉넉한 출발',
) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill(seed);
  await page.getByRole('button', { name: difficulty }).click();
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await page
    .getByTestId('club-hub')
    .getByRole('button', { name: '선수 키우기·영입', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: '선수 성장과 훈련' })
    .getByRole('button', { name: '선수단·이적 시장', exact: true })
    .click();
  await page.getByRole('button', { name: '이적 시장', exact: true }).click();
  await expect(page.getByRole('region', { name: '선수 영입 데스크' })).toBeVisible();
}

test('filters and compares stable candidates, discloses free wages, and saves real recruit and loan costs', async ({
  page,
}) => {
  await foundMarket(page, 'recruitment-ui');
  const before = await exportWorld(page);
  const offers = transferOffers(before);
  const desk = page.getByRole('region', { name: '선수 영입 데스크' });
  const roles = desk.getByRole('group', { name: '영입 포지션 선택' });
  const cards = desk.getByRole('article');
  const ids = async () =>
    cards.evaluateAll((items) => items.map((item) => item.getAttribute('data-candidate-id')!));
  await expect(cards).toHaveCount(8);
  expect((await ids()).sort()).toEqual(offers.map((offer) => offer.player.id).sort());
  await roles.getByRole('button', { name: 'GK', exact: true }).click();
  await expect(cards).toHaveCount(2);
  expect((await ids()).sort()).toEqual(
    offers
      .filter((offer) => offer.player.role === 'GK')
      .map((offer) => offer.player.id)
      .sort(),
  );
  await chooseOption(
    desk.getByRole('combobox', { name: '영입 후보 정렬', exact: true }),
    'potential',
  );
  const sorted = await ids();
  const ratings = sorted.map(
    (id) => offers.find((offer) => offer.player.id === id)!.player.potential,
  );
  expect(ratings[0]).toBeGreaterThanOrEqual(ratings[1]);
  for (const id of sorted)
    await desk
      .getByTestId(`candidate-${id}`)
      .getByRole('button', { name: '비교', exact: true })
      .click();
  await roles.getByRole('button', { name: 'MID', exact: true }).click();
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
  await roles.getByRole('button', { name: '전체', exact: true }).click();
  await chooseOption(desk.getByRole('combobox', { name: '영입 후보 정렬', exact: true }), 'fee');
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

  const free = offers.find((offer) => BigInt(offer.fee) === 0n)!;
  const freeCard = desk.getByTestId(`candidate-${free.player.id}`);
  expect(BigInt(free.player.wage)).toBeGreaterThan(0n);
  await expect(freeCard).toContainText('이적료 없음 · 연봉은 계속 지급해요');
  await expect(freeCard).toContainText(
    money(free.player.wage, clubOf(before).country, before.year),
  );
  const preview = recruitmentPreview(before, free);
  await expect(freeCard.getByLabel('영입 빌드 변화')).toContainText(
    `${preview.beforeStrength} → ${preview.afterStrength}`,
  );
  await freeCard.getByRole('button', { name: '선수 영입', exact: true }).click();
  await expect(freeCard.getByRole('button', { name: '계약 완료', exact: true })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: '우리 선수단 · 19/26', exact: true }),
  ).toBeVisible();
  const recruited = await exportWorld(page);
  expect(recruited.cash).toBe(before.cash);
  expect(recruited.players.find((player) => player.id === free.player.id)?.wage).toBe(
    free.player.wage,
  );
  expect(BigInt(operatingCost(recruited)) - BigInt(operatingCost(before))).toBe(
    BigInt(free.player.wage),
  );
  expect(lineupSummary(startingSquad(recruited, clubOf(recruited))).strength).toBe(
    preview.afterStrength,
  );

  const loan = offers.find((offer) => offer.player.role === 'DEF')!;
  const loanCard = desk.getByTestId(`candidate-${loan.player.id}`);
  const loanPreview = recruitmentPreview(recruited, loan, true);
  await loanCard.getByRole('button', { name: '1시즌 임대', exact: true }).click();
  await expect(loanCard.getByRole('button', { name: '계약 완료', exact: true })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: '우리 선수단 · 20/26', exact: true }),
  ).toBeVisible();
  const borrowed = await exportWorld(page);
  expect(BigInt(borrowed.cash)).toBe(BigInt(recruited.cash) - BigInt(loan.loanFee));
  expect(borrowed.cash).toBe(loanPreview.cashAfter);
  expect(borrowed.players.find((player) => player.id === loan.player.id)?.loanUntil).toBe(
    before.year + 1,
  );
  expect(BigInt(operatingCost(borrowed)) - BigInt(operatingCost(recruited))).toBe(
    BigInt(loan.player.wage),
  );
  await page.reload();
  await page.getByRole('button', { name: '이적 시장', exact: true }).click();
  await expect(freeCard.getByRole('button', { name: '계약 완료', exact: true })).toBeDisabled();
  await expect(loanCard.getByRole('button', { name: '1시즌 임대', exact: true })).toBeDisabled();
  const restored = await exportWorld(page);
  expect(restored.cash).toBe(borrowed.cash);
  expect(restored.revision).toBe(borrowed.revision);
  expect(restored.players).toEqual(borrowed.players);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('reaches the real squad capacity with eight loans and prevents any further contract', async ({
  page,
}) => {
  await foundMarket(page, 'recruitment-full-ui');
  const before = await exportWorld(page);
  const offers = transferOffers(before);
  const totalFees = offers.reduce((sum, offer) => sum + BigInt(offer.loanFee), 0n);
  expect(BigInt(before.cash)).toBeGreaterThan(totalFees);
  const desk = page.getByRole('region', { name: '선수 영입 데스크' });
  for (const offer of offers) {
    const card = desk.getByTestId(`candidate-${offer.player.id}`);
    await card.getByRole('button', { name: '1시즌 임대', exact: true }).click();
    await expect(card.getByRole('button', { name: '계약 완료', exact: true })).toBeDisabled();
  }
  await expect(
    page.getByRole('button', { name: '우리 선수단 · 26/26', exact: true }),
  ).toBeVisible();
  await expect(desk).toContainText('선수단 정원 26/26 · 자리가 가득 찼어요.');
  await expect(desk.getByRole('button', { name: '계약 완료', exact: true })).toHaveCount(8);
  for (const button of await desk.getByRole('button', { name: '1시즌 임대', exact: true }).all())
    await expect(button).toBeDisabled();
  const full = await exportWorld(page);
  expect(full.players.filter((player) => player.status === 'active')).toHaveLength(26);
  expect(BigInt(full.cash)).toBe(BigInt(before.cash) - totalFees);
  for (const offer of offers)
    expect(full.players.find((player) => player.id === offer.player.id)?.loanUntil).toBe(
      before.year + 1,
    );
});

test('disables an unaffordable fee while keeping a cheaper loan available with honest ongoing costs', async ({
  page,
}) => {
  await foundMarket(page, 'recruitment-poor-ui', '작은 출발');
  const before = await exportWorld(page);
  const offer = transferOffers(before).find(
    (candidate) =>
      !recruitmentPreview(before, candidate).affordable &&
      recruitmentPreview(before, candidate, true).affordable,
  )!;
  expect(offer).toBeDefined();
  const card = page
    .getByRole('region', { name: '선수 영입 데스크' })
    .getByTestId(`candidate-${offer.player.id}`);
  await expect(card.getByRole('button', { name: '선수 영입', exact: true })).toBeDisabled();
  await expect(card).toContainText('보유 자금이 부족합니다.');
  await expect(card.getByRole('button', { name: '1시즌 임대', exact: true })).toBeEnabled();
  await expect(card).toContainText('새 연봉 포함, 미래 수입 제외');
  expect(await exportWorld(page)).toEqual(before);
});

test('pauses daily progress while comparing candidates and resumes only on explicit restart', async ({
  page,
}) => {
  await foundMarket(page, 'recruitment-dialog-clock');
  const desk = page.getByRole('region', { name: '선수 영입 데스크' });
  await desk
    .getByRole('group', { name: '영입 포지션 선택' })
    .getByRole('button', { name: 'GK', exact: true })
    .click();
  for (const card of await desk.getByRole('article').all())
    await card.getByRole('button', { name: '비교', exact: true }).click();
  await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
  const date = page.getByTestId('game-date');
  await expect(date).toHaveText('1901년 8월 2일');
  await desk.getByRole('button', { name: '선택한 2명 비교', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '영입 후보 비교' });
  await expect(dialog).toBeVisible();
  const stopped = await date.innerText();
  await page.waitForTimeout(1200);
  await expect(date).toHaveText(stopped);
  await dialog.getByRole('button', { name: '후보 비교 마치기', exact: true }).click();
  await expect(page.getByRole('button', { name: '자동 진행 시작', exact: true })).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(date).toHaveText(stopped);
  await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
  await expect(date).not.toHaveText(stopped);
  await page.getByRole('button', { name: '자동 진행 정지', exact: true }).click();
  const after = await exportWorld(page);
  expect(after.round).toBe(0);
  expect(after.ownMatches).toHaveLength(0);
  expect(after.players.filter((player) => player.status === 'active')).toHaveLength(18);
});
