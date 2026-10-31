import { openClubhouse, openClubRecords } from './competition-navigation';
import { expect, test, type Page } from '@playwright/test';
import { describeShirt } from '../../apps/web/src/ui/kitPainting';
import { UNRECORDED_LOOK } from '../../apps/web/src/ui/matchAppearance';
import type { ShirtDesign } from '../../packages/contracts/src/identity';
import {
  advanceToNextMatch,
  createWorld,
  identityOf,
  nextOwnFixture,
  operate,
} from '../../packages/engine/src/index';
import { colourDistance } from '../../packages/engine/src/identity-legacy';
import { appearanceForFixture } from '../../packages/engine/src/match-appearance';
import { colourArea, torsoShare, wornFigures, type CanvasImage } from '../fixtures/figure-evidence';
import { ALL_DELEGATED } from './events';
import { openCurrentClubSeason } from './record-navigation';
import { importResponsibilityCareer } from './responsibility-fixtures';
import {
  adoptDraft,
  commission,
  openDesign,
  pitchImage,
  savedWorld,
  visiblePitch,
  watchToWhistle,
} from './club-identity-helpers';
import { openWatchAction } from './watch';
import { leaveOffice } from './office';

/**
 * KIT-8/12, WEB-49/50, MATCH-36, SAVE-22: the live pitch Canvas dresses its player figures in the
 * kits and keeper colours the match recorded, at phone scale, and older records say their kit was
 * not recorded. Pixel checks read the actual Canvas and fit each figure's torso, at the size the
 * pitch paints it, with the regions the shared torso geometry predicts
 * (`tests/fixtures/figure-evidence.ts`); a styled legend alone is not evidence.
 */

// Phones draw the pitch at device pixel ratio 2: a torso 85% of the 12 px marker (→MATCH-36) is
// 20.4 device pixels across.
test.use({ deviceScaleFactor: 2 });

/** Our home shirt: coarse vertical stripes in colours nothing else on the pitch uses. */
const STRIPES: ShirtDesign = { pattern: 'stripes', primary: '#ff00ff', secondary: '#00e5ff' };
/** A marked synthetic opponent's shirt, saved as all three of its designs. */
const CHECKS: ShirtDesign = { pattern: 'checks', primary: '#ffd400', secondary: '#3d2bff' };
/**
 * Device pixels a keeper's one-colour kit shows on `image` at the least: half his torso at the
 * size the pitch paints it (at phone scale 20.4 × 8.2 device pixels less the head), his sleeves,
 * shorts and socks besides. `colourArea` counts the colour through the painter's shading.
 */
const keeperPixels = (image: CanvasImage, colour: string) =>
  torsoShare(image, { pattern: 'plain', primary: colour }, colour) / 2;
/** The visible pitch's current frame. */
const frame = (page: Page) => pitchImage(visiblePitch(page));
/** Figures wearing `shirt` on the visible pitch now, judged against its colours in other patterns. */
const figures = async (page: Page, shirt: ShirtDesign) => wornFigures(await frame(page), shirt);

/** A new career that wears STRIPES against CHECKS in its first fixture, chosen and saved as owner decisions. */
function observedCareer() {
  const w = createWorld({
    country: 'ENG',
    name: 'Kit Town',
    color: '#bf7956',
    seed: 'kit-observe',
    level: 'easy',
  });
  Object.assign(w.settings!.responsibilities, ALL_DELEGATED);
  const own = identityOf(w, w.playerClub);
  operate(w, { type: 'club-identity', identity: { ...own, kits: { ...own.kits, home: STRIPES } } });
  const next = nextOwnFixture(w)!;
  const rival = w.clubs.find((c) => c.id === (next.home === w.playerClub ? next.away : next.home))!;
  rival.identity = {
    ...identityOf(w, rival.id),
    kits: { home: { ...CHECKS }, away: { ...CHECKS }, third: { ...CHECKS } },
  };
  operate(w, { type: 'match-kit', fixtureId: next.id, role: 'home' });
  const expected = appearanceForFixture(w, next);
  const ownSide = next.home === w.playerClub ? 0 : 1;
  expect(expected.sides[ownSide].shirt).toEqual(STRIPES);
  expect(expected.sides[1 - ownSide].shirt).toEqual(CHECKS);
  return { w, next, expected };
}

const recorded = async (page: Page, id: string) =>
  (await savedWorld(page)).ownMatches.find((match) => match.id === id)?.appearance;

test('the live Canvas wears the recorded stripes, checks and keeper colours at phone scale', async ({
  page,
}) => {
  test.slow();
  await page.setViewportSize({ width: 360, height: 740 });
  const { w, next, expected } = observedCareer();
  await importResponsibilityCareer(page, w);
  await watchToWhistle(page);
  await expect.poll(() => recorded(page, next.id)).toEqual(expected);
  // The whistle's frame stands still: every check reads the same pixels.
  const image = await frame(page);
  expect(wornFigures(image, STRIPES)).toBeGreaterThanOrEqual(3);
  expect(wornFigures(image, CHECKS)).toBeGreaterThanOrEqual(3);
  // The same pixels fit no other pattern's regions: the check sees the pattern, not just colours.
  expect(wornFigures(image, { ...STRIPES, pattern: 'hoops' })).toBe(0);
  expect(wornFigures(image, { ...CHECKS, pattern: 'stripes' })).toBe(0);
  // Each automatic keeper colour from the same snapshot dresses a keeper.
  for (const side of expected.sides)
    expect(colourArea(image, side.goalkeeper)).toBeGreaterThanOrEqual(
      keeperPixels(image, side.goalkeeper),
    );
  await expect(page.getByTestId('match-kit-unrecorded')).toHaveCount(0);
  // The chart legend names the worn shirts beside the teams (→WEB-49).
  await expect(
    page.getByRole('img', { name: new RegExp(`홈 유니폼: ${describeShirt(STRIPES)}$`) }),
  ).toHaveCount(1);
  await expect(
    page.getByRole('img', { name: new RegExp(`유니폼: ${describeShirt(CHECKS)}$`) }),
  ).toHaveCount(1);
});

test('a design adopted while the match is paused mid-match leaves its recorded shirts on the pitch', async ({
  page,
}) => {
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  const { w, next, expected } = observedCareer();
  await importResponsibilityCareer(page, w);
  await watchToWhistle(page);
  await expect.poll(() => recorded(page, next.id)).toEqual(expected);
  // Seek back to half-time: seeking pauses (→WEB-23), and the playback is unfinished again.
  await page.getByRole('button', { name: '경기 상세', exact: true }).click();
  await page.getByText('주요 장면 탐색', { exact: true }).click();
  await page.getByRole('button', { name: '전반 종료 · 45분', exact: true }).click();
  await expect(page.getByTestId('match-next-action')).toHaveAccessibleName('결과 보기');
  expect(await figures(page, STRIPES)).toBeGreaterThanOrEqual(3);
  // The owner commissions an orange design in 구단주 사무실 › 구단 디자인 and adopts a draft (→KIT-9).
  const edited = '#f77f00';
  const design = await openDesign(page);
  const { drafts } = await commission(page, design, [edited]);
  await adoptDraft(design, 0);
  const adopted = drafts[0]!;
  expect(adopted.kits.home.primary).toBe(edited);
  await expect
    .poll(async () => identityOf(await savedWorld(page), w.playerClub).kits.home)
    .toEqual(adopted.kits.home);
  // The unfinished match report resumes the same playback and its recorded kit (→WEB-50/83).
  await leaveOffice(page);
  await openClubhouse(page);
  const back = await openWatchAction(page);
  await expect(back).toHaveAccessibleName('관전 이어보기');
  await back.click();
  await expect(page.getByTestId('match-theatre')).toBeVisible();
  // The resumed playback runs on: wait for a moment its figures stand clear of each other.
  await expect.poll(() => figures(page, STRIPES)).toBeGreaterThanOrEqual(3);
  expect(await figures(page, { ...STRIPES, primary: edited })).toBe(0);
  expect(await figures(page, adopted.kits.home)).toBe(0);
  expect(await recorded(page, next.id)).toEqual(expected);
});

test('an old imported record says 유니폼 미기록 and never draws today’s design', async ({
  page,
}) => {
  const w = createWorld({
    country: 'ENG',
    name: 'Kit Town',
    color: '#bf7956',
    seed: 'kit-legacy',
    level: 'easy',
  });
  Object.assign(w.settings!.responsibilities, ALL_DELEGATED);
  advanceToNextMatch(w);
  // Recorded before kits were: the snapshot is absent, as in an older career.
  for (const record of w.ownMatches) delete record.appearance;
  const todayShirt = identityOf(w, w.playerClub).kits.home;
  const today = todayShirt.primary;
  const stand = UNRECORDED_LOOK.sides.flatMap((side) => [side.shirt.primary, side.keeper.primary]);
  for (const colour of stand) expect(colourDistance(today, colour)).toBeGreaterThan(80);
  await importResponsibilityCareer(page, w);
  // Activation installs no historical appearance.
  expect((await savedWorld(page)).ownMatches.some((m) => 'appearance' in m)).toBe(false);
  await openClubRecords(page);
  await openCurrentClubSeason(page);
  await page
    .getByRole('group', { name: '시즌 기록 보기' })
    .getByRole('button', { name: '경기', exact: true })
    .click();
  await page.getByRole('button', { name: '경기 기록 보기', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: '지난 경기 상세' });
  await expect(dialog.getByTestId('match-kit-unrecorded')).toHaveText('유니폼 미기록');
  await expect(dialog.getByRole('img', { name: /엠블럼 미기록$/ })).toHaveCount(2);
  // Neutral stand-in kits are worn; today's home shirt is not presented as this match's.
  // The dark neutral side remains separable from the print theme's warm paper ground. One read
  // takes about 3 s, so the poll gets room for several beyond the 5 s local default.
  await expect
    .poll(() => figures(page, UNRECORDED_LOOK.sides[1].shirt), { timeout: 20_000 })
    .toBeGreaterThanOrEqual(3);
  // Today's whole design: its base colour alone is close to a skin tone, which every head and
  // limb shows, so only its two colours in its pattern are identity.
  expect(todayShirt.secondary).toBeDefined();
  expect(await figures(page, todayShirt)).toBe(0);
});
