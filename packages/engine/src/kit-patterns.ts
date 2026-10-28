/**
 * KIT-3–5, KIT-7, MATCH-36: the one geometry of the eight shirt patterns and the optional trim
 * (spec/ssot/KIT.md), on the tactical marker and on the player figure's torso. Kit selection samples
 * the torso and the painters draw both, so a point gets the same colour everywhere. Pure data and
 * arithmetic: no Canvas, DOM or React.
 *
 * Coordinates are normalized to the shirt's box, 0–1 on both axes, with y growing downward like
 * Canvas (y=0 is the top edge). The marker is the circle inscribed in the box: centre (0.5, 0.5),
 * radius 0.5. The figure torso maps the same unit square onto the shoulders (`FIGURE_TORSO`).
 *
 * Edge convention, the same for every test here: all boundaries are inclusive. A point on a
 * pattern polygon's edge or vertex is inside it and takes the secondary colour; a point at distance
 * 0.5 from the centre is inside the marker; the trim ring includes both its inner (0.84) and outer
 * (1) normalized radius; the torso includes its outline and the sleeve and collar bands their
 * edges, while the head covers its own rim. "On" means within `EDGE_EPSILON`, so float rounding of
 * a boundary point written as a decimal does not flip its colour.
 */
import type { ShirtDesign, ShirtPattern } from '../../contracts/src/identity';

/** A closed polygon of normalized `[x, y]` vertices; the last vertex joins the first. */
export type Polygon = readonly (readonly [number, number])[];

/** Centre of the marker circle in the normalized box. */
export const SHIRT_MARKER_CENTRE = 0.5;
/** Radius of the marker circle inscribed in the normalized box. */
export const SHIRT_MARKER_RADIUS = 0.5;
/** Inner edge of the trim ring as a fraction of the marker radius; the outer edge is 1. */
export const SHIRT_TRIM_INNER = 0.84;
/** Tolerance within which a point counts as lying on an edge or ring boundary (float rounding). */
const EDGE_EPSILON = 1e-9;

const THIRD = 1 / 3;
const TWO_THIRDS = 2 / 3;

function rect(x0: number, y0: number, x1: number, y1: number): Polygon {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

function checkCells(): Polygon[] {
  const edges = [0, THIRD, TWO_THIRDS, 1];
  const cells: Polygon[] = [];
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 3; col++)
      if ((row + col) % 2 === 0)
        cells.push(rect(edges[col]!, edges[row]!, edges[col + 1]!, edges[row + 1]!));
  return cells;
}

function freeze(polygons: Polygon[]): readonly Polygon[] {
  return Object.freeze(
    polygons.map((polygon) =>
      Object.freeze(polygon.map((point) => Object.freeze([point[0], point[1]] as const))),
    ),
  );
}

/** The secondary-colour regions of each pattern, built once at module load. */
const REGIONS: Readonly<Record<ShirtPattern, readonly Polygon[]>> = Object.freeze({
  plain: freeze([]),
  stripes: freeze([rect(0.2, 0, 0.4, 1), rect(0.6, 0, 0.8, 1)]),
  hoops: freeze([rect(0, 0.2, 1, 0.4), rect(0, 0.6, 1, 0.8)]),
  halves: freeze([rect(0.5, 0, 1, 1)]),
  band: freeze([rect(0, 0.35, 1, 0.6)]),
  sash: freeze([
    [
      [0, 0],
      [0.2, 0],
      [1, 0.8],
      [1, 1],
      [0.8, 1],
      [0, 0.2],
    ],
  ]),
  checks: freeze(checkCells()),
  chevron: freeze([
    [
      [0, 0.25],
      [0.5, 0.55],
      [1, 0.25],
      [1, 0.45],
      [0.5, 0.75],
      [0, 0.45],
    ],
  ]),
});

/**
 * The polygons a pattern fills with the shirt's secondary colour over its primary field. The same
 * frozen arrays are returned on every call; `plain` has none.
 */
export function shirtPatternRegions(pattern: ShirtPattern): readonly Polygon[] {
  return REGIONS[pattern];
}

function onSegment(
  x: number,
  y: number,
  [ax, ay]: readonly [number, number],
  [bx, by]: readonly [number, number],
): boolean {
  const dx = bx - ax,
    dy = by - ay;
  const length = Math.hypot(dx, dy);
  if (Math.abs(dx * (y - ay) - dy * (x - ax)) > EDGE_EPSILON * length) return false;
  const along = (x - ax) * dx + (y - ay) * dy;
  return along >= -EDGE_EPSILON * length && along <= length * length + EDGE_EPSILON * length;
}

/** Whether a point is inside a polygon, edges and vertices included (even-odd rule). */
export function insidePolygon(polygon: Polygon, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!,
      b = polygon[j]!;
    if (onSegment(x, y, a, b)) return true;
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0])
      inside = !inside;
  }
  return inside;
}

function normalizedRadius(x: number, y: number): number {
  return Math.hypot(x - SHIRT_MARKER_CENTRE, y - SHIRT_MARKER_CENTRE) / SHIRT_MARKER_RADIUS;
}

/** Whether a point lies in the visible marker circle, its rim included. */
export function insideShirtMarker(x: number, y: number): boolean {
  return normalizedRadius(x, y) <= 1 + EDGE_EPSILON;
}

/** Whether a point lies in the trim ring, normalized radius 0.84–1 inclusive. */
export function insideShirtTrim(x: number, y: number): boolean {
  const r = normalizedRadius(x, y);
  return r >= SHIRT_TRIM_INNER - EDGE_EPSILON && r <= 1 + EDGE_EPSILON;
}

/** Secondary inside a pattern polygon, else the primary field. */
function patternColourAt(shirt: ShirtDesign, x: number, y: number): string {
  const secondary = shirt.secondary;
  if (secondary !== undefined)
    for (const polygon of REGIONS[shirt.pattern])
      if (insidePolygon(polygon, x, y)) return secondary;
  return shirt.primary;
}

/**
 * The colour a shirt shows at a normalized point: trim on the ring when the shirt has one (applied
 * last, over everything), else secondary inside a pattern polygon, else the primary field. Returns
 * the design's own colour string unchanged. Outside the marker circle it answers for the unclipped
 * box; callers that need the visible shirt test `insideShirtMarker` first.
 */
export function shirtColourAt(shirt: ShirtDesign, x: number, y: number): string {
  if (shirt.trim !== undefined && insideShirtTrim(x, y)) return shirt.trim;
  return patternColourAt(shirt, x, y);
}

/**
 * The torso of a top-down player figure (MATCH-36), seen from directly above. Its unit square runs x
 * across the shoulders from the player's left (0) to his right (1) and y from the chest (0) to the
 * back (1); the shoulders are `aspect` times as wide as they are deep. Each length names its unit:
 * - `cornerRadius`: of the depth, so `cornerRadius / aspect` across and `cornerRadius` deep;
 * - `sleeveTrim`: of the width, the trim band at each shoulder end;
 * - `head.r`: of the width, a circle on the body, so `r` across and `r * aspect` deep;
 * - `collar.rx` across and `collar.ry` deep in their own axes, the ellipse around the head; its trim
 *   band is `collar.band` of the width wide, inside the ellipse.
 * The head hides the shirt under it; the collar band is the ring the head leaves showing.
 */
export const FIGURE_TORSO = Object.freeze({
  aspect: 2.5,
  cornerRadius: 0.45,
  sleeveTrim: 0.07,
  collar: Object.freeze({ cx: 0.5, cy: 0.42, rx: 0.25, ry: 0.625, band: 0.05 }),
  head: Object.freeze({ cx: 0.5, cy: 0.42, r: 0.2 }),
});

/** A point's normalized radius in an axis-aligned ellipse: 1 on its outline. */
function ellipseRadius(x: number, y: number, cx: number, cy: number, rx: number, ry: number) {
  return Math.hypot((x - cx) / rx, (y - cy) / ry);
}

/**
 * Whether a torso point shows its shirt from above: inside the rounded rectangle, outline included,
 * and outside the head circle, whose rim the head covers.
 */
export function insideFigureTorso(x: number, y: number): boolean {
  const { aspect, cornerRadius, head } = FIGURE_TORSO;
  if (x < -EDGE_EPSILON || x > 1 + EDGE_EPSILON || y < -EDGE_EPSILON || y > 1 + EDGE_EPSILON)
    return false;
  // Past a corner's centre, the point must lie within that corner's quarter ellipse.
  const rx = cornerRadius / aspect,
    ry = cornerRadius;
  const dx = Math.max(rx - x, 0, x - (1 - rx)),
    dy = Math.max(ry - y, 0, y - (1 - ry));
  if (Math.hypot(dx / rx, dy / ry) > 1 + EDGE_EPSILON) return false;
  return ellipseRadius(x, y, head.cx, head.cy, head.r, head.r * aspect) > 1 + EDGE_EPSILON;
}

/** Whether a torso point lies on a sleeve band or the collar band, their edges included. */
export function insideFigureTrim(x: number, y: number): boolean {
  const { aspect, sleeveTrim, collar } = FIGURE_TORSO;
  if (x <= sleeveTrim + EDGE_EPSILON || x >= 1 - sleeveTrim - EDGE_EPSILON) return true;
  const { cx, cy, rx, ry, band } = collar;
  return (
    ellipseRadius(x, y, cx, cy, rx, ry) <= 1 + EDGE_EPSILON &&
    ellipseRadius(x, y, cx, cy, rx - band, ry - band * aspect) >= 1 - EDGE_EPSILON
  );
}

/**
 * The colour a shirt shows at a torso point: trim on the sleeve and collar bands when the shirt has
 * one, else the pattern colour of `shirtPatternRegions` in the same unit square. Returns the
 * design's own colour string unchanged. Outside the visible torso it answers for the unclipped
 * square; callers that need what is seen test `insideFigureTorso` first.
 */
export function figureShirtColourAt(shirt: ShirtDesign, x: number, y: number): string {
  if (shirt.trim !== undefined && insideFigureTrim(x, y)) return shirt.trim;
  return patternColourAt(shirt, x, y);
}
