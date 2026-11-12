import { expect, type Locator, type Page } from '@playwright/test';
import type { OwnerTrait, TakeoverDecade, WealthTier } from '../../packages/contracts/src/owner';
import { OWNER_TIERS, OWNER_TRAITS } from '../../packages/engine/src/owner-config';
import { chooseOption } from './select';

/**
 * A career's start (→WEB-2, WEB-15): who the owner is, when he buys and which club. Every field has
 * a default, so `startCareer(page)` starts the reference journey's career quickly: 석유 재벌 with no
 * trait, a 1930 takeover (the world plays no season first) on a fixed seed, and the first club the
 * list opens on that he can pay for — the strongest English top-flight club.
 */
export interface CareerStart {
  tier?: WealthTier;
  traits?: OwnerTrait[];
  decade?: TakeoverDecade;
  seed?: string;
  /** The club's name on the list; else the first row the list opens on. */
  club?: string;
  /** The list's country (`ENG`…) and division (0 the top flight) before the club is picked. */
  country?: string;
  division?: number;
}

export const DEFAULT_START = {
  tier: 'oil',
  traits: [],
  decade: 1930,
  seed: 'e2e-start',
} as const satisfies CareerStart;

/** The start flow on screen, opened by the start address or a slot's 새 게임. */
export const startFlow = (page: Page) => page.getByTestId('start-flow');

/**
 * The world's history plays while a later decade is generated (→WEB-115): the season reached, the
 * season just closed, the Club Elo world top 10 and each playable association's league champion
 * stand on screen before the club list. `whileGenerating` measures the view meanwhile.
 */
export async function expectHistoryPlays(
  flow: Locator,
  whileGenerating?: (generation: Locator) => Promise<void>,
) {
  const generation = flow.getByTestId('world-generation');
  await expect(generation).toBeVisible();
  await expect(generation.getByRole('status').first()).toContainText(/\d{4}\/\d{2} 시즌/);
  const history = generation.getByTestId('generation-history');
  await expect(history).toContainText(/\d{4}\/\d{2} 시즌 결과/, { timeout: 60000 });
  await expect(history.getByTestId('generation-elo').locator('li')).toHaveCount(10);
  const champions = history.getByTestId('generation-champions').locator('li');
  await expect(champions).toHaveCount(8);
  await expect(champions.first()).toContainText('잉글랜드');
  await whileGenerating?.(generation);
}

/**
 * Picks the tier, traits, decade and seed, then 세계 생성 →, and waits for the club list; a later
 * decade checks that its history plays meanwhile.
 */
export async function generateWorld(
  page: Page,
  start: CareerStart = {},
  whileGenerating?: (generation: Locator) => Promise<void>,
) {
  const { tier, traits, decade, seed } = { ...DEFAULT_START, ...start };
  const flow = startFlow(page);
  await expect(flow).toBeVisible();
  await flow
    .getByTestId('start-tiers')
    .getByRole('button', { name: OWNER_TIERS[tier].label })
    .click();
  await flow.getByRole('button', { name: '다음 →', exact: true }).click();
  const cards = flow.getByTestId('start-traits');
  await expect(cards).toBeVisible();
  for (const trait of traits)
    await cards.getByRole('button', { name: OWNER_TRAITS[trait].label }).click();
  await flow.getByRole('button', { name: '다음 →', exact: true }).click();
  await flow
    .getByTestId('start-decades')
    .getByRole('button', { name: `${decade}년대` })
    .click();
  await flow.getByText('고급 설정', { exact: true }).click();
  await flow.getByLabel('세계 생성 시드').fill(seed);
  await flow.getByRole('button', { name: '세계 생성 →', exact: true }).click();
  if (decade > 1930) await expectHistoryPlays(flow, whileGenerating);
  const listing = flow.getByTestId('club-listing');
  // A 1930 world plays no season first; a later decade plays its seasons behind the progress.
  await expect(listing).toBeVisible({ timeout: decade === 1930 ? 30000 : 600000 });
  return listing;
}

/** Filters the list to a country and division, when given (→WEB-15). */
export async function filterListing(listing: Locator, start: CareerStart) {
  if (start.country !== undefined)
    await chooseOption(listing.getByRole('combobox', { name: '국가', exact: true }), start.country);
  if (start.division !== undefined)
    await chooseOption(
      listing.getByRole('combobox', { name: '리그', exact: true }),
      String(start.division),
    );
}

/** Opens a club's sheet from the list: the named club, or the first row the fortune pays for. */
export async function openClub(listing: Locator, club?: string) {
  const rows = listing.getByRole('list', { name: /^구단 \d+개$/ }).getByRole('button');
  const row = club
    ? rows.filter({ hasText: club }).first()
    : listing.locator('button[data-affordable="true"]').first();
  const name = (await row.locator('b').first().textContent())!.trim();
  await row.click();
  const sheet = listing.page().getByRole('dialog', { name, exact: true });
  await expect(sheet.getByTestId('club-sheet')).toBeVisible();
  return { name, sheet };
}

/**
 * Takes the open club over: 인수 검토 →, 인수 확정, with standard defaults; resolves once the career is on
 * screen and its first checkpoint saved.
 */
export async function takeOverClub(page: Page, name: string) {
  const sheet = page.getByRole('dialog', { name, exact: true });
  await sheet.getByRole('button', { name: '인수 검토 →', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: `${name} 인수`, exact: true });
  await expect(confirm.getByTestId('takeover-confirm')).toBeVisible();
  await expect(confirm.getByRole('combobox', { name: '구단 방향', exact: true })).toHaveCount(0);
  await confirm.getByRole('button', { name: '인수 확정', exact: true }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
}

/**
 * Puts a quarter of what the fortune can put in (자금 투입's slider at 25%) into the club's cash
 * through the HUD's money button and its 자금 관리 dialog (→OWNER-9, WEB-114), and dismisses its
 * outcome card. A 1930 club is taken over with no cash, so a journey that spends money or plays on
 * past eight rounds in the red funds the club first (→ECON-24). The clock must be stopped.
 */
export async function fundClub(page: Page) {
  await page.getByTestId('hud-cash').click();
  const sheet = page.getByRole('dialog', { name: '자금 관리', exact: true });
  await sheet.getByRole('tab', { name: '내 자산', exact: true }).click();
  await sheet.getByRole('slider', { name: '자금 투입 금액', exact: true }).fill('25');
  // The amount button ("£2.44M 넣기"), not the 흐름 card's "구단에 넣기" jump to this tab.
  await sheet.getByRole('button', { name: /\d\S* 넣기$/ }).click();
  await expect(sheet.getByTestId('owner-message')).toContainText('투입했어요');
  await sheet.getByRole('button', { name: '창 닫기', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  const outcome = page.getByTestId('action-outcome');
  await expect(outcome).toContainText('구단에 자금을 투입했어요');
  await outcome.getByRole('button', { name: /^(확인|알림 닫기)$/ }).click();
  await expect(outcome).toHaveCount(0);
}

/**
 * Starts a career at <tier>/<decade>/<club> through the start flow on screen and waits for the
 * club's home with its first checkpoint saved. Returns the club's name.
 */
export async function startCareer(page: Page, start: CareerStart = {}) {
  const listing = await generateWorld(page, start);
  await filterListing(listing, start);
  const { name } = await openClub(listing, start.club);
  await takeOverClub(page, name);
  return name;
}
