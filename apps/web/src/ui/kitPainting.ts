import type { ShirtDesign, ShirtPattern } from '../../../../packages/contracts/src/identity';
import {
  SHIRT_MARKER_CENTRE,
  SHIRT_TRIM_INNER,
  shirtColourAt,
  shirtPatternRegions,
} from '../../../../packages/engine/src/kit-patterns';
import { inkOn } from './crests';

/**
 * KIT-3–5, WEB-50/87: one Canvas painter for every shirt marker — the large editor sample, the small
 * preview markers and, later, the live pitch (spec/ssot/KIT.md). The pattern and
 * trim come from the shared geometry in `kit-patterns.ts`; nothing here restates it.
 *
 * The painter keeps a bounded cache of background sprites: one offscreen canvas per visible style,
 * pixel size and DPR, painted once (field, secondary polygons, optional trim, clipped to the marker
 * circle) and then blitted. Numbers and outlines differ per player, so they are drawn over the blit
 * on every call and never cached. The cache holds only those sprites: no players, world, fixture
 * history or animation callbacks — position and animation stay with the caller (`Pitch`).
 */

/** The fixed number of cached sprites; the oldest entry goes first beyond it (FIFO). */
export const KIT_SPRITE_LIMIT = 128;

/** The 2D calls that paint a sprite. A real `CanvasRenderingContext2D` satisfies it. */
export interface KitPaintContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  save(): void;
  restore(): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, start: number, end: number, ccw?: boolean): void;
  clip(): void;
  fill(rule?: CanvasFillRule): void;
  stroke(): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  fillText(text: string, x: number, y: number): void;
  strokeText(text: string, x: number, y: number): void;
}

/**
 * The target a marker is drawn into: the painting calls plus a blit of sprite surface `S`. A real
 * `CanvasRenderingContext2D` satisfies it for `HTMLCanvasElement` sprites.
 */
export interface KitContext<S extends KitCanvas = HTMLCanvasElement> extends KitPaintContext {
  drawImage(image: S, x: number, y: number, width: number, height: number): void;
}

/** An offscreen drawing surface holding one sprite. A real `HTMLCanvasElement` satisfies it. */
export interface KitCanvas {
  width: number;
  height: number;
  getContext(kind: '2d'): KitPaintContext | null;
}

/** Makes a sprite surface of the given device-pixel size; injected by tests. */
export type KitCanvasFactory<S extends KitCanvas = KitCanvas> = (
  width: number,
  height: number,
) => S;

export interface KitDrawOptions {
  /** Device pixels per CSS pixel the target context is scaled by (default 1). */
  dpr?: number;
  /** The readable shirt number, drawn over the sprite. */
  number?: number | string;
  /** Font for the number; its size is derived from the radius when omitted. */
  font?: string;
  /** A side outline stroked around the marker, under the number. */
  outline?: string;
  /** Outline width in CSS pixels (default 1.2, the pitch's existing value). */
  outlineWidth?: number;
}

export interface KitPainter<S extends KitCanvas = HTMLCanvasElement> {
  /**
   * Draw one shirt marker centred at (x, y) in the context's CSS-pixel space. Every state change is
   * made inside save/restore, so nothing leaks to the next marker or side.
   */
  draw(
    ctx: KitContext<S>,
    shirt: ShirtDesign,
    x: number,
    y: number,
    radius: number,
    options?: KitDrawOptions,
  ): void;
  /** Number of cached sprites (at most `KIT_SPRITE_LIMIT`). */
  readonly size: number;
}

/** The Korean names of the shirt patterns, in `SHIRT_PATTERNS` order. */
export const SHIRT_PATTERN_LABELS: Readonly<Record<ShirtPattern, string>> = {
  plain: '단색',
  stripes: '세로 줄무늬',
  hoops: '가로 줄무늬',
  halves: '좌우 반반',
  band: '가슴 띠',
  sash: '대각선 띠',
  checks: '체크',
  chevron: '갈매기 무늬',
  pinstripes: '가는 세로줄',
  quarters: '4분할',
  centre: '가운데 줄',
  panels: '옆구리 배색',
  yoke: '어깨 배색',
  diagonal: '대각선 반반',
};

/** A spoken description of a shirt for an accessible name: pattern, then each colour it shows. */
export function describeShirt(shirt: ShirtDesign): string {
  const parts = [SHIRT_PATTERN_LABELS[shirt.pattern], `주색 ${shirt.primary}`];
  if (shirt.pattern !== 'plain' && shirt.secondary !== undefined)
    parts.push(`보조색 ${shirt.secondary}`);
  if (shirt.trim !== undefined) parts.push(`테두리 ${shirt.trim}`);
  return parts.join(', ');
}

/** Pixel side of the sprite for a marker of `radius` CSS pixels at `dpr`. */
export function spritePixels(radius: number, dpr: number): number {
  return Math.max(1, Math.ceil(radius * 2 * dpr));
}

/**
 * The cache key: every visible style field, the pixel size and the DPR. A plain shirt shows no
 * secondary, so a stray one does not split its entry.
 */
export function spriteKey(shirt: ShirtDesign, pixels: number, dpr: number): string {
  const secondary = shirt.pattern === 'plain' ? '' : (shirt.secondary ?? '');
  return [shirt.pattern, shirt.primary, secondary, shirt.trim ?? '', pixels, dpr].join('|');
}

function browserCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Paint the background of one shirt into a `pixels`-square context, clipped to the marker. */
function paintSprite(c: KitPaintContext, shirt: ShirtDesign, pixels: number) {
  const centre = SHIRT_MARKER_CENTRE * pixels;
  c.save();
  c.beginPath();
  c.arc(centre, centre, centre, 0, Math.PI * 2);
  c.clip();
  c.fillStyle = shirt.primary;
  c.fillRect(0, 0, pixels, pixels);
  const regions = shirtPatternRegions(shirt.pattern);
  if (shirt.secondary !== undefined && regions.length) {
    c.beginPath();
    for (const polygon of regions) {
      polygon.forEach(([px, py], i) =>
        i ? c.lineTo(px * pixels, py * pixels) : c.moveTo(px * pixels, py * pixels),
      );
      c.closePath();
    }
    c.fillStyle = shirt.secondary;
    c.fill();
  }
  if (shirt.trim !== undefined) {
    // The ring between normalized radius SHIRT_TRIM_INNER and 1, over field and pattern.
    c.beginPath();
    c.arc(centre, centre, centre, 0, Math.PI * 2);
    c.moveTo(centre + centre * SHIRT_TRIM_INNER, centre);
    c.arc(centre, centre, centre * SHIRT_TRIM_INNER, 0, Math.PI * 2, true);
    c.fillStyle = shirt.trim;
    c.fill('evenodd');
  }
  c.restore();
}

/**
 * Create a painter with its own sprite cache. Keep one instance per mounted preview or pitch. The
 * factory defaults to a normal DOM canvas, created only when a sprite is first needed.
 */
export function createKitPainter(): KitPainter<HTMLCanvasElement>;
export function createKitPainter<S extends KitCanvas>(
  canvasFactory: KitCanvasFactory<S>,
): KitPainter<S>;
export function createKitPainter(
  canvasFactory: KitCanvasFactory = browserCanvas,
): KitPainter<KitCanvas> {
  const sprites = new Map<string, KitCanvas | null>();

  const sprite = (shirt: ShirtDesign, pixels: number, dpr: number) => {
    const key = spriteKey(shirt, pixels, dpr);
    // FIFO: a hit does not refresh an entry's place.
    if (sprites.has(key)) return sprites.get(key)!;
    const canvas = canvasFactory(pixels, pixels);
    const c = canvas.getContext('2d');
    const made = c ? canvas : null;
    if (c) paintSprite(c, shirt, pixels);
    sprites.set(key, made);
    while (sprites.size > KIT_SPRITE_LIMIT) sprites.delete(sprites.keys().next().value!);
    return made;
  };

  return {
    get size() {
      return sprites.size;
    },
    draw(ctx, shirt, x, y, radius, options = {}) {
      const dpr = options.dpr ?? 1;
      const image = sprite(shirt, spritePixels(radius, dpr), dpr);
      ctx.save();
      if (image) ctx.drawImage(image, x - radius, y - radius, radius * 2, radius * 2);
      else {
        // No offscreen context (exhausted canvas memory): a solid main-colour marker.
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = shirt.primary;
        ctx.fill();
      }
      if (options.outline !== undefined) {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = options.outline;
        ctx.lineWidth = options.outlineWidth ?? 1.2;
        ctx.stroke();
      }
      if (options.number !== undefined) {
        const text = String(options.number);
        const behind = shirtColourAt(shirt, SHIRT_MARKER_CENTRE, SHIRT_MARKER_CENTRE);
        const ink = inkOn(behind);
        ctx.font = options.font ?? `${Math.max(8, radius * 1.1)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (shirt.pattern !== 'plain') {
          // A pattern edge may cross the digits; a halo in the opposite ink keeps them readable.
          ctx.strokeStyle = ink === '#ffffff' ? '#121212' : '#ffffff';
          ctx.lineWidth = Math.max(1.5, radius * 0.22);
          ctx.strokeText(text, x, y);
        }
        ctx.fillStyle = ink;
        ctx.fillText(text, x, y);
      }
      ctx.restore();
    },
  };
}
