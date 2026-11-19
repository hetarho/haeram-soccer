import { describe, expect, it } from 'vitest';
import { AGEING, AGEING_CURVE, ageingCurve } from './player';
import { ageAttributes, developAnnually } from './training';
import { worldMarketFixture } from './world-market.testkit';

const seed = 'individual-ageing';

function idWithShift(shift: number) {
  for (let i = 0; ; i++) {
    const id = `curve:${i}`;
    if (ageingCurve(seed, id).shift === shift) return id;
  }
}

describe('individual ageing (→PLAYER-17)', () => {
  it('draws the specified shares and a triangular decline rate over 20,000 identities', () => {
    const counts = Array<number>(10).fill(0),
      rates = Array<number>(12).fill(0);
    for (let i = 0; i < 20_000; i++) {
      const curve = ageingCurve(seed, `player:${i}`);
      counts[curve.shift - AGEING_CURVE.minShift]!++;
      expect(curve.rate).toBeGreaterThanOrEqual(AGEING_CURVE.rate.min);
      expect(curve.rate).toBeLessThanOrEqual(AGEING_CURVE.rate.max);
      rates[Math.min(11, Math.floor((curve.rate - 0.6) * 10))]!++;
    }
    counts.forEach((count, i) =>
      expect(Math.abs(count / 200 - AGEING_CURVE.shiftShares[i]!)).toBeLessThan(1),
    );
    const mode = rates.indexOf(Math.max(...rates));
    expect(0.6 + (mode + 0.5) / 10).toBeCloseTo(1, 0);
    expect(mode).toBeGreaterThanOrEqual(3);
    expect(mode).toBeLessThanOrEqual(4);
  });

  it('keeps the curve through ageing seasons and a serialized player reload', () => {
    const p = worldMarketFixture().players[0]!,
      before = ageingCurve(seed, p.id);
    ageAttributes(seed, p, 30, () => 0.5);
    ageAttributes(seed, p, 31, () => 0.5);
    const saved = JSON.parse(JSON.stringify({ seed, player: p })) as {
      seed: string;
      player: typeof p;
    };
    expect(ageingCurve(saved.seed, saved.player.id)).toEqual(before);
  });

  it.each([
    { shift: 5, onset: 34 },
    { shift: -4, onset: 25 },
  ])('shifts pace decline to $onset, scaling the loss but preserving noise', ({ shift, onset }) => {
    const p = worldMarketFixture().players[0]!;
    p.id = idWithShift(shift);
    p.attrs.pace = 80;
    ageAttributes(seed, p, onset - 1, () => 0.5);
    expect(p.attrs.pace).toBe(80);
    const rate = ageingCurve(seed, p.id).rate;
    ageAttributes(seed, p, onset, () => 0.75);
    expect(p.attrs.pace).toBeCloseTo(
      Math.round((80 + 0.25 - AGEING.pace.perSeason * rate) * 100) / 100,
    );
  });

  it('keeps young growth unchanged until shifted grow-until and shares the curve with NPC development', () => {
    const w = worldMarketFixture();
    w.seed = seed;
    const p = w.players.find((one) => one.position === 'CB')!;
    p.id = idWithShift(-4);
    p.born = w.year - 22;
    p.potential = 99;
    const npc = structuredClone(p);
    const context = { year: w.year, youth: 60, ground: 1, adaptation: p.adaptation, report: false };
    const before = p.attrs.pace;
    developAnnually(w, p, context);
    developAnnually(w, npc, context);
    expect(p.attrs.pace).toBeGreaterThan(before);
    expect(npc.attrs).toEqual(p.attrs);
    // At 23 the early curve's pace has left its growing years but positioning still grows.
    const older = structuredClone(npc);
    older.born--;
    const pace = older.attrs.pace,
      positioning = older.attrs.positioning;
    developAnnually(w, older, context);
    expect(Math.abs(older.attrs.pace - pace)).toBeLessThanOrEqual(0.5);
    expect(older.attrs.positioning).toBeGreaterThan(positioning);
  });
});
