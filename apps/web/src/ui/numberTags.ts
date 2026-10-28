/**
 * MATCH-36, WEB-95: every player figure's number tag (spec/ssot/MATCH.md). A tag never turns with
 * the body: it sits upright at one of eight fixed offsets around its figure, the one that covers
 * least of the other tags, the other figures, the ball and the carrier cue. Placement is a value of
 * its arguments alone, so the same frame always gets the same tags. Pure layout plus one small
 * drawing call: no React, DOM or engine imports.
 */

export interface NumberTagInput {
  id: string;
  number: number | string;
  /** The figure's centre, CSS px. */
  x: number;
  y: number;
  /** Half the figure's torso width, CSS px (the painter's `radius`). */
  radius: number;
}

export interface NumberTagBounds {
  /** The drawing area, CSS px from (0, 0). */
  width: number;
  height: number;
  /** Circles to keep clear, [x, y, radius] in CSS px: the ball and the carrier cue. */
  avoid: readonly (readonly [number, number, number])[];
}

/** A placed tag: its text, its upright box centred at (x, y) in CSS px and the offset chosen. */
export interface NumberTag {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Font size, CSS px. */
  size: number;
  /** Index into `TAG_OFFSETS`. */
  offset: number;
}

const D = Math.SQRT1_2;
/**
 * The eight screen directions a tag may sit in, in order of preference: the diagonals below and
 * above, then straight below, to the sides and above (the carrier cue's pointer sits above).
 */
export const TAG_OFFSETS: readonly (readonly [number, number])[] = Object.freeze(
  (
    [
      [D, D],
      [-D, D],
      [D, -D],
      [-D, -D],
      [0, 1],
      [1, 0],
      [-1, 0],
      [0, -1],
    ] as const
  ).map((offset) => Object.freeze(offset)),
);

/** Every number a tag is sized and placed with; lengths in CSS px unless named otherwise. */
export const TAG_CONFIG = Object.freeze({
  /** Font size per px of figure radius, kept within `minFont`–`maxFont`. */
  fontScale: 1,
  minFont: 9,
  maxFont: 16,
  /** Space around the digits, of the font size; a digit's advance, of the font size. */
  padding: 0.22,
  digit: 0.62,
  /** How far the tag's nearest point sits from its figure's centre, of the radius. */
  reach: 1.1,
  /** The minimum gap kept between a tag and its figure or anything it avoids. */
  gap: 2,
  /** Another figure's footprint, of its radius: the torso with the limbs close to it. */
  body: 1.25,
  /** What a covered px² costs: another tag, an avoided circle, another figure, off the area. */
  weights: Object.freeze({ tag: 8, avoid: 6, figure: 3, outside: 10 }),
  /** What each step down the preference order costs, px². */
  order: 0.5,
});

type Box = readonly [number, number, number, number];

const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) *
  Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
const grow = (b: Box, by: number): Box => [b[0] - by, b[1] - by, b[2] + by, b[3] + by];
/** A circle as the square of equal area, centred on it. */
const disc = (x: number, y: number, r: number): Box => {
  const h = (r * Math.sqrt(Math.PI)) / 2;
  return [x - h, y - h, x + h, y + h];
};
const clamp = (v: number, low: number, high: number) => Math.min(Math.max(v, low), high);

/** The tag size for one figure: font px and the box around its digits, whole px. */
export function numberTagSize(input: Pick<NumberTagInput, 'number' | 'radius'>) {
  const text = String(input.number);
  const size = clamp(input.radius * TAG_CONFIG.fontScale, TAG_CONFIG.minFont, TAG_CONFIG.maxFont);
  const pad = size * TAG_CONFIG.padding;
  const height = Math.ceil(size + pad * 2);
  return {
    text,
    size,
    height,
    width: Math.max(height, Math.ceil(text.length * size * TAG_CONFIG.digit + pad * 2)),
  };
}

/**
 * Place every figure's tag, returned in input order. Figures are taken in ID order, so the result
 * does not depend on the input order; each takes the offset whose box costs least by
 * `TAG_CONFIG.weights` against the tags placed before it, the other figures and `avoid`, earlier
 * offsets winning ties, and is then kept inside the area on whole pixels.
 */
export function placeNumberTags(
  inputs: readonly NumberTagInput[],
  bounds: NumberTagBounds,
): NumberTag[] {
  const { gap, weights } = TAG_CONFIG;
  const area: Box = [0, 0, bounds.width, bounds.height];
  const bodies = inputs.map((f) => disc(f.x, f.y, f.radius * TAG_CONFIG.body));
  const avoid = bounds.avoid.map(([x, y, r]) => disc(x, y, r + gap));
  const order = inputs
    .map((_, i) => i)
    .sort((a, b) => {
      const p = inputs[a]!.id,
        q = inputs[b]!.id;
      return p < q ? -1 : p > q ? 1 : a - b;
    });
  const placed: Box[] = [];
  const tags: NumberTag[] = new Array<NumberTag>(inputs.length);
  for (const i of order) {
    const figure = inputs[i]!;
    const { text, size, width, height } = numberTagSize(figure);
    const reach = figure.radius * TAG_CONFIG.reach + gap;
    let best = 0,
      bestCost = Infinity,
      bestBox: Box = area;
    TAG_OFFSETS.forEach(([dx, dy], k) => {
      const cx = figure.x + dx * reach + Math.sign(dx) * (width / 2);
      const cy = figure.y + dy * reach + Math.sign(dy) * (height / 2);
      const box: Box = [cx - width / 2, cy - height / 2, cx + width / 2, cy + height / 2];
      const spaced = grow(box, gap / 2);
      let cost = k * TAG_CONFIG.order;
      cost += (width * height - overlap(box, area)) * weights.outside;
      for (const other of placed) cost += overlap(spaced, grow(other, gap / 2)) * weights.tag;
      for (const circle of avoid) cost += overlap(box, circle) * weights.avoid;
      bodies.forEach((body, j) => {
        if (j !== i) cost += overlap(box, body) * weights.figure;
      });
      if (cost < bestCost) {
        best = k;
        bestCost = cost;
        bestBox = box;
      }
    });
    const left = clamp(Math.round(bestBox[0]), 0, Math.max(0, bounds.width - width));
    const top = clamp(Math.round(bestBox[1]), 0, Math.max(0, bounds.height - height));
    placed.push([left, top, left + width, top + height]);
    tags[i] = {
      id: figure.id,
      text,
      x: left + width / 2,
      y: top + height / 2,
      width,
      height,
      size,
      offset: best,
    };
  }
  return tags;
}

/** The 2D calls a tag is drawn with. A real `CanvasRenderingContext2D` satisfies it. */
export interface NumberTagContext {
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
  arc(x: number, y: number, radius: number, start: number, end: number): void;
  fill(): void;
  stroke(): void;
  fillText(text: string, x: number, y: number): void;
}

/** How a tag looks: its font family, its backplate and the ink of its digits and edge. */
export interface NumberTagStyle {
  family: string;
  plate: string;
  ink: string;
}

/**
 * The tag style of a pitch skin (WEB-91): the plate in the marker outline, chosen to stand out on
 * that theme's ground, and the digits in the ground colour, so every theme keeps them readable.
 */
export function numberTagStyle(
  skin: { markerOutline: string; ground: string },
  family: string,
): NumberTagStyle {
  return { family, plate: skin.markerOutline, ink: skin.ground };
}

/** Draw one placed tag upright: a rounded plate with a thin edge and the number centred on it. */
export function drawNumberTag(ctx: NumberTagContext, tag: NumberTag, style: NumberTagStyle) {
  const left = tag.x - tag.width / 2,
    top = tag.y - tag.height / 2,
    right = left + tag.width,
    bottom = top + tag.height;
  const r = Math.min(3, tag.height / 4);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(left + r, top);
  ctx.lineTo(right - r, top);
  ctx.arc(right - r, top + r, r, -Math.PI / 2, 0);
  ctx.lineTo(right, bottom - r);
  ctx.arc(right - r, bottom - r, r, 0, Math.PI / 2);
  ctx.lineTo(left + r, bottom);
  ctx.arc(left + r, bottom - r, r, Math.PI / 2, Math.PI);
  ctx.lineTo(left, top + r);
  ctx.arc(left + r, top + r, r, Math.PI, Math.PI * 1.5);
  ctx.closePath();
  ctx.fillStyle = style.plate;
  ctx.fill();
  ctx.strokeStyle = style.ink;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.font = `700 ${tag.size}px ${style.family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = style.ink;
  ctx.fillText(tag.text, tag.x, tag.y);
  ctx.restore();
}
