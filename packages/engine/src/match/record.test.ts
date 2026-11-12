import { describe, expect, it } from 'vitest';
import { BAND_EDGES, cellOf } from './pitch';
import { COUNTER_ZONES, inBoxCell, isCutBack, mirrorBand, possessionShare } from './record';

/** The zone rules every path counts by, apart from the grid's tally (grid/record.test.ts plays them). */
describe('shared counting rules (→MATCH-3, MATCH-13, MATCH-14)', () => {
  it("counts a cut-back only from MATCH-14's zone into the box", () => {
    // The goal-area band's half-spaces are the zone; the box is where it goes.
    expect(isCutBack(cellOf([101, 20]), cellOf([95, 34]))).toBe(true);
    // Beside the box at the byline, in the box's half-space, or out of the box: no cut-back.
    expect(isCutBack(cellOf([101, 8]), cellOf([95, 34]))).toBe(false);
    expect(isCutBack(cellOf([95, 20]), cellOf([95, 34]))).toBe(false);
    expect(isCutBack(cellOf([101, 20]), cellOf([80, 34]))).toBe(false);
  });

  it("sets MATCH-13's zones on MATCH-14's band edges", () => {
    expect(BAND_EDGES[COUNTER_ZONES.finalThird]).toBe(70);
    expect(BAND_EDGES[COUNTER_ZONES.press]).toBe(35);
    expect(BAND_EDGES[COUNTER_ZONES.highTurnover]).toBe(70);
    expect(mirrorBand(COUNTER_ZONES.press)).toBe(4);
  });

  it('reads the box on cells and possession as the share of attempted passes', () => {
    expect(inBoxCell(cellOf([95, 34]))).toBe(true);
    expect(inBoxCell(cellOf([95, 8]))).toBe(false);
    expect(inBoxCell(cellOf([80, 34]))).toBe(false);
    expect(possessionShare(30, 20)).toBe(54);
    expect(possessionShare(0, 0)).toBe(45);
  });
});
