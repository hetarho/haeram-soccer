import { openPersonnel } from './personnel-navigation';
import { openLeague } from './competition-navigation';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { decode, encode } from '../../apps/web/src/adapters/persistence';
import { reduceIdentityDraft } from '../../apps/web/src/ui/clubIdentityDraft';
import type { DesignStudio } from '../../packages/contracts/src/identity';
import type { World } from '../../packages/contracts/src/types';
import { currentDay, DESIGNERS, designFee, redrawFee } from '../../packages/engine/src/index';
import { delegatedCareer } from '../fixtures/club-identity';
import { continueSlot } from './slots';
import { openSaveMenu } from './save-menu';
import { leaveOffice, openOfficeArea, openOfficeLibrary } from './office';
import { importResponsibilityCareer } from './responsibility-fixtures';
import {
  adoptButton,
  adoptDraft,
  appliedPanel,
  chooseColours,
  commission,
  committedCommission,
  confirmCommission,
  continueGame,
  crestFill,
  designView,
  DESIGNER_LABEL,
  discardButton,
  draftItems,
  draftsPanel,
  exportRaw,
  exportWorld,
  foundHere,
  hud,
  identityCommands,
  newGameIn,
  openDesign,
  openSlots,
  ownClub,
  paletteOf,
  redrawButton,
  refuseNextDesignCommand,
  requestButton,
  savedWorld,
  watchIdentityCommands,
} from './club-identity-helpers';

/**
 * KIT-9/12/13, WEB-39/49/74/108, SAVE-6/20: in a career 구단주 사무실 › 구단 디자인 changes the
 * crest and kits only through a designer commission. Colours and a designer are chosen, the fee is
 * paid at once, and the delivered drafts wait in the save until one is adopted, all are thrown away
 * or they are redrawn at half the fee. Evidence is the committed and exported checkpoints, decoded,
 * and the commands the page actually sends its engine worker.
 */

const NAME = 'Identity Works FC';
/** Commission colours from the designer's palette that no founding design here uses. */
const ROYAL = '#1f4fd1';
const GOLD = '#fcbf49';
const RED = '#d62828';
const BIG = (value: string) => BigInt(value);

async function found(page: Page, seed: string, name = NAME) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await foundHere(page, name, seed);
}
const ownIdentity = async (page: Page) => ownClub(await exportWorld(page)).identity!;
/** The designer step's terms: the fee and how many drafts that designer sends. */
const terms = (view: Locator, studio: DesignStudio) =>
  view.getByText(`시안 ${DESIGNERS[studio].drafts}개`, { exact: false });

test('a commission changes nothing until a draft is adopted, and the adopted crest reaches every screen', async ({
  page,
}) => {
  test.slow();
  await watchIdentityCommands(page);
  await found(page, 'identity-management-palette');
  const before = await savedWorld(page);
  const view = await openDesign(page);
  await expect(crestFill(view, ownClub(before).identity!.crest.primary)).not.toHaveCount(0);
  // Choosing colours and a designer sends nothing (KIT-9).
  await chooseColours(view, [ROYAL, GOLD, RED]);
  await expect(terms(view, 'studio')).toBeVisible();
  expect(await identityCommands(page)).toEqual({});
  await confirmCommission(view, 'studio');
  const delivered = await committedCommission(page, before.revision);
  expect(delivered).toMatchObject({ studio: 'studio', colours: [ROYAL, GOLD, RED] });
  expect(delivered.drafts).toHaveLength(DESIGNERS.studio.drafts);
  for (const [index, draft] of delivered.drafts.entries()) {
    expect(draft.colours).toEqual([ROYAL, GOLD, RED]);
    await expect(crestFill(draftItems(view).nth(index), draft.crest.primary)).not.toHaveCount(0);
  }
  // The fee is the only thing the commission moved: the applied design and the date stay (KIT-13).
  const commissioned = await savedWorld(page);
  expect(BIG(commissioned.cash)).toBe(BIG(before.cash) - BIG(designFee(before, 'studio')));
  expect(ownClub(commissioned).identity).toEqual(ownClub(before).identity);
  expect(currentDay(commissioned)).toBe(currentDay(before));
  expect(await identityCommands(page)).toEqual({ 'design-commission': 1 });

  await adoptDraft(view, 1);
  expect(await identityCommands(page)).toEqual({ 'design-commission': 1, 'adopt-design': 1 });
  const adopted = delivered.drafts[1]!;
  const exported = await exportWorld(page);
  expect(ownClub(exported).identity).toEqual(adopted);
  expect(ownClub(exported).color).toBe(ROYAL);
  expect('designCommission' in exported).toBe(false);
  await expect(draftsPanel(view)).toHaveCount(0);
  await expect(crestFill(view, ROYAL)).not.toHaveCount(0);

  // KIT-12/WEB-49: the current crest follows at once wherever the club is named, the office bar
  // first, then the HUD outside it.
  await expect(crestFill(hud(page), ROYAL)).not.toHaveCount(0);
  await leaveOffice(page);
  await expect(crestFill(hud(page), ROYAL)).not.toHaveCount(0);
  await openLeague(page);
  const own = page
    .getByRole('table', { name: '리그 순위표' })
    .getByRole('button', { name: `${NAME} 팀 정보`, exact: true })
    .first();
  await expect(crestFill(own, ROYAL)).not.toHaveCount(0);
  await own.click();
  const sheet = page.getByRole('dialog', { name: NAME, exact: true });
  await expect(crestFill(sheet, ROYAL)).not.toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await openSlots(page);
  const slot = page.getByTestId('game-slots').getByRole('listitem', { name: '슬롯 1' });
  await expect(crestFill(slot, ROYAL)).not.toHaveCount(0);
  await continueSlot(page, 1);
  await expect(page.getByTestId('club-hub')).toBeVisible();
  // …and survives a reload.
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await expect(crestFill(hud(page), ROYAL)).not.toHaveCount(0);
  expect(await ownIdentity(page)).toEqual(adopted);
});

test('a redraw costs half, a refused adoption keeps the drafts, and thrown-away drafts keep the fee spent', async ({
  page,
}) => {
  test.slow();
  await watchIdentityCommands(page);
  await found(page, 'identity-management-cancel');
  const applied = ownClub(await savedWorld(page)).identity!;
  const view = await openDesign(page);
  // 재설정 · 반값: the same designer redraws in the same colours for half its fee (→WEB-108).
  const first = await commission(page, view, [ROYAL, GOLD], 'studio');
  const paid = await savedWorld(page);
  await redrawButton(view).click();
  const redrawn = await committedCommission(page, paid.revision);
  expect(redrawn).toMatchObject({ studio: 'studio', colours: [ROYAL, GOLD] });
  expect(redrawn.drafts).toHaveLength(DESIGNERS.studio.drafts);
  expect(redrawn.drafts).not.toEqual(first.drafts);
  const saved = await savedWorld(page);
  expect(BIG(saved.cash)).toBe(BIG(paid.cash) - BIG(redrawFee(paid, 'studio')));
  expect(ownClub(saved).identity).toEqual(applied);

  // The host refuses the next adoption as outdated: the drafts and the applied design both stay.
  await refuseNextDesignCommand(page);
  await adoptButton(view, 2).click();
  await expect(view.getByRole('alert')).toBeVisible();
  await expect(draftItems(view)).toHaveCount(DESIGNERS.studio.drafts);
  expect(await savedWorld(page)).toEqual(saved);
  // The export steps out of the office and back (→WEB-39): the notice closes, the drafts stay.
  expect((await exportWorld(page)).designCommission).toEqual(redrawn);
  // Adopting again commits the kept draft.
  await adoptDraft(view, 2);
  await expect(view.getByRole('alert')).toHaveCount(0);
  expect(await identityCommands(page)).toEqual({
    'design-commission': 1,
    'redraw-designs': 1,
    'adopt-design': 2,
  });
  const adopted = redrawn.drafts[2]!;
  expect(await ownIdentity(page)).toEqual(adopted);

  // 전부 버리기: the drafts go, the fee stays spent and the applied design stays.
  const owned = await savedWorld(page);
  await commission(page, view, [RED], 'local');
  await discardButton(view).click();
  await expect.poll(async () => 'designCommission' in (await savedWorld(page))).toBe(false);
  const discarded = await savedWorld(page);
  expect(BIG(discarded.cash)).toBe(BIG(owned.cash) - BIG(designFee(owned, 'local')));
  expect(ownClub(discarded).identity).toEqual(adopted);
  await expect(appliedPanel(view)).toBeVisible();
  await expect(draftsPanel(view)).toHaveCount(0);
});

test('navigation detours and passing days keep the drafts beside the policy draft', async ({
  page,
}) => {
  test.slow();
  await watchIdentityCommands(page);
  await found(page, 'identity-management-detours');
  let view = await openDesign(page);
  const { drafts } = await commission(page, view, [GOLD, ROYAL]);
  const expectDrafts = async (current: Locator) => {
    await expect(draftItems(current)).toHaveCount(drafts.length);
    await expect(current.getByRole('alert')).toHaveCount(0);
    await expect(adoptButton(current, 0)).toBeEnabled();
  };
  // Another office area and back.
  await openOfficeArea(page, '투자');
  await openOfficeArea(page, '구단 디자인');
  view = designView(page);
  await expectDrafts(view);
  // Another page and back: a fresh entry opens the lobby, and the drafts still wait (→WEB-74).
  await leaveOffice(page);
  await openPersonnel(page, 'players');
  await expect(page).toHaveURL(/\/first-team\?view=players/);
  view = await openDesign(page);
  await expectDrafts(view);
  // Ordinary days advance the revision under a waiting commission: its drafts stay as delivered.
  // Explicitly stop the clock before returning to adopt one.
  await leaveOffice(page);
  const date = page.getByTestId('game-date');
  const today = await date.innerText();
  await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
  await expect(date).not.toHaveText(today, { timeout: 20000 });
  const running = page.getByRole('button', { name: '자동 진행 정지', exact: true });
  if (await running.count()) await running.click();
  view = await openDesign(page);
  await expectDrafts(view);
  expect((await savedWorld(page)).designCommission?.drafts).toEqual(drafts);
  // A policy-board draft is a separate department draft (→WEB-60/77).
  await openOfficeLibrary(page);
  await expect(page.getByTestId('view-scroller').getByTestId('strategy-board')).toBeVisible();
  const finance = page.getByRole('region', { name: '재정', exact: true });
  await finance.getByRole('button', { name: /어디서 벌고/ }).click();
  await finance.getByRole('radio', { name: '재정 기조 신중', exact: true }).click();
  await expect(page.getByTestId('strategy-draft')).toBeVisible();
  view = await openDesign(page);
  await expectDrafts(view);
  await adoptDraft(view, 0);
  expect(await identityCommands(page)).toEqual({ 'design-commission': 1, 'adopt-design': 1 });
  expect(await ownIdentity(page)).toEqual(drafts[0]);
  // Adopting the design left the policy draft unapplied and in place.
  await openOfficeLibrary(page);
  await expect(page.getByTestId('strategy-draft')).toBeVisible();
});

test('another game never sees the commission, which waits in its own game', async ({ page }) => {
  test.slow();
  await found(page, 'identity-management-slot-one');
  const view = await openDesign(page);
  const waiting = await commission(page, view, [ROYAL]);
  await newGameIn(page, 2);
  await foundHere(page, 'Second Design Club', 'identity-management-slot-two');
  expect('designCommission' in (await savedWorld(page))).toBe(false);
  const second = await openDesign(page);
  await expect(appliedPanel(second)).toBeVisible();
  await expect(requestButton(second)).toBeEnabled();
  await expect(draftsPanel(second)).toHaveCount(0);
  // Back in the first game the drafts still wait: they belong to that game's save (→WEB-108).
  await continueGame(page, 1);
  const first = await openDesign(page);
  await expect(draftItems(first)).toHaveCount(waiting.drafts.length);
  expect((await savedWorld(page)).designCommission).toEqual(waiting);
});

test('a read-only tab inspects the design and the drafts but cannot commission or adopt', async ({
  page,
  context,
}) => {
  test.slow();
  await found(page, 'identity-management-readonly');
  const applied = await ownIdentity(page);
  const viewer = await context.newPage();
  try {
    await viewer.setViewportSize({ width: 390, height: 844 });
    await viewer.goto('/direction?view=identity');
    let view = designView(viewer);
    await expect(appliedPanel(view)).toBeVisible();
    await expect(view).toContainText('읽기 전용 상태에서는 의뢰할 수 없어요.');
    await expect(requestButton(view)).toBeDisabled();
    await expect(crestFill(view, applied.crest.primary)).not.toHaveCount(0);
    // The writer commissions; the reader sees the delivered drafts, every action disabled (→KIT-9).
    const { drafts } = await commission(page, await openDesign(page), [ROYAL, GOLD]);
    await viewer.reload();
    view = designView(viewer);
    await expect(draftsPanel(view)).toBeVisible();
    await expect(draftItems(view)).toHaveCount(drafts.length);
    for (const [index, draft] of drafts.entries()) {
      await expect(crestFill(draftItems(view).nth(index), draft.crest.primary)).not.toHaveCount(0);
      await expect(adoptButton(view, index)).toBeDisabled();
    }
    await expect(discardButton(view)).toBeDisabled();
    await expect(redrawButton(view)).toBeDisabled();
  } finally {
    await viewer.close();
  }
  expect(await ownIdentity(page)).toEqual(applied);
  expect((await savedWorld(page)).designCommission?.drafts).toHaveLength(DESIGNERS.studio.drafts);
});

test('an imported file brings its own design and none of the drafts waiting in the replaced game', async ({
  page,
}) => {
  test.slow();
  await found(page, 'identity-management-stale');
  const raw = await exportRaw(page);
  const view = await openDesign(page);
  await commission(page, view, [ROYAL, GOLD]);
  // The same game comes back from a file whose applied crest has changed since then.
  const { world } = await decode(raw);
  const newer = reduceIdentityDraft(ownClub(world).identity!, {
    type: 'kit-colour',
    role: 'home',
    colour: '#123456',
  });
  ownClub(world).identity = newer;
  ownClub(world).color = newer.colours[0];
  await (
    await openSaveMenu(page)
  )
    .locator('input[type=file]')
    .last()
    .setInputFiles({
      name: 'newer-design.json',
      mimeType: 'application/json',
      buffer: Buffer.from(await encode(world)),
    });
  await page
    .getByRole('dialog', { name: '기록 가져오기 확인' })
    .getByRole('button', { name: '기록 교체하고 가져오기' })
    .click();
  await expect(crestFill(hud(page), '#123456')).not.toHaveCount(0);
  // The waiting drafts went with the replaced save: none can be adopted over the newer design.
  const imported = await openDesign(page);
  await expect(appliedPanel(imported)).toBeVisible();
  await expect(draftsPanel(imported)).toHaveCount(0);
  await expect(crestFill(imported, '#123456')).not.toHaveCount(0);
  const current: World = await exportWorld(page);
  expect(ownClub(current).identity).toEqual(newer);
  expect('designCommission' in current).toBe(false);
  expect(current.cash).toBe(world.cash);
});

test('colour steps take a main and optional sub and point colours once each, and a designer the cash cannot pay is unavailable', async ({
  page,
}) => {
  test.slow();
  await watchIdentityCommands(page);
  await page.setViewportSize({ width: 390, height: 844 });
  // A marked synthetic career that can pay the local designer, not the studio.
  const w = delegatedCareer('identity-management-steps', 'Step Works');
  w.cash = (BigInt(designFee(w, 'studio')) - 1n).toString();
  expect(BIG(w.cash)).toBeGreaterThan(BIG(designFee(w, 'local')));
  await importResponsibilityCareer(page, w);
  const view = await openDesign(page);
  await requestButton(view).click();
  const step = (text: string) => view.getByText(text, { exact: true });
  const next = view.getByRole('button', { name: '다음', exact: true });
  // The main colour is required; the optional ones start with 없음 (→WEB-108).
  await expect(step('1 / 4')).toBeVisible();
  await expect(next).toBeDisabled();
  await expect(paletteOf(view, '메인').getByRole('button', { name: '없음' })).toHaveCount(0);
  await paletteOf(view, '메인').getByRole('button', { name: ROYAL, exact: true }).click();
  await next.click();
  // No colour twice: the main is not offered again as the sub.
  await expect(step('2 / 4')).toBeVisible();
  await expect(paletteOf(view, '보조').getByRole('button', { name: ROYAL })).toBeDisabled();
  // No sub means no point: 보조 없음 skips the point step both ways.
  await paletteOf(view, '보조').getByRole('button', { name: '없음', exact: true }).click();
  await expect(step('2 / 3')).toBeVisible();
  await next.click();
  await expect(step('3 / 3')).toBeVisible();
  await view.getByRole('button', { name: '아니요', exact: true }).click();
  await expect(step('2 / 3')).toBeVisible();
  await paletteOf(view, '보조').getByRole('button', { name: GOLD, exact: true }).click();
  await next.click();
  await expect(step('3 / 4')).toBeVisible();
  for (const taken of [ROYAL, GOLD])
    await expect(paletteOf(view, '포인트').getByRole('button', { name: taken })).toBeDisabled();
  await paletteOf(view, '포인트').getByRole('button', { name: '없음', exact: true }).click();
  await next.click();
  await expect(step('4 / 4')).toBeVisible();

  // Dearer designers send more drafts; one the cash cannot pay cannot be asked.
  const designers = view.getByRole('group', { name: '디자이너', exact: true });
  const yes = view.getByRole('button', { name: '예', exact: true });
  const short = view.getByText('운영 자금이 의뢰비보다 적어요.', { exact: true });
  for (const studio of ['studio', 'star', 'local'] as const) {
    await designers.getByRole('button', { name: DESIGNER_LABEL[studio], exact: true }).click();
    await expect(terms(view, studio)).toBeVisible();
    const affordable = studio === 'local';
    await expect(short).toHaveCount(affordable ? 0 : 1);
    if (affordable) await expect(yes).toBeEnabled();
    else await expect(yes).toBeDisabled();
  }
  expect(await identityCommands(page)).toEqual({});
  const revision = (await savedWorld(page)).revision;
  await confirmCommission(view, 'local');
  const delivered = await committedCommission(page, revision);
  expect(delivered).toMatchObject({ studio: 'local', colours: [ROYAL, GOLD] });
  expect((await savedWorld(page)).cash).toBe(
    (BigInt(w.cash) - BigInt(designFee(w, 'local'))).toString(),
  );
});
