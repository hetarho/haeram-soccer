/**
 * Broadcast heat maps (→WEB-99): the 40 cells' touches spread as overlapping Gaussian blobs over
 * the material pitch and coloured on one cold-to-hot ramp, scaled to the map's own maximum. Pure
 * arithmetic plus one `putImageData`, so the same cells always give the same pixels.
 */
import { PITCH } from '../../../../packages/engine/src/grid/pitch';
import { VIEW, cellRect, px, py } from './materialView';

type Rgb = readonly [number, number, number];

export const HEAT_CONFIG = {
  /** Blob spread in cell widths: the mean cell's length and breadth (8 bands, 5 lanes). */
  sigma: 0.75,
  /** The painted image, the material drawing's own 190 × 100 at one pixel per unit. */
  resolution: { width: 190, height: 100 },
  /** Below this share of the maximum nothing shows. */
  floor: 0.05,
  /** Alpha reaches its top this far above the floor. */
  rise: 0.35,
  /** Top alpha, 0–1, so the pitch lines stay readable under the hottest area. */
  alpha: 0.82,
  /** Cold to hot, evenly spaced from 0 to 1: blue, cyan, green, yellow, red. */
  ramp: [
    [32, 72, 255],
    [0, 214, 255],
    [40, 220, 60],
    [255, 230, 0],
    [230, 30, 20],
  ] as readonly Rgb[],
} as const;

const FIELD = { left: px(0), right: px(PITCH.length), top: py(0), bottom: py(PITCH.width) };

/**
 * The intensity field, row by row: each cell's touches as a Gaussian at its centre, summed and
 * scaled to the field's own maximum (0–1). Outside the touchlines and goal lines it is zero.
 */
export function heatField(cells: readonly number[], width: number, height: number) {
  const field = new Float32Array(width * height);
  const sx = width / VIEW.width,
    sy = height / VIEW.height;
  const sigmaX = ((HEAT_CONFIG.sigma * (FIELD.right - FIELD.left)) / 8) * sx;
  const sigmaY = ((HEAT_CONFIG.sigma * (FIELD.bottom - FIELD.top)) / 5) * sy;
  const x0 = FIELD.left * sx,
    x1 = FIELD.right * sx,
    y0 = FIELD.top * sy,
    y1 = FIELD.bottom * sy;
  // Separable: one row of weights across and one down per cell, multiplied per pixel.
  const across: Float32Array[] = [],
    down: Float32Array[] = [],
    weight: number[] = [];
  cells.forEach((touches, cell) => {
    if (!(touches > 0)) return;
    const rect = cellRect(cell);
    const cx = (rect.x + rect.width / 2) * sx,
      cy = (rect.y + rect.height / 2) * sy;
    const gx = new Float32Array(width),
      gy = new Float32Array(height);
    for (let x = 0; x < width; x++) {
      const at = x + 0.5;
      gx[x] = at < x0 || at > x1 ? 0 : Math.exp(-(((at - cx) / sigmaX) ** 2) / 2);
    }
    for (let y = 0; y < height; y++) {
      const at = y + 0.5;
      gy[y] = at < y0 || at > y1 ? 0 : Math.exp(-(((at - cy) / sigmaY) ** 2) / 2);
    }
    across.push(gx);
    down.push(gy);
    weight.push(touches);
  });
  let most = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let i = 0; i < weight.length; i++) sum += weight[i]! * across[i]![x]! * down[i]![y]!;
      field[y * width + x] = sum;
      if (sum > most) most = sum;
    }
  if (most > 0) for (let i = 0; i < field.length; i++) field[i] = field[i]! / most;
  return field;
}

/** One intensity on the ramp as RGBA bytes; alpha is zero below the floor and rises above it. */
export function heatColour(v: number): [number, number, number, number] {
  const value = Math.min(1, Math.max(0, v));
  const { ramp, floor, rise, alpha } = HEAT_CONFIG;
  const at = value * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(at)),
    t = at - i;
  const [from, to] = [ramp[i]!, ramp[i + 1]!];
  const mix = (k: 0 | 1 | 2) => Math.round(from[k] + (to[k] - from[k]) * t);
  const opacity = value < floor ? 0 : Math.min(1, (value - floor) / rise) * alpha;
  return [mix(0), mix(1), mix(2), Math.round(opacity * 255)];
}

/** The drawing surface paintHeat needs; a real `HTMLCanvasElement` satisfies it. */
export interface HeatCanvas {
  width: number;
  height: number;
  getContext(kind: '2d'): Pick<CanvasRenderingContext2D, 'createImageData' | 'putImageData'> | null;
  toDataURL(type?: string): string;
}

/**
 * Paints the heat map onto an offscreen canvas at the configured resolution and returns it as a
 * data URL, or nothing when the browser has no 2D canvas (the caller then shades the cells).
 */
export function paintHeat(canvas: HeatCanvas, cells: readonly number[]): string | undefined {
  const { width, height } = HEAT_CONFIG.resolution;
  canvas.width = width;
  canvas.height = height;
  let ctx: ReturnType<HeatCanvas['getContext']>;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    return undefined;
  }
  if (!ctx) return undefined;
  const field = heatField(cells, width, height);
  const image = ctx.createImageData(width, height);
  for (let i = 0; i < field.length; i++) image.data.set(heatColour(field[i]!), i * 4);
  ctx.putImageData(image, 0, 0);
  try {
    return canvas.toDataURL('image/png');
  } catch {
    return undefined;
  }
}
