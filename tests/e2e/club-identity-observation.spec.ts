import { openClubRecords } from './competition-navigation';
import { expect, test, type Page } from '@playwright/test';
import { describeShirt } from '../../apps/web/src/ui/kitPainting';
import { UNRECORDED_LOOK } from '../../apps/web/src/ui/matchAppearance';
import { SHIRT_PATTERNS, type ShirtDesign } from '../../packages/contracts/src/identity';
import {
  advanceToNextMatch,
  createWorld,
  identityOf,
  nextOwnFixture,
  operate,
} from '../../packages/engine/src/index';
import { colourDistance } from '../../packages/engine/src/identity-legacy';
import {
  FIGURE_TORSO,
  figureShirtColourAt,
  insideFigureTorso,
} from '../../packages/engine/src/kit-patterns';
import { appearanceForFixture } from '../../packages/engine/src/match-appearance';
import { ALL_DELEGATED } from './events';
import { openCurrentClubSeason } from './record-navigation';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { savedWorld, watchToWhistle } from './club-identity-helpers';
import { openWatchAction } from './watch';
import { leaveOffice, openOfficeArea } from './office';

/**
 * KIT-8/12, WEB-49/50, MATCH-36, SAVE-22: the live pitch Canvas dresses its player figures in the
 * kits and keeper colours the match recorded, at phone scale, and older records say their kit was
 * not recorded. Pixel checks read the actual Canvas and fit each figure's torso with the regions the
 * shared torso geometry (`FIGURE_TORSO`, `figureShirtColourAt`) predicts; a styled legend alone is
 * not evidence.
 */

// Phones draw the pitch at device pixel ratio 2, so a 12 px torso is 24 device pixels across.
test.use({ deviceScaleFactor: 2 });

/** Our home shirt: coarse vertical stripes in colours nothing else on the pitch uses. */
const STRIPES: ShirtDesign = { pattern: 'stripes', primary: '#ff00ff', secondary: '#00e5ff' };
/** A marked synthetic opponent's shirt, saved as all three of its designs. */
const CHECKS: ShirtDesign = { pattern: 'checks', primary: '#ffd400', secondary: '#3d2bff' };
const PITCH = 'canvas[aria-label="22명의 선수와 공으로 표현하는 경기"]';
/**
 * Device pixels a keeper's one-colour kit shows at the least: about half a figure's torso at phone
 * scale (24 × 10 device pixels less the head), its shorts and socks besides.
 */
const KEEPER_PIXELS = 60;

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

/** Grid cells across the shoulders and from the chest back for the predicted torso regions. */
const CELLS: [number, number] = [96, 40];
/**
 * What the shared torso geometry predicts in each cell of `shirt`'s figure torso: 1 the primary,
 * 2 the secondary, 0 nothing to judge (under the head, outside the torso or a trim band).
 */
function torsoRegions(shirt: ShirtDesign) {
  const [across, deep] = CELLS;
  const grid: number[] = [];
  for (let j = 0; j < deep; j++)
    for (let i = 0; i < across; i++) {
      const u = (i + 0.5) / across,
        v = (j + 0.5) / deep;
      const colour = figureShirtColourAt(shirt, u, v);
      grid.push(
        !insideFigureTorso(u, v)
          ? 0
          : colour === shirt.primary
            ? 1
            : colour === shirt.secondary
              ? 2
              : 0,
      );
    }
  return grid;
}

/**
 * In the page: how many figures on the visible pitch Canvas wear the shirt of `grids[0]`. Each
 * connected region of the shirt's colours no larger than a figure (a shoulder, a torso, a sock) is
 * a candidate; every grid is fitted around it, one point per device pixel of the live torso, over
 * place and turn, scoring the pixels it explains less twice those it contradicts. A figure wears
 * the shirt when its own grid fits best, explains at least a third of the torso with each worn
 * colour present, and at least 90% of the shirt-coloured pixels it covers agree. The other grids
 * are the same colours in every other pattern, so a figure counts only when the pattern it shows
 * is the one asked about; a one-colour shirt has no rival grids and must fill two fifths of the
 * torso. Head, limbs, numbers, outlines and edge smoothing match neither colour and are skipped.
 */
function wornFigures(args: {
  selector: string;
  colours: [string, string];
  grids: number[][];
  cells: [number, number];
  aspect: number;
  tol: number;
}) {
  const canvas = [...document.querySelectorAll<HTMLCanvasElement>(args.selector)]
    .filter((element) => element.getClientRects().length)
    .at(-1)!;
  const W = canvas.width,
    H = canvas.height;
  const px = canvas.getContext('2d')!.getImageData(0, 0, W, H).data;
  // Half the live torso's width in device pixels (Pitch: max(6, width × 0.011) CSS px), its depth.
  const R = Math.max(6, canvas.clientWidth * 0.011) * (W / canvas.clientWidth);
  const D = (2 * R) / args.aspect;
  const ref = args.colours.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
  const kinds = args.colours[0] === args.colours[1] ? 1 : 2;
  const cls = new Int8Array(W * H).fill(-1);
  for (let p = 0; p < W * H; p++)
    for (let k = 0; k < kinds; k++)
      if (
        Math.hypot(
          px[p * 4]! - ref[k]![0]!,
          px[p * 4 + 1]! - ref[k]![1]!,
          px[p * 4 + 2]! - ref[k]![2]!,
        ) <= args.tol
      ) {
        cls[p] = k;
        break;
      }
  // Each grid as one point per device pixel of the torso, across the shoulders (a) and from the
  // chest back (b), with the colour it predicts there.
  const [across, deep] = args.cells;
  const templates = args.grids.map((grid) => {
    const points: [number, number, number][] = [];
    for (let a = -R + 0.5; a < R; a++)
      for (let b = -D / 2 + 0.5; b < D / 2; b++) {
        const cell =
          Math.floor(((b + D / 2) / D) * deep) * across + Math.floor(((a + R) / (2 * R)) * across);
        if (grid[cell]) points.push([a, b, grid[cell]! - 1]);
      }
    return points;
  });
  /** How well `points` explain the pixels with the torso centred at (cx, cy), turned by `theta`. */
  const fit = (points: [number, number, number][], cx: number, cy: number, theta: number) => {
    const c = Math.cos(theta),
      s = Math.sin(theta);
    const seen = [0, 0];
    let agreed = 0;
    for (const [a, b, colour] of points) {
      const x = Math.floor(cx + a * c - b * s),
        y = Math.floor(cy + a * s + b * c);
      const k = x < 0 || y < 0 || x >= W || y >= H ? -1 : cls[y * W + x]!;
      if (k < 0) continue;
      seen[k]!++;
      if (k === colour) agreed++;
    }
    const judged = seen[0]! + seen[1]!;
    return { cx, cy, theta, seen, agreed, judged, score: agreed - 2 * (judged - agreed) };
  };
  /** The best fit of `points` around (mx, my): a coarse search of place and turn, then a fine one. */
  const best = (points: [number, number, number][], mx: number, my: number) => {
    let top = fit(points, mx, my, 0);
    const reach = Math.round(0.8 * R);
    for (let dy = -reach; dy <= reach; dy += 2)
      for (let dx = -reach; dx <= reach; dx += 2)
        for (let deg = 0; deg < 360; deg += 6) {
          const tried = fit(points, mx + dx, my + dy, (deg * Math.PI) / 180);
          if (tried.score > top.score) top = tried;
        }
    const coarse = top;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++)
        for (let deg = -6; deg <= 6; deg += 2) {
          const tried = fit(
            points,
            coarse.cx + dx,
            coarse.cy + dy,
            coarse.theta + (deg * Math.PI) / 180,
          );
          if (tried.score > top.score) top = tried;
        }
    return top;
  };
  const visited = new Uint8Array(W * H);
  const worn: [number, number][] = [];
  for (let p = 0; p < W * H; p++) {
    if (cls[p]! < 0 || visited[p]) continue;
    const stack = [p];
    visited[p] = 1;
    let n = 0,
      sx = 0,
      sy = 0,
      x0 = W,
      x1 = 0,
      y0 = H,
      y1 = 0;
    while (stack.length) {
      const q = stack.pop()!;
      const x = q % W,
        y = (q - x) / W;
      n++;
      sx += x + 0.5;
      sy += y + 0.5;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      for (const r of [q + 1, q - 1, q + W, q - W])
        if (r >= 0 && r < W * H && Math.abs((r % W) - x) <= 1 && cls[r]! >= 0 && !visited[r]) {
          visited[r] = 1;
          stack.push(r);
        }
    }
    // Larger than a figure is ground or a crowd, not one torso.
    if (n < 10 || x1 - x0 + 1 > 3.2 * R || y1 - y0 + 1 > 3.2 * R) continue;
    const mx = sx / n,
      my = sy / n;
    if (worn.some(([x, y]) => Math.hypot(x - mx, y - my) < R)) continue;
    const own = best(templates[0]!, mx, my);
    const total = templates[0]!.length;
    if (
      own.agreed < total * (kinds === 1 ? 0.4 : 0.35) ||
      own.agreed < own.judged * 0.9 ||
      own.seen.slice(0, kinds).some((count) => count < total * 0.05) ||
      worn.some(([x, y]) => Math.hypot(x - own.cx, y - own.cy) < R)
    )
      continue;
    // Only a fit that would count is judged against the rival patterns: skin-toned heads and limbs
    // are many candidates, and fitting every rival around each took tens of seconds.
    if (templates.slice(1).every((points) => own.score > best(points, mx, my).score))
      worn.push([own.cx, own.cy]);
  }
  return worn.length;
}
/** Figures wearing `shirt`, judged against the same colours in every other pattern. */
const figures = (page: Page, shirt: ShirtDesign) =>
  page.evaluate(wornFigures, {
    selector: PITCH,
    colours: [shirt.primary, shirt.secondary ?? shirt.primary] as [string, string],
    grids: (shirt.secondary === undefined
      ? [shirt.pattern]
      : [shirt.pattern, ...SHIRT_PATTERNS.filter((pattern) => pattern !== shirt.pattern)]
    ).map((pattern) => torsoRegions({ ...shirt, pattern })),
    cells: CELLS,
    aspect: FIGURE_TORSO.aspect,
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

test('the live Canvas wears the recorded stripes, checks and keeper colours at phone scale', async ({
  page,
}) => {
  test.slow();
  await page.setViewportSize({ width: 360, height: 740 });
  const { w, next, expected } = observedCareer();
  await importResponsibilityCareer(page, w);
  await watchToWhistle(page);
  await expect.poll(() => recorded(page, next.id)).toEqual(expected);
  expect(await figures(page, STRIPES)).toBeGreaterThanOrEqual(3);
  expect(await figures(page, CHECKS)).toBeGreaterThanOrEqual(3);
  // The same pixels fit no other pattern's regions: the check sees the pattern, not just colours.
  expect(await figures(page, { ...STRIPES, pattern: 'hoops' })).toBe(0);
  expect(await figures(page, { ...CHECKS, pattern: 'stripes' })).toBe(0);
  // Each automatic keeper colour from the same snapshot dresses a keeper.
  for (const side of expected.sides)
    expect(await colourArea(page, side.goalkeeper)).toBeGreaterThanOrEqual(KEEPER_PIXELS);
  await expect(page.getByTestId('match-kit-unrecorded')).toHaveCount(0);
  // The chart legend names the worn shirts beside the teams (→WEB-49).
  await expect(
    page.getByRole('img', { name: new RegExp(`홈 유니폼: ${describeShirt(STRIPES)}$`) }),
  ).toHaveCount(1);
  await expect(
    page.getByRole('img', { name: new RegExp(`유니폼: ${describeShirt(CHECKS)}$`) }),
  ).toHaveCount(1);
});

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
  expect(await figures(page, STRIPES)).toBeGreaterThanOrEqual(3);
  // The owner recolours the home shirt in 구단주 사무실 › 구단 디자인 and applies it (→KIT-9).
  const edited = '#ff6d00';
  await openOfficeArea(page, '구단 디자인');
  // The editor loads lazily with the area (T251).
  const design = page.getByRole('region', { name: '구단 디자인', exact: true });
  await expect(design.getByRole('group', { name: '색상', exact: true })).toBeVisible();
  await design
    .getByRole('group', { name: '편집할 유니폼', exact: true })
    .getByRole('button', { name: '홈 유니폼', exact: true })
    .click();
  await design.getByLabel('홈 색 코드', { exact: true }).fill(edited);
  await design
    .getByRole('group', { name: '구단 디자인 적용', exact: true })
    .getByRole('button', { name: '적용', exact: true })
    .click();
  const outcome = page.getByTestId('action-outcome');
  await expect(outcome).toContainText('구단 디자인을 적용했어요');
  await outcome.getByRole('button', { name: /^(확인|알림 닫기)$/ }).click();
  await expect
    .poll(async () => identityOf(await savedWorld(page), w.playerClub).kits.home.primary)
    .toBe(edited);
  // The unfinished match report resumes the same playback and its recorded kit (→WEB-50/83).
  await leaveOffice(page);
  await page
    .getByRole('navigation', { name: '모바일 게임 메뉴' })
    .getByRole('button', { name: '클럽하우스', exact: true })
    .click();
  const back = await openWatchAction(page);
  await expect(back).toHaveAccessibleName('관전 이어보기');
  await back.click();
  await expect(page.getByTestId('match-theatre')).toBeVisible();
  // The resumed playback runs on: wait for a moment its figures stand clear of each other.
  await expect.poll(() => figures(page, STRIPES)).toBeGreaterThanOrEqual(3);
  expect(await figures(page, { ...STRIPES, primary: edited })).toBe(0);
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
