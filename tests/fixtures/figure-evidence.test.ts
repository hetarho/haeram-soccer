import { describe, expect, it } from 'vitest';
import type { ShirtDesign } from '../../packages/contracts/src/identity';
import {
  FIGURE_TORSO,
  figureShirtColourAt,
  insideFigureTorso,
} from '../../packages/engine/src/kit-patterns';
import { FIGURE_SCALE } from '../../apps/web/src/ui/figurePainting';
import { markerRadius } from '../../apps/web/src/ui/pitchPainting';
import {
  colourArea,
  liveTorso,
  torsoShare,
  wornFigures,
  type CanvasImage,
} from './figure-evidence';

const STRIPES: ShirtDesign = { pattern: 'stripes', primary: '#ff00ff', secondary: '#00e5ff' };
const CHECKS: ShirtDesign = { pattern: 'checks', primary: '#ffd400', secondary: '#3d2bff' };
/** The continuity journey's worn away shirt: hoops trimmed in their second colour. */
const HOOPS: ShirtDesign = {
  pattern: 'hoops',
  primary: '#FFD100',
  secondary: '#C8102E',
  trim: '#C8102E',
};
const KEEPER: ShirtDesign = { pattern: 'plain', primary: '#00ffcc' };
const GROUND = '#253b31';
const SKIN = '#cf9670';
/** A phone's pitch: laid out narrower than `markerRadius`'s 6 px floor, drawn at DPR 2. */
const CSS_WIDTH = 180;
const DPR = 2;

interface Body {
  x: number;
  y: number;
  /** The turn of the shoulders, radians, as the evidence fits it. */
  turn: number;
  shirt: ShirtDesign;
  shorts: string;
  socks: string;
  /** How far the feet stride out in front and behind, torso widths. */
  stride: number;
  /** Only the torso and head: no sleeve, shorts or sock shows. */
  bare?: true;
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i]! - v) * t);
/** The pitch's medium-detail torso treatment: the shaded back and the near shoulder's highlight. */
const SHADE = 0x21 / 255;
const HIGHLIGHT = 0x1c / 255;

/**
 * The colour a body shows at body-frame point (a, b), torso widths across the shoulders and from
 * the chest back, or undefined off the body: socks and shorts in the stride, sleeves at the
 * shoulders in the primary, the torso by the shared geometry with its shading, the head over it.
 */
function bodyColour(body: Body, a: number, b: number): number[] | undefined {
  const deep = 1 / FIGURE_TORSO.aspect;
  const u = a + 0.5,
    v = b / deep + 0.5;
  const { head } = FIGURE_TORSO;
  if (Math.hypot(u - head.cx, (v - head.cy) * deep) <= head.r) return rgb(SKIN);
  if (u >= 0 && u <= 1 && v >= 0 && v <= 1 && insideFigureTorso(u, v)) {
    let colour = rgb(figureShirtColourAt(body.shirt, u, v));
    if (v > 0.62) colour = mix(colour, [0, 0, 0], SHADE);
    if (Math.hypot((u - 0.3) / 0.2, (v - 0.32) / 0.24) <= 1)
      colour = mix(colour, [255, 255, 255], HIGHLIGHT);
    return colour;
  }
  if (body.bare) return undefined;
  // Sleeves just past each shoulder end, on the side of the chest.
  if (Math.abs(a) > 0.5 && Math.abs(a) <= 0.62 && Math.abs(b + 0.02) <= 0.105)
    return rgb(body.shirt.primary);
  // One leg strides forward on the left, the other back on the right.
  for (const side of [-1, 1]) {
    const along = side * b;
    if (Math.abs(a - side * 0.12) > 0.135 || along < 0) continue;
    if (along <= 0.15 + 0.15 * body.stride) return rgb(body.shorts);
    if (Math.abs(a - side * 0.12) <= 0.08 && along <= 0.25 + 0.3 * body.stride)
      return rgb(body.socks);
  }
  return undefined;
}

/**
 * A Canvas frame of `bodies` on plain grass, laid out `cssWidth` × `cssHeight` at `DPR`, each
 * pixel 4×4 supersampled like edge smoothing.
 */
function scene(bodies: readonly Body[], cssWidth = CSS_WIDTH, cssHeight = 96): CanvasImage {
  const width = cssWidth * DPR,
    height = cssHeight * DPR;
  const image: CanvasImage = {
    width,
    height,
    cssWidth,
    data: new Uint8ClampedArray(width * height * 4),
  };
  const across = liveTorso(image).across;
  const data = image.data as Uint8ClampedArray;
  const ground = rgb(GROUND);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const sum = [0, 0, 0];
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const px = x + (sx + 0.5) / 4,
            py = y + (sy + 0.5) / 4;
          let colour = ground;
          for (const body of bodies) {
            const dx = px - body.x,
              dy = py - body.y;
            if (Math.hypot(dx, dy) > across * 1.2) continue;
            const c = Math.cos(body.turn),
              s = Math.sin(body.turn);
            colour =
              bodyColour(body, (dx * c + dy * s) / across, (-dx * s + dy * c) / across) ?? colour;
          }
          for (let k = 0; k < 3; k++) sum[k]! += colour[k]!;
        }
      for (let k = 0; k < 3; k++) data[(y * width + x) * 4 + k] = Math.round(sum[k]! / 16);
      data[(y * width + x) * 4 + 3] = 255;
    }
  return image;
}

/** A kit by the starting rule (→KIT-3): shorts in the second colour, socks in the base. */
const outfield = (shirt: ShirtDesign, x: number, y: number, turn: number, stride = 0): Body => ({
  x,
  y,
  turn,
  shirt,
  shorts: shirt.secondary ?? shirt.primary,
  socks: shirt.primary,
  stride,
});

const BODIES: Body[] = [
  outfield(STRIPES, 30, 30, 0),
  outfield(STRIPES, 80, 34, 0.7, 1),
  outfield(STRIPES, 130, 28, 2.4, 0.5),
  outfield(STRIPES, 180, 36, 4.1, 1),
  outfield(CHECKS, 40, 90, 0.3, 1),
  outfield(CHECKS, 100, 96, 3.3),
  outfield(CHECKS, 160, 88, 5.2, 0.6),
  outfield(HOOPS, 230, 60, 1.2, 1),
  outfield(HOOPS, 280, 120, 3.9),
  outfield(HOOPS, 320, 40, 5.8, 0.4),
  {
    x: 240,
    y: 150,
    turn: 1.9,
    shirt: KEEPER,
    shorts: KEEPER.primary,
    socks: KEEPER.primary,
    stride: 0.4,
  },
];
const IMAGE = scene(BODIES);

describe('figure kit evidence (→MATCH-36, KIT-3/8)', () => {
  it('sizes the torso as the pitch paints it: 85% of the marker diameter, in device pixels', () => {
    const { across, deep } = liveTorso(IMAGE);
    expect(across).toBeCloseTo(2 * markerRadius(CSS_WIDTH) * FIGURE_SCALE.torso * DPR, 9);
    expect(across).toBeCloseTo(20.4, 9);
    expect(deep).toBeCloseTo(across / FIGURE_TORSO.aspect, 9);
    // A wider pitch grows its markers, and its torsos with them.
    expect(liveTorso({ ...IMAGE, cssWidth: 1000, width: 2000 }).across).toBeCloseTo(
      2 * 11 * 0.85 * 2,
      9,
    );
  });

  it('counts the figures wearing each shirt in its own pattern, and none in another', () => {
    expect(wornFigures(IMAGE, STRIPES)).toBe(4);
    expect(wornFigures(IMAGE, CHECKS)).toBe(3);
    expect(wornFigures(IMAGE, HOOPS)).toBe(3);
    // The same colours in another pattern's regions fit nobody.
    expect(wornFigures(IMAGE, { ...STRIPES, pattern: 'hoops' })).toBe(0);
    expect(wornFigures(IMAGE, { ...CHECKS, pattern: 'stripes' })).toBe(0);
    expect(wornFigures(IMAGE, { ...HOOPS, pattern: 'stripes' })).toBe(0);
    // Nor do the same colours swapped in a design the hooped side left out, or another colour in
    // the worn pattern.
    expect(
      wornFigures(IMAGE, { pattern: 'checks', primary: '#C8102E', secondary: '#FFD100' }),
    ).toBe(0);
    expect(wornFigures(IMAGE, { ...HOOPS, primary: '#1B2A49', secondary: '#E0218A' })).toBe(0);
    // Read as if each torso spanned its whole marker, as before MATCH-36's 85%, the same pixels
    // lose hooped figures: the evidence fits the size the pitch paints.
    const fullMarker = { ...IMAGE, cssWidth: CSS_WIDTH * FIGURE_SCALE.torso };
    expect(liveTorso(fullMarker).across).toBeCloseTo(2 * markerRadius(CSS_WIDTH) * DPR, 1);
    expect(wornFigures(fullMarker, HOOPS)).toBeLessThan(3);
  });

  it('measures a colour on the Canvas against a torso share from the geometry', () => {
    const torso = liveTorso(IMAGE);
    // The torso shows its shirt outside the head: about five eighths of its box.
    const shown = torsoShare(IMAGE, KEEPER, KEEPER.primary) / (torso.across * torso.deep);
    expect(shown).toBeGreaterThan(0.55);
    expect(shown).toBeLessThan(0.7);
    // Hoops wear their base colour on three of five bands, less the head and the trimmed sleeves.
    const base = torsoShare(IMAGE, HOOPS, HOOPS.primary);
    expect(base).toBeGreaterThan(0.25 * torso.across * torso.deep);
    expect(base).toBeLessThan(0.4 * torso.across * torso.deep);
    // One keeper in a one-colour kit shows more than half his torso's share of it; three hooped
    // figures with their socks show more than one torso's share of their base colour.
    expect(colourArea(IMAGE, KEEPER.primary)).toBeGreaterThan(
      torsoShare(IMAGE, KEEPER, KEEPER.primary) / 2,
    );
    expect(colourArea(IMAGE, HOOPS.primary)).toBeGreaterThan(base);
  });

  it('counts a colour through the shading, so a keeper’s torso alone shows half its share', () => {
    const keeper: Body = { ...BODIES.at(-1)!, x: 40, y: 40, bare: true };
    const image = scene([keeper], 40, 40);
    expect(liveTorso(image)).toEqual(liveTorso(IMAGE));
    const least = torsoShare(image, KEEPER, KEEPER.primary) / 2;
    expect(colourArea(image, KEEPER.primary)).toBeGreaterThanOrEqual(least);
    // The shaded back sits 42 away from this keeper's colour: a tighter tolerance loses it.
    expect(colourArea(image, KEEPER.primary, 40)).toBeLessThan(
      colourArea(image, KEEPER.primary) * 0.8,
    );
  });
});
