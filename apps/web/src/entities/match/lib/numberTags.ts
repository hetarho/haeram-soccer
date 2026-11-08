/**
 * MATCH-36, WEB-95: every player figure's number tag (spec/ssot/MATCH.md). A tag never turns with
 * the body: it stays centred at twelve o'clock above its figure, even in a crowd. Placement is a
 * value of its arguments alone, so the same frame always gets the same tags. Pure layout plus one
 * small drawing call: no React, DOM or engine imports.
 */

export interface NumberTagInput {
  id: string;
  number: number | string;
  /** The figure's centre, CSS px. */
  x: number;
  y: number;
  /**
   * The player marker's radius, CSS px (the painter's `radius`). Every plate is sized from it alone,
   * the carrier's included (WEB-95).
   */
  radius: number;
}

/** A placed tag: its text and its upright box centred at (x, y) in CSS px. */
export interface NumberTag {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Font size, CSS px. */
  size: number;
}

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
  reach: 2,
  /** The minimum gap kept between a tag and its figure. */
  gap: 2,
});

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
 * Place every tag directly above its figure, returned in input order. The top edge stays on the
 * canvas; neighbours and the ball never move a tag to another side of its player.
 */
export function placeNumberTags(inputs: readonly NumberTagInput[]): NumberTag[] {
  return inputs.map((figure) => {
    const { text, size, width, height } = numberTagSize(figure);
    const reach = figure.radius * TAG_CONFIG.reach + TAG_CONFIG.gap;
    return {
      id: figure.id,
      text,
      x: figure.x,
      y: Math.max(height / 2, figure.y - reach - height / 2),
      width,
      height,
      size,
    };
  });
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
