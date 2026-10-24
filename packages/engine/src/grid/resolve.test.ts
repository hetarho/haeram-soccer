import { describe, expect, it } from 'vitest';
import { MATCH_MODEL_REVISION } from '../../../contracts/src/match-model';
import { ATTRIBUTES } from '../../../contracts/src/player';
import type { Tactic } from '../../../contracts/src/types';
import { DISABLED_RELEASE } from '../../../../tests/fixtures/worlds';
import { finishing } from '../match';
import { random } from '../primitives';
import { CELL_BASELINES } from './baselines';
import {
  chanceXg,
  DUEL_CONFIG,
  SHOT_CONFIG,
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
import { strengthScaled, type GridState } from './state';

/**
 * Every player at 60 with no day shift or drain, parked far away; side 0 carrier `slot` at `at`,
 * on the pre-feature path (candidate cases set the setup's model).
 */
function scene(slot: number, at: Point, tactics?: [Tactic, Tactic]) {
  const kit = gridKit(tactics, undefined, DISABLED_RELEASE);
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
    expect(chanceXg([94, 34], { header: true })).toBeCloseTo(
      chanceXg([94, 34]) * SHOT_CONFIG.header,
      9,
    );
    expect(chanceXg([94, 34], { cutBack: true })).toBeCloseTo(chanceXg([94, 34]) * 1.25, 9);
    expect(chanceXg([94, 34], { pressure: 2 })).toBeLessThan(chanceXg([94, 34]));
    // However many markers close in, a chance keeps a floor of its quality and never prices below zero.
    expect(chanceXg([94, 34], { pressure: 9 })).toBeCloseTo(
      chanceXg([94, 34]) * SHOT_CONFIG.pressureFloor,
      9,
    );
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

  it('completes a pass within the final third less often by its malus, on the candidate model only (T411)', () => {
    const rate = (candidate: boolean, malus: number, from: Point, to: Point) => {
      const F = DUEL_CONFIG.candidate.finalThirdPass as { malus: number };
      const kept = F.malus;
      F.malus = malus;
      try {
        const sc = scene(7, from);
        if (candidate) sc.s.setup = { ...sc.s.setup, model: MATCH_MODEL_REVISION };
        sc.s.players[0][8]!.pos = [...to];
        const r = random('t411-final-third');
        const tags = sc.tags();
        const o = tally(4000, () => resolvePass(sc.s, 0, 7, 8, tags, 'short', false, r));
        return (o.complete ?? 0) / 4000;
      } finally {
        F.malus = kept;
      }
    };
    // Within the final third: the same draws, `malus` fewer completed.
    expect(rate(true, 0, [80, 20], [80, 40]) - rate(true, 0.2, [80, 20], [80, 40])).toBeCloseTo(
      0.2,
      1,
    );
    // Into it from below, and on the pre-feature model, no change.
    expect(rate(true, 0.2, [60, 34], [75, 34])).toBe(rate(true, 0, [60, 34], [75, 34]));
    expect(rate(false, 0.2, [80, 20], [80, 40])).toBe(rate(false, 0, [80, 20], [80, 40]));
  });

  it("completes passes from the cell's real rate for equal players", () => {
    const sc = passScene();
    const tags = sc.tags();
    expect(tags.pressure).toBe(0);
    const rate = completion(sc, 10000, 'equal');
    expect(
      Math.abs(rate - CELL_BASELINES[tags.cell]!.passCompletion - DUEL_CONFIG.pass.base),
    ).toBeLessThan(0.03);
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

  it('plays a through ball to its lead point `at` instead of the receiver’s feet (T324)', () => {
    const sc = passScene();
    const tags = sc.tags();
    const at: Point = [95, 34];
    const r = random('lead');
    let done: Outcome | undefined;
    for (let i = 0; i < 50 && done?.kind !== 'complete'; i++)
      done = resolvePass(sc.s, 0, 7, 8, tags, 'through', false, r, 0, at);
    expect(done).toEqual({ kind: 'complete', to: at, receiver: 8 });
    // A defender on the way to the lead point, beyond the receiver, cuts it out there.
    sc.s.players[1][3]!.pos = [85, 34];
    const cut = random('lead-cut');
    let intercepted: Outcome | undefined;
    for (let i = 0; i < 2000 && intercepted?.kind !== 'intercepted'; i++)
      intercepted = resolvePass(sc.s, 0, 7, 8, tags, 'through', false, cut, 0, at);
    expect(intercepted).toMatchObject({ kind: 'intercepted', by: 3 });
    const [x, y] = (intercepted as Extract<Outcome, { kind: 'intercepted' }>).at;
    expect(x).toBeGreaterThan(sc.s.players[0][8]!.pos[0]);
    expect(y).toBeCloseTo(34, 9);
    // The longer ball to the lead point is completed less often than one to his feet.
    sc.s.players[1][3]!.pos = [102, 66];
    const rate = (lead?: Point) => {
      const rr = random('lead-rate');
      const o = tally(6000, () => resolvePass(sc.s, 0, 7, 8, tags, 'through', false, rr, 0, lead));
      return (o.complete ?? 0) / 6000;
    };
    expect(rate(at)).toBeLessThan(rate() - 0.02);
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
    // A loose ball outside the boxes is a 50/50, now and then a foul on its winner.
    const contested = (o.loose ?? 0) + (o.foul ?? 0);
    expect(Math.abs((o.intercepted ?? 0) / lost - L.intercepted)).toBeLessThan(0.03);
    expect(Math.abs(contested / lost - L.loose)).toBeLessThan(0.03);
    expect(Math.abs((o.out ?? 0) / lost - L.out)).toBeLessThan(0.03);
    expect(Math.abs((o.foul ?? 0) / contested - DUEL_CONFIG.looseFoul)).toBeLessThan(0.01);
  });

  it("intercepts a failed build-up pass by the defending tactic's share on the candidate model only (T370)", () => {
    const I = DUEL_CONFIG.candidate.intercept;
    const P = DUEL_CONFIG.pass.lost;
    // The completion draw fails, then `u` splits the lost pass; a defender stands in the lane.
    const lost = (u: number, x: number, tactic: Tactic, candidate: boolean) => {
      const sc = scene(7, [x, 34], ['balanced', tactic]);
      if (candidate) sc.s.setup = { ...sc.s.setup, model: MATCH_MODEL_REVISION };
      sc.s.players[0][8]!.pos = [x + 10, 34];
      sc.s.players[1][3]!.pos = [x + 5, 34];
      const draws = [0.9999, u, 0.5, 0.5, 0.5, 0.5];
      return resolvePass(sc.s, 0, 7, 8, sc.tags(), 'short', false, () => draws.shift() ?? 0.5).kind;
    };
    const tactics: Tactic[] = ['possession', 'press', 'counter', 'balanced'];
    for (const tactic of tactics) {
      const share = I.share[tactic];
      expect(lost(share - 1e-6, 40, tactic, true)).toBe('intercepted');
      expect(lost(share + 1e-6, 40, tactic, true)).not.toBe('intercepted');
      // In the final third, and on the pre-feature model, the shared split holds.
      expect(lost(P.intercepted - 1e-6, I.upTo + 5, tactic, true)).toBe('intercepted');
      expect(lost(P.intercepted + 1e-6, I.upTo + 5, tactic, true)).not.toBe('intercepted');
      expect(lost(P.intercepted + 1e-6, 40, tactic, false)).not.toBe('intercepted');
      // The extra interceptions come from the loose balls: as many passes still leave play.
      const out = P.intercepted + DUEL_CONFIG.candidate.passLoose;
      expect(lost(out + 1e-6, 40, tactic, true)).toBe('out');
      expect(lost(out - 1e-6, 40, tactic, true)).not.toBe('out');
    }
  });

  it('lets the keeper gather a share of the failed crosses running out on the candidate model only (T371)', () => {
    const C = DUEL_CONFIG.candidate;
    expect(C.crossKeeper).toBeGreaterThan(0);
    // A wide cross with nobody of his side in the box fails; the draws after it decide where it goes.
    const cross = (draws: number[], candidate: boolean) => {
      const sc = scene(10, [95, 6]);
      if (candidate) sc.s.setup = { ...sc.s.setup, model: MATCH_MODEL_REVISION };
      return resolveCross(sc.s, 0, 10, sc.tags(), shotContext(sc.s), () => draws.shift() ?? 0.5);
    };
    const out = DUEL_CONFIG.cross.failOut - 1e-6;
    expect(cross([0.5, out, C.crossKeeper - 1e-6], true)).toEqual({ kind: 'held', by: 0 });
    expect(cross([0.5, out, C.crossKeeper + 1e-6], true)).toMatchObject({
      kind: 'out',
      over: 'byline',
    });
    // A failed cross that stays in play, and every one on the pre-feature model, plays as before.
    expect(cross([0.5, DUEL_CONFIG.cross.failOut + 1e-6, 0], true).kind).not.toBe('held');
    expect(cross([0.5, out, 0], false)).toMatchObject({
      kind: 'out',
      over: 'byline',
    });
  });

  it('lets a better dribbler beat his man more often and fouls a set share of failed take-ons', () => {
    const run = (dribbling: number, x = 60) => {
      const sc = scene(8, [x, 34]);
      sc.s.players[1][3]!.pos = [x + 3, 34];
      set(sc.s, 0, 8, 'dribbling', dribbling);
      const r = random(`dribble-${dribbling}`);
      const tags = sc.tags();
      return tally(10000, () => resolveTakeOn(sc.s, 0, 8, tags, r));
    };
    const [weak, even, strong] = [40, 60, 80].map(run);
    expect(weak!.complete!).toBeLessThan(even!.complete!);
    expect(even!.complete!).toBeLessThan(strong!.complete!);
    const failed = 10000 - even!.complete!;
    const fail = DUEL_CONFIG.takeOn.fail;
    expect(Math.abs((even!.foul ?? 0) / failed - fail.foul)).toBeLessThan(0.03);
    expect(Math.abs((even!.tackled ?? 0) / failed - fail.tackle)).toBeLessThan(0.03);
    // In his own third a defender keeps `thirdFoul` of his fouls; the rest are clean tackles.
    const deep = run(60, 80);
    const deepFailed = 10000 - deep.complete!;
    expect(
      Math.abs((deep.foul ?? 0) / deepFailed - fail.foul * DUEL_CONFIG.thirdFoul),
    ).toBeLessThan(0.03);
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

  it('blocks a set share of missed shots with defenders in the lane', () => {
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
    const B = SHOT_CONFIG.block;
    expect(one).toBeGreaterThan(B.base - 0.1);
    expect(one).toBeLessThan(B.base + B.perDefender + 0.06);
    expect(run(2)).toBeGreaterThan(one);
  });

  it("records xG for the level's average finisher and keeper", () => {
    const sc = scene(9, [92, 34]);
    const { s } = sc;
    const ctx = shotContext(s);
    const at60 = strengthScaled(s, 60);
    expect(ctx.levelFactor).toBeCloseTo(finishing(at60, at60), 9);
    const o = resolveShot(s, 0, 9, sc.tags(), ctx, random('record'));
    expect(o.kind).toBe('shot');
    if (o.kind === 'shot') {
      expect(o.xg).toBeCloseTo(chanceXg([92, 34]), 9);
      expect(o.recordedXg).toBeCloseTo(Math.min(0.8, o.xg * ctx.levelFactor), 9);
    }
  });
});
