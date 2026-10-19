import { describe, expect, it } from 'vitest';
import { ATTRIBUTES } from '../../../contracts/src/player';
import { finishing } from '../match';
import { random } from '../primitives';
import { CELL_BASELINES } from './baselines';
import {
  chanceXg,
  DUEL_CONFIG,
  resolveCross,
  resolvePass,
  resolvePenalty,
  resolveShot,
  resolveTakeOn,
  shotContext,
  type Outcome,
} from './resolve';
import type { Point } from './pitch';
import { computeTags } from './tags';
import { gridKit } from './testkit';
import type { GridState } from './state';

/** Every player at 60 with no day shift or drain, parked far away; side 0 carrier `slot` at `at`. */
function scene(slot: number, at: Point) {
  const kit = gridKit();
  const s = kit.state;
  for (const side of s.players)
    for (const gp of side) {
      gp.pos = [gp.side === 0 ? 3 : 102, gp.side === 0 ? 2 : 66];
      gp.base.fill(60);
    }
  s.setup.shift = [0, 0];
  s.elapsed = 0;
  s.players[0][slot]!.pos = [...at];
  s.owner = [0, slot];
  s.ball = [...at];
  s.possession = 0;
  return { s, tags: () => computeTags(s, 0, slot) };
}
const set = (
  s: GridState,
  side: 0 | 1,
  idx: number,
  attr: (typeof ATTRIBUTES)[number],
  v: number,
) => (s.players[side][idx]!.base[ATTRIBUTES.indexOf(attr)] = v);
const tally = (n: number, f: (i: number) => Outcome) => {
  const out: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const o = f(i);
    out[o.kind] = (out[o.kind] ?? 0) + 1;
  }
  return out;
};

describe('grid open-play resolution', () => {
  it('prices chances like real football', () => {
    expect(chanceXg([94, 34])).toBeCloseTo(0.23, 1);
    expect(Math.abs(chanceXg([94, 34]) - 0.23)).toBeLessThan(0.03);
    expect(Math.abs(chanceXg([85, 34]) - 0.068)).toBeLessThan(0.02);
    expect(Math.abs(chanceXg([99, 34]) - 0.52)).toBeLessThan(0.06);
    expect(chanceXg([75, 34])).toBeLessThan(0.03);
    expect(chanceXg([94, 34], { header: true })).toBeCloseTo(chanceXg([94, 34]) * 0.55, 9);
    expect(chanceXg([94, 34], { cutBack: true })).toBeCloseTo(chanceXg([94, 34]) * 1.25, 9);
    expect(chanceXg([94, 34], { pressure: 2 })).toBeLessThan(chanceXg([94, 34]));
    expect(chanceXg([85, 34], { freeKick: true })).toBeCloseTo(chanceXg([85, 34]) * 0.6, 9);
  });

  const passScene = () => {
    const sc = scene(7, [60, 34]);
    sc.s.players[0][8]!.pos = [70, 34];
    return sc;
  };
  const completion = (sc: ReturnType<typeof passScene>, n: number, seed: string) => {
    const r = random(seed);
    const tags = sc.tags();
    const o = tally(n, () => resolvePass(sc.s, 0, 7, 8, tags, 'short', false, r));
    return (o.complete ?? 0) / n;
  };

  it("completes passes from the cell's real rate for equal players", () => {
    const sc = passScene();
    const tags = sc.tags();
    expect(tags.pressure).toBe(0);
    const rate = completion(sc, 10000, 'equal');
    expect(Math.abs(rate - CELL_BASELINES[tags.cell]!.passCompletion)).toBeLessThan(0.03);
  });

  it('rewards the better passer and the better marker', () => {
    const rates = [40, 60, 80].map((v) => {
      const sc = passScene();
      sc.s.players[1][3]!.pos = [65, 34];
      set(sc.s, 0, 7, 'passing', v);
      return completion(sc, 6000, 'passer');
    });
    expect(rates[0]).toBeLessThan(rates[1]!);
    expect(rates[1]).toBeLessThan(rates[2]!);
    const marks = [40, 60, 80].map((v) => {
      const sc = passScene();
      sc.s.players[1][3]!.pos = [65, 34];
      set(sc.s, 1, 3, 'positioning', v);
      return completion(sc, 6000, 'marker');
    });
    expect(marks[0]).toBeGreaterThan(marks[1]!);
    expect(marks[1]).toBeGreaterThan(marks[2]!);
  });

  it('splits lost passes into interceptions, loose balls and balls out by DUEL_CONFIG', () => {
    const sc = passScene();
    sc.s.players[1][3]!.pos = [65, 34];
    set(sc.s, 0, 7, 'passing', 0);
    const r = random('lost');
    const tags = sc.tags();
    const o = tally(20000, () => resolvePass(sc.s, 0, 7, 8, tags, 'short', false, r));
    const lost = 20000 - (o.complete ?? 0);
    const L = DUEL_CONFIG.pass.lost;
    expect(Math.abs((o.intercepted ?? 0) / lost - L.intercepted)).toBeLessThan(0.03);
    expect(Math.abs((o.loose ?? 0) / lost - L.loose)).toBeLessThan(0.03);
    expect(Math.abs((o.out ?? 0) / lost - L.out)).toBeLessThan(0.03);
  });

  it('lets a better dribbler beat his man more often and fouls about a fifth of failed take-ons', () => {
    const run = (dribbling: number) => {
      const sc = scene(8, [80, 34]);
      sc.s.players[1][3]!.pos = [83, 34];
      set(sc.s, 0, 8, 'dribbling', dribbling);
      const r = random(`dribble-${dribbling}`);
      const tags = sc.tags();
      return tally(10000, () => resolveTakeOn(sc.s, 0, 8, tags, r));
    };
    const [weak, even, strong] = [40, 60, 80].map(run);
    expect(weak!.complete!).toBeLessThan(even!.complete!);
    expect(even!.complete!).toBeLessThan(strong!.complete!);
    const failed = 10000 - even!.complete!;
    expect(Math.abs((even!.foul ?? 0) / failed - 0.22)).toBeLessThan(0.03);
    expect(Math.abs((even!.tackled ?? 0) / failed - 0.7)).toBeLessThan(0.03);
  });

  it('resolves a cross: claim, aerial duel, header or clearance', () => {
    const sc = scene(8, [95, 4]);
    const { s } = sc;
    s.players[1][0]!.pos = [103, 34];
    [
      [92, 30],
      [93, 38],
    ].forEach((p, i) => (s.players[0][9 + i]!.pos = [p[0]!, p[1]!]));
    [
      [93, 33],
      [92, 36],
    ].forEach((p, i) => (s.players[1][2 + i]!.pos = [p[0]!, p[1]!]));
    const ctx = shotContext(s);
    const r = random('cross');
    const tags = sc.tags();
    const o = tally(8000, () => resolveCross(s, 0, 8, tags, ctx, r));
    for (const kind of ['held', 'shot', 'loose', 'intercepted', 'out'])
      expect(o[kind], kind).toBeGreaterThan(0);
    const header = resolveShot(s, 0, 9, tags, ctx, random('header'), { header: true });
    expect(header.kind === 'shot' && header.xg).toBeCloseTo(
      chanceXg([92, 30], { header: true }),
      9,
    );
  });

  it('scores penalties about 78% between equal players', () => {
    const sc = scene(9, [94, 34]);
    const r = random('penalty');
    let goals = 0;
    for (let i = 0; i < 20000; i++) {
      const o = resolvePenalty(sc.s, 0, 9, r);
      if (o.kind === 'shot' && o.result === 'goal') goals++;
      expect(o.kind === 'shot' && o.recordedXg).toBe(0.76);
    }
    expect(Math.abs(goals / 20000 - 0.78)).toBeLessThan(0.02);
  });

  it('blocks about a quarter of missed shots with defenders in the lane', () => {
    const run = (blockers: number) => {
      const sc = scene(9, [80, 34]);
      const { s } = sc;
      s.players[1][0]!.pos = [103, 34];
      for (let i = 0; i < blockers; i++) s.players[1][2 + i]!.pos = [88, 34 + i * 0.5];
      const ctx = shotContext(s);
      const r = random(`block-${blockers}`);
      const tags = sc.tags();
      let misses = 0,
        blocks = 0;
      for (let i = 0; i < 20000; i++) {
        const o = resolveShot(s, 0, 9, tags, ctx, r);
        if (o.kind !== 'shot') continue;
        if (o.result === 'block') {
          blocks++;
          misses++;
        }
        if (o.result === 'miss') misses++;
      }
      return blocks / misses;
    };
    expect(run(0)).toBe(0);
    const one = run(1);
    expect(one).toBeGreaterThan(0.22);
    expect(one).toBeLessThan(0.34);
    expect(run(2)).toBeGreaterThan(one);
  });

  it("records xG for the level's average finisher and keeper", () => {
    const sc = scene(9, [92, 34]);
    const { s } = sc;
    const ctx = shotContext(s);
    expect(ctx.levelFactor).toBeCloseTo(finishing(60, 60), 9);
    const o = resolveShot(s, 0, 9, sc.tags(), ctx, random('record'));
    expect(o.kind).toBe('shot');
    if (o.kind === 'shot') {
      expect(o.xg).toBeCloseTo(chanceXg([92, 34]), 9);
      expect(o.recordedXg).toBeCloseTo(Math.min(0.8, o.xg * ctx.levelFactor), 9);
    }
  });
});
