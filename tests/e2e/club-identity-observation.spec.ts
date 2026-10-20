import { expect, test, type Page } from '@playwright/test';
import { decode } from '../../apps/web/src/adapters/persistence';
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
import { shirtColourAt } from '../../packages/engine/src/kit-patterns';
import { appearanceForFixture } from '../../packages/engine/src/match-appearance';
import { ALL_DELEGATED } from './events';
import { openCurrentClubSeason } from './record-navigation';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { openWatchMenu, watchNext } from './watch';

/**
 * KIT-8/12, WEB-49/50, SAVE-22: the live pitch Canvas draws the shirts and keeper colours the match
 * recorded, at phone scale, and older records say their kit was not recorded. Pixel checks read the
 * actual Canvas and compare each shirt marker with the regions the shared pattern geometry
 * predicts; a styled legend alone is not evidence.
 */

// Phones draw the pitch at device pixel ratio 2, so a 12 px marker is 24 device pixels.
test.use({ deviceScaleFactor: 2 });

/** Our home shirt: coarse vertical stripes in colours nothing else on the pitch uses. */
const STRIPES: ShirtDesign = { pattern: 'stripes', primary: '#ff00ff', secondary: '#00e5ff' };
/** A marked synthetic opponent's shirt, saved as all three of its designs. */
const CHECKS: ShirtDesign = { pattern: 'checks', primary: '#ffd400', secondary: '#3d2bff' };
const PITCH = 'canvas[aria-label="22명의 선수와 공으로 표현하는 경기"]';

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

/** The committed checkpoint's world, once every revision is on disk. */
async function savedWorld(page: Page) {
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  const raw = await page.evaluate(() => {
    const manifest = JSON.parse(localStorage.getItem('haeram-soccor:manifest')!);
    return localStorage.getItem(`haeram-soccor:slot:${manifest.slot ? 'b' : 'a'}`)!;
  });
  return (await decode(raw)).world;
}
const recorded = async (page: Page, id: string) =>
  (await savedWorld(page)).ownMatches.find((match) => match.id === id)?.appearance;

/** Grid cells per marker side for the predicted regions. */
const CELLS = 48;
/**
 * Which shirt colours (bit 0 primary, bit 1 secondary) may appear in each cell of a marker's box:
 * the shared geometry's colour there or within 0.04 of a marker (about a device pixel), so edge
 * smoothing is not counted against the pattern. Cells outside the marker allow nothing.
 */
function predictedRegions(shirt: ShirtDesign) {
  const clamp = (v: number) => Math.min(0.999, Math.max(0, v));
  const bit = (u: number, v: number) => {
    const colour = shirtColourAt(shirt, clamp(u), clamp(v));
    return colour === shirt.primary ? 1 : colour === shirt.secondary ? 2 : 0;
  };
  const grid: number[] = [];
  for (let j = 0; j < CELLS; j++)
    for (let i = 0; i < CELLS; i++) {
      const u = (i + 0.5) / CELLS,
        v = (j + 0.5) / CELLS;
      let allowed = 0;
      if (Math.hypot(u - 0.5, v - 0.5) <= 0.5)
        for (const du of [-0.04, 0, 0.04])
          for (const dv of [-0.04, 0, 0.04]) allowed |= bit(u + du, v + dv);
      grid.push(allowed);
    }
  return grid;
}

/**
 * In the page: the shirt markers of one two-colour design on the visible pitch Canvas whose pixels
 * agree with the predicted regions. A marker is a connected run of pixels on the colour line
 * between the two shirt colours (so smoothed stripe edges stay joined) with the live marker's
 * size; a pixel within `tol` of one shirt colour must lie where that colour is predicted.
 * Numbers, halos and outlines match neither colour and are skipped.
 */
function agreeingMarkers(args: {
  selector: string;
  colours: [string, string];
  grid: number[];
  cells: number;
  tol: number;
}) {
  const canvas = [...document.querySelectorAll<HTMLCanvasElement>(args.selector)]
    .filter((element) => element.getClientRects().length)
    .at(-1)!;
  const W = canvas.width,
    H = canvas.height;
  const px = canvas.getContext('2d')!.getImageData(0, 0, W, H).data;
  // The live marker radius in device pixels (Pitch: max(6, width × 0.011) CSS px).
  const radius = Math.max(6, canvas.clientWidth * 0.011) * (W / canvas.clientWidth);
  const ref = args.colours.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
  const span = ref[1]!.map((v, k) => v - ref[0]![k]!);
  const span2 = span.reduce((sum, v) => sum + v * v, 0);
  const near = new Uint8Array(W * H);
  const cls = new Int8Array(W * H).fill(-1);
  for (let p = 0; p < W * H; p++) {
    const c = [px[p * 4]!, px[p * 4 + 1]!, px[p * 4 + 2]!];
    const t = Math.min(
      1,
      Math.max(0, c.reduce((sum, v, k) => sum + (v - ref[0]![k]!) * span[k]!, 0) / span2),
    );
    if (Math.hypot(...c.map((v, k) => v - (ref[0]![k]! + t * span[k]!))) <= args.tol) near[p] = 1;
    for (let k = 0; k < 2; k++)
      if (Math.hypot(...c.map((v, i) => v - ref[k]![i]!)) <= args.tol) cls[p] = k;
  }
  const seen = new Uint8Array(W * H);
  let agreeing = 0;
  for (let p = 0; p < W * H; p++) {
    if (!near[p] || seen[p]) continue;
    const stack = [p],
      members: number[] = [];
    seen[p] = 1;
    let x0 = W,
      x1 = 0,
      y0 = H,
      y1 = 0;
    while (stack.length) {
      const q = stack.pop()!;
      members.push(q);
      const x = q % W,
        y = (q - x) / W;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx,
          ny = y + dy;
        const r = ny * W + nx;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && near[r] && !seen[r]) {
          seen[r] = 1;
          stack.push(r);
        }
      }
    }
    // One whole marker: overlapping markers or the ball are not judged.
    if (Math.abs(x1 - x0 + 1 - 2 * radius) > 5 || Math.abs(y1 - y0 + 1 - 2 * radius) > 5) continue;
    const cx = (x0 + x1 + 1) / 2,
      cy = (y0 + y1 + 1) / 2;
    const counts = [0, 0],
      agree = [0, 0];
    for (const q of members) {
      const k = cls[q]!;
      if (k < 0) continue;
      const x = q % W,
        y = (q - x) / W;
      const cell = (value: number) =>
        Math.min(args.cells - 1, Math.max(0, Math.floor(value * args.cells)));
      const i = cell((x + 0.5 - (cx - radius)) / (2 * radius)),
        j = cell((y + 0.5 - (cy - radius)) / (2 * radius));
      counts[k]!++;
      if (args.grid[j * args.cells + i]! & (1 << k)) agree[k]!++;
    }
    // Both colours visible, and each where the pattern puts it.
    if (counts.every((count, k) => count >= 12 && agree[k]! / count >= 0.95)) agreeing++;
  }
  return agreeing;
}
const markers = (page: Page, shirt: ShirtDesign) =>
  page.evaluate(agreeingMarkers, {
    selector: PITCH,
    colours: [shirt.primary, shirt.secondary!] as [string, string],
    grid: predictedRegions(shirt),
    cells: CELLS,
    tol: 60,
  });
/** Device pixels of the visible pitch Canvas within `tol` of `colour`. */
const colourArea = (page: Page, colour: string, tol = 40) =>
  page.evaluate(
    ({ selector, colour, tol }) => {
      const canvas = [...document.querySelectorAll<HTMLCanvasElement>(selector)]
        .filter((element) => element.getClientRects().length)
        .at(-1)!;
      const px = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      const ref = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16));
      let count = 0;
      for (let p = 0; p < px.length; p += 4)
        if (Math.hypot(px[p]! - ref[0]!, px[p + 1]! - ref[1]!, px[p + 2]! - ref[2]!) <= tol)
          count++;
      return count;
    },
    { selector: PITCH, colour, tol },
  );

/** Watch the next match and stop at the final whistle; the presentation stays paused there. */
async function watchToWhistle(page: Page) {
  await watchNext(page);
  await expect(page.getByTestId('match-theatre')).toBeVisible();
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  await expect(page.getByTestId('match-result-summary')).toBeVisible();
}

test('the live Canvas wears the recorded stripes, checks and keeper colours at phone scale', async ({
  page,
}) => {
  test.slow();
  await page.setViewportSize({ width: 360, height: 740 });
  const { w, next, expected } = observedCareer();
  await importResponsibilityCareer(page, w);
  await watchToWhistle(page);
  await expect.poll(() => recorded(page, next.id)).toEqual(expected);
  expect(await markers(page, STRIPES)).toBeGreaterThanOrEqual(3);
  expect(await markers(page, CHECKS)).toBeGreaterThanOrEqual(3);
  // The same pixels fail another pattern's regions: the check sees the pattern, not just colours.
  expect(await markers(page, { ...STRIPES, pattern: 'hoops' })).toBe(0);
  expect(await markers(page, { ...CHECKS, pattern: 'stripes' })).toBe(0);
  // Each automatic keeper colour from the same snapshot fills a marker.
  for (const side of expected.sides)
    expect(await colourArea(page, side.goalkeeper)).toBeGreaterThanOrEqual(150);
  await expect(page.getByTestId('match-kit-unrecorded')).toHaveCount(0);
  // The chart legend names the worn shirts beside the teams (→WEB-49).
  await expect(
    page.getByRole('img', { name: new RegExp(`홈 유니폼: ${describeShirt(STRIPES)}$`) }),
  ).toHaveCount(1);
  await expect(
    page.getByRole('img', { name: new RegExp(`유니폼: ${describeShirt(CHECKS)}$`) }),
  ).toHaveCount(1);
});

// Needs T251's 구단 운영 › 구단 디자인 tab (identity-founding lane) in the tree under test.
test('a design applied while the match is paused mid-match leaves its recorded shirts on the pitch', async ({
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
  expect(await markers(page, STRIPES)).toBeGreaterThanOrEqual(3);
  // The owner recolours the home shirt in 구단 운영 › 구단 디자인 and applies it (→KIT-9).
  const edited = '#ff6d00';
  await page
    .getByRole('navigation', { name: '모바일 게임 메뉴' })
    .getByRole('button', { name: '구단 운영', exact: true })
    .click();
  await page.getByRole('tab', { name: '구단 디자인', exact: true }).click();
  await page
    .getByRole('group', { name: '편집할 유니폼', exact: true })
    .getByRole('button', { name: '홈 유니폼', exact: true })
    .click();
  await page.getByRole('textbox', { name: '주색 색 코드', exact: true }).fill(edited);
  await page.getByRole('button', { name: '적용', exact: true }).click();
  await expect
    .poll(async () => identityOf(await savedWorld(page), w.playerClub).kits.home.primary)
    .toBe(edited);
  // The menu leads back to the unfinished match (→WEB-50); it still wears what it recorded.
  const back = await openWatchMenu(page);
  await expect(back).toHaveAccessibleName('경기로 돌아가기');
  await back.click();
  await expect(page.getByTestId('match-theatre')).toBeVisible();
  expect(await markers(page, STRIPES)).toBeGreaterThanOrEqual(3);
  expect(await markers(page, { ...STRIPES, primary: edited })).toBe(0);
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
  const today = identityOf(w, w.playerClub).kits.home.primary;
  const stand = UNRECORDED_LOOK.sides.flatMap((side) => [side.shirt.primary, side.keeper.primary]);
  for (const colour of stand) expect(colourDistance(today, colour)).toBeGreaterThan(80);
  await importResponsibilityCareer(page, w);
  // Activation installs no historical appearance.
  expect((await savedWorld(page)).ownMatches.some((m) => 'appearance' in m)).toBe(false);
  await page.getByRole('button', { name: '클럽 기록실', exact: true }).click();
  await openCurrentClubSeason(page);
  await page
    .getByRole('group', { name: '시즌 기록 보기' })
    .getByRole('button', { name: '경기', exact: true })
    .click();
  await page.getByRole('button', { name: '경기 기록 보기', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: '지난 경기 상세' });
  await expect(dialog.getByTestId('match-kit-unrecorded')).toHaveText('유니폼 미기록');
  await expect(dialog.getByRole('img', { name: /엠블럼 미기록$/ })).toHaveCount(2);
  // Neutral markers are drawn; today's home shirt is not presented as this match's.
  await expect
    .poll(() => colourArea(page, UNRECORDED_LOOK.sides[0].shirt.primary))
    .toBeGreaterThan(150);
  expect(await colourArea(page, today, 30)).toBe(0);
});
