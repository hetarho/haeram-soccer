import { describe, it, expect } from 'vitest';
import { SHIRT_PATTERNS } from '../../contracts/src/identity';
import type { ShirtDesign, ShirtPattern } from '../../contracts/src/identity';
import {
  FIGURE_TORSO,
  SHIRT_MARKER_RADIUS,
  SHIRT_TRIM_INNER,
  figureShirtColourAt,
  insideFigureTorso,
  insideFigureTrim,
  insidePolygon,
  insideShirtMarker,
  insideShirtTrim,
  shirtColourAt,
  shirtPatternRegions,
} from './kit-patterns';

const PRIMARY = '#d62828',
  SECONDARY = '#ffffff',
  TRIM = '#0b1f44';
const shirt = (pattern: ShirtPattern, trim?: string): ShirtDesign =>
  pattern === 'plain'
    ? { pattern, primary: PRIMARY, ...(trim ? { trim } : {}) }
    : { pattern, primary: PRIMARY, secondary: SECONDARY, ...(trim ? { trim } : {}) };

/** The shirt sampled at the centres of an n×n grid, one row per string: `.` primary, `#` secondary, `T` trim. */
function grid(design: ShirtDesign, n: number): string[] {
  const glyph: Record<string, string> = {
    [design.primary]: '.',
    ...(design.secondary ? { [design.secondary]: '#' } : {}),
    ...(design.trim ? { [design.trim]: 'T' } : {}),
  };
  return Array.from({ length: n }, (_, row) =>
    Array.from(
      { length: n },
      (_, col) => glyph[shirtColourAt(design, (col + 0.5) / n, (row + 0.5) / n)],
    ).join(''),
  );
}

/** Every visible colour of a shirt on a 16×16 cell-centre sample inside the marker. */
function visibleColours(design: ShirtDesign): Set<string> {
  const seen = new Set<string>();
  for (let row = 0; row < 16; row++)
    for (let col = 0; col < 16; col++) {
      const x = (col + 0.5) / 16,
        y = (row + 0.5) / 16;
      if (insideShirtMarker(x, y)) seen.add(shirtColourAt(design, x, y));
    }
  return seen;
}

describe('shirt pattern regions', () => {
  it('each named pattern occupies its broad regions on a 5×5 grid', () => {
    const expected: Record<ShirtPattern, string[]> = {
      plain: ['.....', '.....', '.....', '.....', '.....'],
      stripes: ['.#.#.', '.#.#.', '.#.#.', '.#.#.', '.#.#.'],
      hoops: ['.....', '#####', '.....', '#####', '.....'],
      halves: ['..###', '..###', '..###', '..###', '..###'],
      band: ['.....', '.....', '#####', '.....', '.....'],
      sash: ['##...', '###..', '.###.', '..###', '...##'],
      checks: ['##.##', '##.##', '..#..', '##.##', '##.##'],
      chevron: ['.....', '.....', '##.##', '..#..', '.....'],
    };
    for (const pattern of SHIRT_PATTERNS)
      expect({ pattern, grid: grid(shirt(pattern), 5) }).toEqual({
        pattern,
        grid: expected[pattern],
      });
  });

  it('checks alternate on a readable 3×3 grid, filled at the top left', () => {
    expect(grid(shirt('checks'), 3)).toEqual(['#.#', '.#.', '#.#']);
    expect(shirtPatternRegions('checks')).toHaveLength(5);
  });

  it('plain has no secondary polygons and ignores a stray secondary', () => {
    expect(shirtPatternRegions('plain')).toEqual([]);
    const stray: ShirtDesign = { pattern: 'plain', primary: PRIMARY, secondary: SECONDARY };
    expect(grid(stray, 4).join('')).toBe('.'.repeat(16));
  });

  it('includes points on region edges and vertices, excludes points just past them', () => {
    const cases: [ShirtPattern, number, number, string][] = [
      ['stripes', 0.2, 0.5, SECONDARY],
      ['stripes', 0.4, 0.5, SECONDARY],
      ['stripes', 0.19, 0.5, PRIMARY],
      ['stripes', 0.41, 0.5, PRIMARY],
      ['stripes', 0.8, 0, SECONDARY],
      ['hoops', 0.5, 0.6, SECONDARY],
      ['hoops', 0.5, 0.81, PRIMARY],
      ['halves', 0.5, 0.5, SECONDARY],
      ['halves', 0.49, 0.5, PRIMARY],
      ['band', 0.1, 0.35, SECONDARY],
      ['band', 0.1, 0.6, SECONDARY],
      ['band', 0.1, 0.34, PRIMARY],
      ['band', 0.1, 0.61, PRIMARY],
      ['sash', 0, 0, SECONDARY],
      ['sash', 0.6, 0.4, SECONDARY],
      ['sash', 0.6, 0.39, PRIMARY],
      ['sash', 0.4, 0.6, SECONDARY],
      ['sash', 0.4, 0.61, PRIMARY],
      ['checks', 1 / 3, 0.1, SECONDARY],
      ['checks', 0.34, 0.1, PRIMARY],
      ['checks', 0.5, 1 / 3, SECONDARY],
      ['checks', 0.5, 0.32, PRIMARY],
      ['chevron', 0.5, 0.55, SECONDARY],
      ['chevron', 0.5, 0.54, PRIMARY],
      ['chevron', 0.5, 0.75, SECONDARY],
      ['chevron', 0.5, 0.76, PRIMARY],
      ['chevron', 0, 0.25, SECONDARY],
      ['chevron', 0.25, 0.4, SECONDARY],
    ];
    for (const [pattern, x, y, colour] of cases)
      expect({ pattern, x, y, colour: shirtColourAt(shirt(pattern), x, y) }).toEqual({
        pattern,
        x,
        y,
        colour,
      });
  });

  it('the sash runs top-left to bottom-right and the chevron points down', () => {
    const sash = shirt('sash');
    expect(shirtColourAt(sash, 0.1, 0.1)).toBe(SECONDARY);
    expect(shirtColourAt(sash, 0.9, 0.9)).toBe(SECONDARY);
    expect(shirtColourAt(sash, 0.9, 0.1)).toBe(PRIMARY); // its left–right mirror would be filled
    expect(shirtColourAt(sash, 0.1, 0.9)).toBe(PRIMARY);
    const chevron = shirt('chevron');
    expect(shirtColourAt(chevron, 0.5, 0.65)).toBe(SECONDARY);
    expect(shirtColourAt(chevron, 0.5, 0.35)).toBe(PRIMARY); // its up–down mirror would be filled
    expect(shirtColourAt(chevron, 0.05, 0.35)).toBe(SECONDARY);
    expect(shirtColourAt(chevron, 0.05, 0.65)).toBe(PRIMARY);
  });

  it('hands out the same frozen geometry on every call', () => {
    for (const pattern of SHIRT_PATTERNS) {
      const regions = shirtPatternRegions(pattern);
      expect(shirtPatternRegions(pattern)).toBe(regions);
      expect(Object.isFrozen(regions)).toBe(true);
      for (const polygon of regions) {
        expect(Object.isFrozen(polygon)).toBe(true);
        for (const [x, y] of polygon) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(1);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(1);
        }
      }
    }
    expect(shirtPatternRegions('sash')[0]).toEqual([
      [0, 0],
      [0.2, 0],
      [1, 0.8],
      [1, 1],
      [0.8, 1],
      [0, 0.2],
    ]);
  });

  it('polygon membership agrees with shirtColourAt for every pattern', () => {
    for (const pattern of SHIRT_PATTERNS)
      for (let row = 0; row <= 20; row++)
        for (let col = 0; col <= 20; col++) {
          const x = col / 20,
            y = row / 20;
          const inside = shirtPatternRegions(pattern).some((p) => insidePolygon(p, x, y));
          expect(shirtColourAt(shirt(pattern), x, y)).toBe(inside ? SECONDARY : PRIMARY);
        }
  });
});

describe('marker circle and trim', () => {
  it('the marker is the inscribed circle, its rim included', () => {
    expect(SHIRT_MARKER_RADIUS).toBe(0.5);
    expect(insideShirtMarker(0.5, 0.5)).toBe(true);
    expect(insideShirtMarker(0, 0.5)).toBe(true);
    expect(insideShirtMarker(0.5, 1)).toBe(true);
    expect(insideShirtMarker(0.1, 0.1)).toBe(false);
    expect(insideShirtMarker(1, 1)).toBe(false);
  });

  it('trim fills the ring of normalized radius 0.84–1 and is applied last', () => {
    expect(SHIRT_TRIM_INNER).toBe(0.84);
    const halves = shirt('halves', TRIM);
    expect(shirtColourAt(halves, 1, 0.5)).toBe(TRIM); // over the secondary half
    expect(shirtColourAt(halves, 0, 0.5)).toBe(TRIM); // over the primary field
    expect(shirtColourAt(halves, 0.5, 0.08)).toBe(TRIM); // inner edge, r = 0.84
    expect(shirtColourAt(halves, 0.5, 0.09)).toBe(SECONDARY); // r = 0.82
    expect(shirtColourAt(halves, 0.4, 0.5)).toBe(PRIMARY);
    expect(shirtColourAt(shirt('halves'), 1, 0.5)).toBe(SECONDARY); // no trim, no ring
    expect(grid(shirt('plain', TRIM), 5)).toEqual(['.T.T.', 'T...T', '.....', 'T...T', '.T.T.']);
  });

  it('the trim colour is exactly the same ring for every pattern', () => {
    for (const pattern of SHIRT_PATTERNS) {
      const design = shirt(pattern, TRIM);
      for (let row = 0; row < 40; row++)
        for (let col = 0; col < 40; col++) {
          const x = (col + 0.5) / 40,
            y = (row + 0.5) / 40;
          const r = Math.hypot(x - 0.5, y - 0.5) / SHIRT_MARKER_RADIUS;
          const ring = r >= SHIRT_TRIM_INNER && r <= 1;
          expect(insideShirtTrim(x, y)).toBe(ring);
          expect(shirtColourAt(design, x, y) === TRIM).toBe(ring);
          if (!ring) expect(shirtColourAt(design, x, y)).toBe(shirtColourAt(shirt(pattern), x, y));
        }
    }
  });
});

describe('colours', () => {
  it('one-, two- and three-colour designs show exactly their colours inside the marker', () => {
    expect(visibleColours(shirt('plain'))).toEqual(new Set([PRIMARY]));
    expect(visibleColours(shirt('plain', TRIM))).toEqual(new Set([PRIMARY, TRIM]));
    for (const pattern of SHIRT_PATTERNS.filter((p) => p !== 'plain')) {
      expect(visibleColours(shirt(pattern))).toEqual(new Set([PRIMARY, SECONDARY]));
      expect(visibleColours(shirt(pattern, TRIM))).toEqual(new Set([PRIMARY, SECONDARY, TRIM]));
    }
  });

  it("returns the caller's own colour spelling", () => {
    const custom: ShirtDesign = {
      pattern: 'stripes',
      primary: '#AbCdEf',
      secondary: '#0A0b0C',
      trim: '#FFFFFF',
    };
    expect(shirtColourAt(custom, 0.1, 0.5)).toBe('#AbCdEf');
    expect(shirtColourAt(custom, 0.3, 0.5)).toBe('#0A0b0C');
    expect(shirtColourAt(custom, 0.5, 0)).toBe('#FFFFFF');
  });

  it('a shirt whose primary equals its secondary still shows one colour', () => {
    const same: ShirtDesign = { pattern: 'checks', primary: '#121212', secondary: '#121212' };
    expect(visibleColours(same)).toEqual(new Set(['#121212']));
  });
});

/** The figure torso sampled at the centres of an n×n grid: ` ` hidden, else as `grid`. */
function torso(design: ShirtDesign, n: number): string[] {
  const glyph: Record<string, string> = {
    [design.primary]: '.',
    ...(design.secondary ? { [design.secondary]: '#' } : {}),
    ...(design.trim ? { [design.trim]: 'T' } : {}),
  };
  return Array.from({ length: n }, (_, row) =>
    Array.from({ length: n }, (_, col) => {
      const x = (col + 0.5) / n,
        y = (row + 0.5) / n;
      return insideFigureTorso(x, y) ? glyph[figureShirtColourAt(design, x, y)] : ' ';
    }).join(''),
  );
}

describe('figure torso (→MATCH-36, KIT-7)', () => {
  it('keeps the defined proportions, the collar ringing the head', () => {
    expect(FIGURE_TORSO).toEqual({
      aspect: 2.5,
      cornerRadius: 0.45,
      sleeveTrim: 0.07,
      collar: { cx: 0.5, cy: 0.42, rx: 0.25, ry: 0.625, band: 0.05 },
      head: { cx: 0.5, cy: 0.42, r: 0.2 },
    });
    const { aspect, collar, head } = FIGURE_TORSO;
    // The collar's inner edge is the head's outline, so the band is what the head leaves showing.
    expect([collar.cx, collar.cy]).toEqual([head.cx, head.cy]);
    expect(collar.rx - collar.band).toBeCloseTo(head.r, 12);
    expect(collar.ry - collar.band * aspect).toBeCloseTo(head.r * aspect, 12);
    expect(Object.isFrozen(FIGURE_TORSO) && Object.isFrozen(FIGURE_TORSO.collar)).toBe(true);
  });

  it('shows the rounded shoulders from above, not under the head', () => {
    // The outline is included; the rounded corners and everything outside the square are not.
    for (const [x, y] of [
      [0, 0.5],
      [1, 0.5],
      [0.2, 0],
      [0.8, 1],
      [0.18, 0],
      [0, 0.45],
    ])
      expect(insideFigureTorso(x!, y!), `${x},${y}`).toBe(true);
    for (const [x, y] of [
      [0, 0],
      [1, 1],
      [0.02, 0.05],
      [-0.01, 0.5],
      [0.5, 1.01],
    ])
      expect(insideFigureTorso(x!, y!), `${x},${y}`).toBe(false);
    // The head is a circle on the body: 0.2 of the width across, so 0.5 of the depth deep, and its
    // rim is the head's.
    expect(insideFigureTorso(0.5, 0.42)).toBe(false);
    expect(insideFigureTorso(0.3, 0.42)).toBe(false);
    expect(insideFigureTorso(0.29, 0.42)).toBe(true);
    expect(insideFigureTorso(0.5, 0.92)).toBe(false);
    expect(insideFigureTorso(0.5, 0.93)).toBe(true);
  });

  it('puts trim on the sleeve ends and the collar band, over every pattern', () => {
    const halves: ShirtDesign = { ...shirt('halves'), trim: TRIM };
    expect(torso(halves, 16)).toEqual([
      '  ...T    T###  ',
      ' ....T    T#### ',
      ' ...T      T### ',
      'T...T      T###T',
      'T...T      T###T',
      'T...T      T###T',
      'T...T      T###T',
      'T...T      T###T',
      'T...T      T###T',
      'T...T      T###T',
      'T...T      T###T',
      'T...T      T###T',
      'T....T    T####T',
      ' ....T    T#### ',
      ' ....TT  TT#### ',
      '  ....TTTT####  ',
    ]);
    // Band edges are included: 0.07 of the width at each end, the collar from the head out 0.05.
    for (const [x, y] of [
      [0.07, 0.5],
      [0.93, 0.5],
      [0.25, 0.42],
      [0.3, 0.42],
      [0.75, 0.42],
      [0.5, 0.92],
      [0.5, 1],
    ])
      expect(insideFigureTrim(x!, y!), `${x},${y}`).toBe(true);
    for (const [x, y] of [
      [0.08, 0.5],
      [0.24, 0.42],
      [0.5, 0.5],
    ])
      expect(insideFigureTrim(x!, y!), `${x},${y}`).toBe(false);
    for (const pattern of SHIRT_PATTERNS)
      for (let row = 0; row <= 20; row++)
        for (let col = 0; col <= 20; col++) {
          const x = col / 20,
            y = row / 20;
          const trimmed = { ...shirt(pattern), trim: TRIM };
          expect(figureShirtColourAt(trimmed, x, y)).toBe(
            insideFigureTrim(x, y) ? TRIM : shirtColourAt(shirt(pattern), x, y),
          );
        }
  });

  it('without trim, shows the pattern regions of the same unit square', () => {
    // Hoops run across the shoulders on either side of the head.
    expect(torso(shirt('hoops'), 8)).toEqual([
      ' ..  .. ',
      '...  ...',
      '##    ##',
      '..    ..',
      '..    ..',
      '###  ###',
      '...  ...',
      ' ...... ',
    ]);
    for (const pattern of SHIRT_PATTERNS)
      for (let row = 0; row <= 20; row++)
        for (let col = 0; col <= 20; col++) {
          const x = col / 20,
            y = row / 20;
          expect(figureShirtColourAt(shirt(pattern), x, y)).toBe(
            shirtColourAt(shirt(pattern), x, y),
          );
        }
    expect(
      figureShirtColourAt({ pattern: 'stripes', primary: '#AbCdEf', secondary: '#0A0b0C' }, 0.3, 0),
    ).toBe('#0A0b0C');
  });
});
