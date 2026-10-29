import { SHIRT_PATTERNS, type ShirtDesign } from '../../packages/contracts/src/identity';
import {
  FIGURE_TORSO,
  figureShirtColourAt,
  insideFigureTorso,
} from '../../packages/engine/src/kit-patterns';
import { torsoWidth } from '../../apps/web/src/ui/figurePainting';
import { markerRadius } from '../../apps/web/src/ui/pitchPainting';

/**
 * MATCH-36, KIT-3/8/12, WEB-49/50: evidence that a pitch Canvas dresses its player figures in a
 * kit, read from its actual pixels. Every size comes from the geometry the pitch paints with: the
 * marker radius of the Canvas's laid-out width (`markerRadius`), the torso's share of the marker's
 * diameter (`torsoWidth`, MATCH-36's 85%) and the torso's shape and regions (`FIGURE_TORSO`,
 * `figureShirtColourAt`). Pure data and arithmetic, so browser journeys and unit tests share it.
 */

/** One frame of a Canvas: its device pixels and the CSS width it is laid out at. */
export interface CanvasImage {
  /** Device pixels across and down. */
  width: number;
  height: number;
  /** The laid-out CSS width the pitch sizes its figures by. */
  cssWidth: number;
  /** RGBA bytes, row by row. */
  data: ArrayLike<number>;
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as number[];

/**
 * The RGB distance within which a pixel is a kit colour as the figure painter leaves it: its torso
 * shading (#00000021) moves a colour at most 33 a channel, 57 for white, and its highlight
 * (#ffffff1c) at most 28 a channel, 49 for black.
 */
export const PAINTED_TOLERANCE = 60;

/** The torso the pitch paints on `image`, device px: `across` the shoulders, `deep` chest to back. */
export function liveTorso(image: CanvasImage) {
  const across =
    torsoWidth({ radius: markerRadius(image.cssWidth) }) * (image.width / image.cssWidth);
  return { across, deep: across / FIGURE_TORSO.aspect };
}

/** Grid cells across the shoulders and from the chest back for the predicted torso regions. */
const CELLS: readonly [number, number] = [96, 40];

/**
 * What the shared torso geometry predicts in each cell of `shirt`'s figure torso: 1 the primary,
 * 2 the secondary, 0 nothing to judge (under the head, outside the torso or a trim band of a third
 * colour).
 */
export function torsoRegions(shirt: ShirtDesign) {
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

/** Device pixels one figure's torso on `image` shows in `colour` of `shirt`, by the geometry. */
export function torsoShare(image: CanvasImage, shirt: ShirtDesign, colour: string) {
  const { across, deep } = liveTorso(image);
  const [n, m] = CELLS;
  let shown = 0;
  for (let j = 0; j < m; j++)
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n,
        v = (j + 0.5) / m;
      if (insideFigureTorso(u, v) && figureShirtColourAt(shirt, u, v) === colour) shown++;
    }
  return (shown / (n * m)) * across * deep;
}

/** Device pixels of `image` within `tol` (Euclidean RGB distance) of `colour`. */
export function colourArea(image: CanvasImage, colour: string, tol = PAINTED_TOLERANCE) {
  const [r, g, b] = rgb(colour);
  const px = image.data;
  let count = 0;
  for (let p = 0; p < px.length; p += 4)
    if (Math.hypot(px[p]! - r!, px[p + 1]! - g!, px[p + 2]! - b!) <= tol) count++;
  return count;
}

type Point = readonly [number, number, number];

/**
 * How many figures on `image` wear `shirt`. Each connected region of the shirt's colours no larger
 * than a figure (a shoulder, a torso, a sock) is a candidate; every grid is fitted around it, one
 * point per device pixel of the live torso, over place and turn, scoring the pixels it explains
 * less twice those it contradicts. A figure wears the shirt when its own grid fits best, explains
 * at least a third of the torso with each worn colour present, and at least 90% of the
 * shirt-coloured pixels it covers agree. The other grids are the same colours in every other
 * pattern, so a figure counts only when the pattern it shows is the one asked about; a one-colour
 * shirt has no rival grids and must fill two fifths of the torso. Head, limbs, numbers, outlines
 * and edge smoothing match neither colour and are skipped.
 */
export function wornFigures(image: CanvasImage, shirt: ShirtDesign, tol = PAINTED_TOLERANCE) {
  const { width: W, height: H, data: px } = image;
  const colours = [shirt.primary, shirt.secondary ?? shirt.primary];
  const grids = (
    shirt.secondary === undefined
      ? [shirt.pattern]
      : [shirt.pattern, ...SHIRT_PATTERNS.filter((pattern) => pattern !== shirt.pattern)]
  ).map((pattern) => torsoRegions({ ...shirt, pattern }));
  // Half the drawn torso's width in device pixels, and its depth.
  const { across, deep: D } = liveTorso(image);
  const R = across / 2;
  const ref = colours.map(rgb);
  const kinds = colours[0] === colours[1] ? 1 : 2;
  const cls = new Int8Array(W * H).fill(-1);
  for (let p = 0; p < W * H; p++)
    for (let k = 0; k < kinds; k++)
      if (
        Math.hypot(
          px[p * 4]! - ref[k]![0]!,
          px[p * 4 + 1]! - ref[k]![1]!,
          px[p * 4 + 2]! - ref[k]![2]!,
        ) <= tol
      ) {
        cls[p] = k;
        break;
      }
  // Each grid as one point per device pixel of the torso, across the shoulders (a) and from the
  // chest back (b), with the colour it predicts there.
  const [cellsAcross, cellsDeep] = CELLS;
  const templates = grids.map((grid) => {
    const points: Point[] = [];
    for (let a = -R + 0.5; a < R; a++)
      for (let b = -D / 2 + 0.5; b < D / 2; b++) {
        const cell =
          Math.floor(((b + D / 2) / D) * cellsDeep) * cellsAcross +
          Math.floor(((a + R) / (2 * R)) * cellsAcross);
        if (grid[cell]) points.push([a, b, grid[cell]! - 1]);
      }
    return points;
  });
  /** How well `points` explain the pixels with the torso centred at (cx, cy), turned by `theta`. */
  const fit = (points: readonly Point[], cx: number, cy: number, theta: number) => {
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
  const best = (points: readonly Point[], mx: number, my: number) => {
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
