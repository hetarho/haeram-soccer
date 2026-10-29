import { describe, expect, it, vi } from 'vitest';
import {
  MATCH_MODEL_REVISION,
  MATCH_MODEL_REVISIONS,
  type MatchModelRevision,
} from '../../../contracts/src/match-model';
import { ATTRIBUTES } from '../../../contracts/src/player';
import type { Tactic } from '../../../contracts/src/types';
import { DISABLED_RELEASE } from '../../../../tests/fixtures/releases';
import { finishing } from '../match';
import { random } from '../primitives';
import { CELL_BASELINES } from './baselines';
import {
  blockRebound,
  chanceXg,
  closingBlockers,
  DUEL_CONFIG,
  SHOT_CONFIG,
  resolveCross,
  resolveDelivery,
  resolveFinish,
  resolvePass,
  resolvePenalty,
  resolveShot,
  resolveTakeOn,
  shotBlockers,
  shotContext,
  unblocked,
  type DeliveryResult,
  type Outcome,
} from './resolve';
import { BOX_CONFIG, deliveryPoint, type DeliveryAim } from './box';
import { actionMix, DECISION_CONFIG, temperature } from './decide';
import { playGrid } from './engine';
import { LANE_CONFIG, reachOnPath } from './lanes';
import { validateFullMatchRecord } from '../match-model';
import { GRID_BALL_CONFIG, GRID_MOVEMENT_CONFIG } from './movement';
import type { Point } from './pitch';
import { Tally } from './record';
import { buildGridSetup } from './setup';
import { speedOf } from './shape';
import { computeTags } from './tags';
import { gridKit } from './testkit';
import { skill, strengthScaled, type GridState } from './state';

/** Revision 8: the failed-pass split before revision 9 reads where its receiver takes it (T580). */
const REVISION_8 = MATCH_MODEL_REVISIONS[7]!;

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

  it('sends a ball played to where it already is out over the nearest line (T437)', () => {
    // An in-stride carry can take a carrier onto a line beside a teammate kept there too: a pass
    // with no length that runs out once left its exit point at 0 × ∞, and the match ran on at NaN.
    for (const [at, line, over] of [
      [[105, 40], [105, 40], 'byline'],
      [[60, 1], [60, 0], 'touch'],
    ] as [Point, Point, string][]) {
      const sc = scene(7, at);
      sc.s.setup = { ...sc.s.setup, model: REVISION_8 };
      sc.s.players[0][8]!.pos = [...at];
      const r = random('t437-no-length');
      const tags = sc.tags();
      let outs = 0;
      for (let i = 0; i < 4000; i++) {
        const o = resolvePass(sc.s, 0, 7, 8, tags, 'short', false, r);
        if (o.kind !== 'out') continue;
        outs++;
        expect(o.at).toEqual(line);
        expect(o.over).toBe(over);
      }
      expect(outs).toBeGreaterThan(0);
    }
  });

  it('completes a pass within the final third less often by its malus, on the candidate model only (T411)', () => {
    const rate = (candidate: boolean, malus: number, from: Point, to: Point) => {
      const F = DUEL_CONFIG.candidate.finalThirdPass as { malus: number };
      const kept = F.malus;
      F.malus = malus;
      try {
        const sc = scene(7, from);
        if (candidate) sc.s.setup = { ...sc.s.setup, model: REVISION_8 };
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
    // Revision 8's split of the rest; revision 9 reads them at the receiver (T580).
    const lost = (u: number, x: number, tactic: Tactic, candidate: boolean) => {
      const sc = scene(7, [x, 34], ['balanced', tactic]);
      if (candidate) sc.s.setup = { ...sc.s.setup, model: REVISION_8 };
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
      // The extra interceptions come from the loose balls; the rest are misplaced, and in midfield
      // a misplaced pass runs on loose past its target instead of leaving play (T542).
      const out = P.intercepted + DUEL_CONFIG.candidate.passLoose;
      expect(lost(out + 1e-6, 40, tactic, true)).toBe('loose');
      expect(lost(out - 1e-6, 40, tactic, true)).toBe('loose');
    }
  });

  /**
   * A failing revision-8 pass from [60, 34] to [75, 34], drawn `n` times; `foe` stands where given
   * (revision 9's split at the receiver has its own cases, T580).
   */
  const failing = (n: number, seed: string, foe?: Point) => {
    const sc = scene(7, [60, 34], ['balanced', 'press']);
    sc.s.setup = { ...sc.s.setup, model: REVISION_8 };
    sc.s.players[0][8]!.pos = [75, 34];
    if (foe) sc.s.players[1][3]!.pos = [...foe];
    set(sc.s, 0, 7, 'passing', 0);
    const r = random(seed);
    const tags = sc.tags();
    return Array.from({ length: n }, () => resolvePass(sc.s, 0, 7, 8, tags, 'short', false, r));
  };
  const lostAt = (o: Outcome) => (o.kind === 'loose' || o.kind === 'foul' ? o.at : undefined);
  /** Where `failing`'s misplaced pass comes to rest: past its receiver by its overrun (T542). */
  const M = DUEL_CONFIG.candidate.misplaced;
  const overrun: Point = [75 + Math.min(M.most, M.overrun * 15), 34];
  const atReceiver = (at: Point) =>
    at[1] === 34 && (at[0] === 75 || Math.abs(at[0] - overrun[0]) < 1e-9);

  it('a pass whose lane nobody reaches is never intercepted (T441)', () => {
    const outcomes = failing(20000, 't441-open');
    const kinds = tally(outcomes.length, (i) => outcomes[i]!);
    expect(kinds.intercepted ?? 0).toBe(0);
    expect(kinds.loose).toBeGreaterThan(1000);
    // A misplaced pass through midfield stays in play (T542).
    expect(kinds.out ?? 0).toBe(0);
    // Lost only at its receiver: every loose ball and 50/50 foul is where he stands, or a few
    // metres past him where a misplaced pass comes to rest.
    for (const o of outcomes) {
      const at = lostAt(o);
      if (at) expect(atReceiver(at)).toBe(true);
    }
    expect(outcomes.some((o) => lostAt(o)?.[0] === overrun[0])).toBe(true);
  });

  it('a failed pass is won where the man in the lane meets it, or deflected there at full stretch (T441)', () => {
    // Standing in the lane 5 m out: he wins the build-up's share of the failed passes cleanly.
    const inLane = failing(20000, 't441-lane', [65, 34]);
    const won = inLane.filter((o) => o.kind === 'intercepted');
    expect(won.length).toBeGreaterThan(200);
    for (const o of won) {
      expect(o).toMatchObject({ kind: 'intercepted', by: 3 });
      const [x, y] = (o as Extract<Outcome, { kind: 'intercepted' }>).at;
      // Where the ball first comes within his reach, a step before him at most.
      expect(y).toBeCloseTo(34, 9);
      expect(65 - x).toBeGreaterThan(0);
      expect(65 - x).toBeLessThan(LANE_CONFIG.reach + 1);
    }
    // 2 m off the line he gets a touch at full stretch only: the same share is deflected loose there.
    const stretched = failing(20000, 't441-lane', [67, 36]);
    expect(stretched.filter((o) => o.kind === 'intercepted')).toHaveLength(0);
    const deflected = stretched.filter((o) => {
      const at = lostAt(o);
      return at && !atReceiver(at);
    });
    expect(Math.abs(deflected.length - won.length)).toBeLessThan(won.length * 0.25);
    for (const o of deflected) {
      const [x, y] = lostAt(o)!;
      // On the line, where a step toward it takes him within stretch before the ball.
      expect(y).toBeCloseTo(34, 9);
      expect(x).toBeLessThanOrEqual(67);
      expect(x).toBeGreaterThan(64);
    }
  });

  it('nobody cuts out a pass he could not reach (T441)', () => {
    const kit = gridKit(['press', 'possession'], undefined, DISABLED_RELEASE);
    /** Metres a runner covers in `t` s from `u0` m/s his way, accelerating up to `vmax`. */
    const covered = (t: number, u0: number, vmax: number) => {
      const a = GRID_MOVEMENT_CONFIG.acceleration;
      const u = Math.min(Math.max(0, u0), vmax);
      const ramp = (vmax - u) / a;
      return t <= ramp ? u * t + (a * t * t) / 2 : ((u + vmax) / 2) * ramp + vmax * (t - ramp);
    };
    // Each interceptor as the engine counts the interception: nobody has moved since the kick.
    type Kick = { pos: Point; vel: Point; vmax: number; passer: Point };
    let kicks: Kick[] = [];
    const count = Tally.prototype.interception;
    const spy = vi.spyOn(Tally.prototype, 'interception').mockImplementation(function (
      this: Tally,
      ...args: Parameters<Tally['interception']>
    ) {
      const s = (this as unknown as { state: GridState }).state;
      const gp = s.players[args[0]][args[1]]!;
      const passer = s.players[s.owner![0]][s.owner![1]]!.pos;
      const vel = gp.vel ?? [0, 0];
      kicks.push({
        pos: [gp.pos[0], gp.pos[1]],
        vel: [vel[0], vel[1]],
        vmax: speedOf(s, gp),
        passer: [passer[0], passer[1]],
      });
      count.apply(this, args);
    });
    let arrived = 0,
      fromKick = 0,
      deflected = 0;
    try {
      for (const id of ['lanes-1', 'lanes-2', 'lanes-3']) {
        kicks = [];
        const result = playGrid(
          buildGridSetup(
            kit.w,
            { ...kit.f, id },
            { observe: true, recordPlayers: true, model: MATCH_MODEL_REVISION },
          ),
        );
        expect(validateFullMatchRecord(result.record), id).toEqual([]);
        const trace = result.trace!;
        // Every interception, of any action, is counted once and traced in the same order.
        const intercepted = trace.filter((e) => e.outcome === 'intercepted');
        expect(intercepted).toHaveLength(kicks.length);
        intercepted.forEach((e, k) => {
          if (e.action !== 'pass') return;
          const [foe, by] = e.by!;
          const reachAt = e.to!;
          // The flight ends at his reach point (none when he meets it as it is played).
          const landing = e.knots?.at(-1);
          if (landing) expect(landing.ball).toEqual(reachAt);
          // Where he is when it arrives: where his next play starts (his carry, or he plays it there).
          const next = trace.slice(trace.indexOf(e) + 1).find((x) => x.outcome !== 'incident');
          if (next?.side === foe && next.idx === by && next.from) {
            const start = next.knots?.[0]?.kind === 'carry' ? next.knots[0].ball : next.from;
            expect(Math.hypot(start[0] - reachAt[0], start[1] - reachAt[1])).toBeLessThanOrEqual(
              LANE_CONFIG.stretch,
            );
            arrived++;
          }
          // After an in-stride carry the ball is kicked at once and he reads it then: from where he
          // stood and how he moved, he gets within reach of the point by the ball at pass speed.
          if (e.knots?.[0]?.kind !== 'carry') return;
          const { pos, vel, vmax, passer } = kicks[k]!;
          expect(passer).toEqual(e.from);
          const d = Math.hypot(reachAt[0] - pos[0], reachAt[1] - pos[1]);
          const toward =
            d > 0 ? (vel[0] * (reachAt[0] - pos[0]) + vel[1] * (reachAt[1] - pos[1])) / d : 0;
          const ball =
            Math.hypot(reachAt[0] - passer[0], reachAt[1] - passer[1]) / GRID_BALL_CONFIG.pass;
          expect(d - LANE_CONFIG.reach).toBeLessThanOrEqual(covered(ball, toward, vmax) + 1e-6);
          fromKick++;
        });
        // The diagnostics count every failed open-play pass once, by where it ended.
        const losses = result.diagnostics.passLosses!;
        for (const side of [0, 1] as const) {
          const failed = trace.filter(
            (e) =>
              e.side === side &&
              e.action === 'pass' &&
              e.tags &&
              e.outcome !== 'complete' &&
              e.outcome !== 'offside',
          );
          const of = (...kinds: string[]) => failed.filter((e) => kinds.includes(e.outcome)).length;
          expect(losses.intercepted[side]).toBe(of('intercepted'));
          expect(losses.out[side]).toBe(of('out'));
          expect(losses.deflected[side] + losses.receiver[side]).toBe(of('loose', 'foul'));
          deflected += losses.deflected[side];
        }
      }
    } finally {
      spy.mockRestore();
    }
    expect(arrived).toBeGreaterThan(10);
    expect(fromKick).toBeGreaterThan(10);
    expect(deflected).toBeGreaterThan(0);
  });

  it("a keeper's distribution plays against the first opponent who reaches its path, as any pass (T441, →MATCH-11 r29)", () => {
    // A 30 m ball out of the box; the only defender near it stands `off` m off its line midway.
    // Revision 8: on revision 9 a failed ball nobody cuts out is mostly kept by a free receiver
    // (T580), which narrows the difference the reader makes.
    const rate = (passer: number, off: number, positioning: number) => {
      const sc = scene(passer, [10, 34]);
      sc.s.setup = { ...sc.s.setup, model: REVISION_8 };
      sc.s.players[0][8]!.pos = [40, 34];
      sc.s.players[1][3]!.pos = [25, 34 + off];
      set(sc.s, 1, 3, 'positioning', positioning);
      expect(reachOnPath(sc.s, 0, [10, 34], [40, 34], 0).first?.gp.idx).toBe(off ? undefined : 3);
      const r = random(`t441-keeper-${passer}-${off}`);
      const tags = sc.tags();
      const o = tally(6000, () => resolvePass(sc.s, 0, passer, 8, tags, 'long', false, r));
      return (o.complete ?? 0) / 6000;
    };
    // 10 m off the line nobody reaches it: a keeper's ball, like an outfielder's, plays against nobody…
    for (const passer of [0, 5]) expect(rate(passer, 10, 40)).toBe(rate(passer, 10, 80));
    // …and in the lane he reaches it, so the better he reads the game, the less often it arrives.
    expect(rate(0, 0, 40) - rate(0, 0, 80)).toBeGreaterThan(0.08);
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

  it('a defender who reaches the delivery’s path first cuts it out (T444)', () => {
    // The left wing-back's low ball from wide to the near post (the ball's side −1), the striker
    // nearly there; the opponents stand off by the far corner unless a case places one.
    const near: DeliveryAim = { zone: 'nearPost', kind: 'near', ball: -1 };
    const zone = deliveryPoint(0, near);
    const from: Point = [92, 6];
    const along = (t: number): Point => [
      from[0] + (zone[0] - from[0]) * t,
      from[1] + (zone[1] - from[1]) * t,
    ];
    const setUp = (place: (s: GridState) => void) => {
      const sc = scene(1, from);
      sc.s.setup = { ...sc.s.setup, model: MATCH_MODEL_REVISION };
      sc.s.players[0][9]!.pos = [99, 33];
      place(sc.s);
      return sc;
    };
    const deliver = (seed: string, place: (s: GridState) => void = () => {}) => {
      const sc = setUp(place);
      const r = random(seed);
      const tags = sc.tags();
      return Array.from({ length: 4000 }, () => resolveDelivery(sc.s, 0, 1, 9, near, tags, r));
    };
    const his = (o: Outcome, idx: number) =>
      (o.kind === 'intercepted' && o.by === idx) ||
      (o.kind === 'loose' && o.winner[0] === 1 && o.winner[1] === idx);
    const atOf = (o: Outcome) =>
      o.kind === 'intercepted' || o.kind === 'loose' ? o.at : undefined;
    const arrived = (results: DeliveryResult[]) =>
      results.filter((x) => x.outcome.kind === 'complete').length;
    // Nobody reaches it: never cut out. A good ball reaches the striker at the zone, not at his feet,
    // for a first-time finish with the foot; a bad one is lost at the zone.
    const open = deliver('t444-open');
    const kinds = tally(open.length, (i) => open[i]!.outcome);
    expect(kinds.intercepted ?? 0).toBe(0);
    expect(kinds.complete).toBeGreaterThan(1500);
    for (const { outcome: o, finish } of open) {
      if (o.kind === 'complete') {
        expect(o).toEqual({ kind: 'complete', to: zone, receiver: 9 });
        expect(finish).toEqual({ header: false, cutBack: false });
      } else expect(finish).toBeUndefined();
      if (o.kind === 'loose') expect(o.at).toEqual(zone);
    }
    // A centre-back standing in its path, midway: every ball is his where it meets him, cut out
    // `cross.intercept` of the time and headed clear the rest. Neither one at the zone behind him
    // nor a man who only just gets to the ball before him (at full stretch 2.3 m off its line,
    // nearer the crosser) changes that: the ball meets the first who gets there cleanly.
    const len = Math.hypot(zone[0] - from[0], zone[1] - from[1]);
    const offLine = (t: number, metres: number): Point => {
      const p = along(t);
      return [
        p[0] + ((zone[1] - from[1]) / len) * metres,
        p[1] - ((zone[0] - from[0]) / len) * metres,
      ];
    };
    const mid = along(0.5);
    const early = offLine(0.3, 2.3);
    const lanes = {
      alone: (s: GridState) => (s.players[1][3]!.pos = [mid[0], mid[1]]),
      behind: (s: GridState) => {
        s.players[1][3]!.pos = [mid[0], mid[1]];
        s.players[1][4]!.pos = [zone[0], zone[1]];
      },
      before: (s: GridState) => {
        s.players[1][3]!.pos = [mid[0], mid[1]];
        s.players[1][4]!.pos = [early[0], early[1]];
      },
    };
    const reach = reachOnPath(setUp(lanes.before).s, 0, from, zone, 0);
    expect(reach.first).toMatchObject({ stretch: true, gp: { idx: 4 } });
    expect(reach.clean).toMatchObject({ gp: { idx: 3 } });
    for (const [name, place] of Object.entries(lanes)) {
      const lane = deliver('t444-lane', place).map((x) => x.outcome);
      expect(
        lane.every((o) => his(o, 3)),
        name,
      ).toBe(true);
      const cut = lane.filter((o) => o.kind === 'intercepted').length / lane.length;
      expect(Math.abs(cut - DUEL_CONFIG.cross.intercept)).toBeLessThan(0.03);
      for (const o of lane) {
        const at = atOf(o)!;
        expect(Math.hypot(at[0] - mid[0], at[1] - mid[1])).toBeLessThanOrEqual(
          LANE_CONFIG.reach + 1,
        );
        expect(Math.hypot(at[0] - from[0], at[1] - from[1])).toBeLessThan(
          Math.hypot(mid[0] - from[0], mid[1] - from[1]),
        );
      }
    }
    // The man who only just gets there, on his own, is beaten by a good ball (MATCH-31): it reaches
    // the striker as often as an open one does. A bad one is deflected loose where he meets it, a
    // 50/50 there, never cut out cleanly.
    const stretched = (s: GridState) => {
      const p = offLine(0.5, 2.6);
      s.players[1][3]!.pos = [p[0], p[1]];
    };
    const alone = reachOnPath(setUp(stretched).s, 0, from, zone, 0);
    expect(alone.first).toMatchObject({ stretch: true, gp: { idx: 3 } });
    expect(alone.clean).toBeUndefined();
    const stretch = deliver('t444-stretch', stretched);
    expect(Math.abs(arrived(stretch) - arrived(open))).toBeLessThan(200);
    let deflected = 0;
    for (const { outcome: o } of stretch) {
      expect(o.kind).not.toBe('intercepted');
      if (o.kind === 'loose') {
        expect(o.at).toEqual(alone.first!.at);
        deflected++;
      }
    }
    expect(deflected).toBeGreaterThan(1000);
  });

  it('a lofted ball onto a guarded far post meets the keeper’s claim and the aerial duel (T444)', () => {
    // The left wing-back's ball lofted to the striker short of the far post, its full-back guarding
    // the far post itself: the zone's men meet it in the air, so he never cuts it out on its way.
    const far: DeliveryAim = { zone: 'farPost', kind: 'far', ball: -1 };
    const zone = deliveryPoint(0, far);
    const from: Point = [92, 6];
    const deliver = (guarded: boolean) => {
      const sc = scene(1, from);
      sc.s.setup = { ...sc.s.setup, model: MATCH_MODEL_REVISION };
      sc.s.players[0][10]!.pos = [zone[0] - 3, zone[1]];
      if (guarded) sc.s.players[1][5]!.pos = [zone[0], zone[1] - 1];
      const r = random('t444-far-post');
      const tags = sc.tags();
      return {
        s: sc.s,
        results: Array.from({ length: 4000 }, () => resolveDelivery(sc.s, 0, 1, 10, far, tags, r)),
      };
    };
    const guarded = deliver(true);
    // On the ground he would reach the ball cleanly before the zone: the aerial duel is his instead.
    expect(reachOnPath(guarded.s, 0, from, zone, 0).clean?.gp.idx).toBe(5);
    const kinds = tally(guarded.results.length, (i) => guarded.results[i]!.outcome);
    expect(kinds.intercepted ?? 0).toBe(0);
    expect(kinds.held).toBeGreaterThan(200);
    let duelsLost = 0,
      headers = 0;
    for (const { outcome: o, finish } of guarded.results) {
      if (o.kind === 'loose' && o.aerial === 1) {
        expect(o.winner).toEqual([1, 5]);
        duelsLost++;
      }
      if (o.kind === 'complete') {
        // Won in the air against him: brought down at the zone, or headed there next.
        expect(o).toMatchObject({ to: zone, receiver: 10, aerial: 0 });
        if (finish) {
          expect(finish).toEqual({ header: true, pressure: SHOT_CONFIG.headerPressure });
          headers++;
        }
      }
    }
    expect(duelsLost).toBeGreaterThan(300);
    expect(headers).toBeGreaterThan(100);
    // Unguarded, nobody in the box contests it in the air: no duel, and a header under no pressure.
    for (const { outcome: o, finish } of deliver(false).results) {
      expect('aerial' in o).toBe(false);
      if (finish) expect(finish).toEqual({ header: true, pressure: 0 });
    }
  });

  it('a low ball across the goal area is shot with the foot, not headed (T444)', () => {
    // From the left byline, squared to the striker running in 4 m short of the far post; nobody
    // near enough to reach it.
    const square: DeliveryAim = { zone: 'farPost', kind: 'square', ball: -1 };
    const zone = deliveryPoint(0, square);
    const sc = scene(1, [101, 4]);
    sc.s.setup = { ...sc.s.setup, model: MATCH_MODEL_REVISION };
    sc.s.players[0][10]!.pos = [zone[0] - 4, zone[1]];
    expect(reachOnPath(sc.s, 0, [101, 4], zone, 0).first).toBeUndefined();
    const r = random('t444-square');
    const tags = sc.tags();
    const low = Array.from({ length: 3000 }, () =>
      resolveDelivery(sc.s, 0, 1, 10, square, tags, r),
    );
    // It reaches him at the zone, not where he stood: his first-time finish with the foot follows,
    // with no aerial duel.
    const met = low.filter((x) => x.outcome.kind === 'complete');
    expect(met.length).toBeGreaterThan(1200);
    for (const { outcome, finish } of met) {
      expect(outcome).toEqual({ kind: 'complete', to: zone, receiver: 10 });
      expect(finish).toEqual({ header: false, cutBack: true });
    }
    // Struck from the zone once he has met it there: a cut-back's chance, never a header.
    sc.s.players[0][10]!.pos = [zone[0], zone[1]];
    const ctx = shotContext(sc.s);
    const xg = chanceXg([zone[0], zone[1]], { cutBack: true, pressure: 0, candidate: true });
    expect(xg).toBeGreaterThan(chanceXg([zone[0], zone[1]], { candidate: true }));
    const finish = met[0]!.finish!;
    for (let i = 0; i < 500; i++) {
      const o = resolveFinish(sc.s, 0, 10, finish, computeTags(sc.s, 0, 10), ctx, r);
      expect(o).toMatchObject({ kind: 'shot', shooter: 10, xg });
      expect(o.header ?? false).toBe(false);
      expect('aerial' in o).toBe(false);
    }
  });

  it('a delivery that reaches its runner meets him at its zone, and his finish is struck there (T444)', () => {
    // Observed candidate fixtures: every completed open-play cross or cut-back flies to the point
    // it was played into, its runner is there when it lands, and the header or shot he finishes it
    // with is his next action, struck from there at once.
    const kit = gridKit(['possession', 'balanced'], undefined, DISABLED_RELEASE);
    let deliveries = 0,
      ranIn = 0,
      finished = 0,
      broughtDown = 0;
    // Few deliveries reach their runner (most are cut out, T444's round 72), so 32 fixtures.
    for (let n = 0; n < 32; n++) {
      const id = `t444-zone-${n}`;
      const result = playGrid(
        buildGridSetup(
          kit.w,
          { ...kit.f, id },
          { observe: true, recordPlayers: true, model: MATCH_MODEL_REVISION },
        ),
      );
      expect(validateFullMatchRecord(result.record), id).toEqual([]);
      const trace = result.trace!;
      trace.forEach((e, k) => {
        const open = (e.action === 'cross' || e.action === 'cutBack') && e.tags;
        if (!open || e.outcome !== 'complete' || e.receiver === undefined) return;
        deliveries++;
        const to = e.to!;
        expect(e.knots!.at(-1)!).toMatchObject({ kind: 'receive', ball: to });
        // Where the runner stood before the delivery (side 1's slots follow side 0's).
        const before = trace.slice(0, k).findLast((x) => x.outcome !== 'incident');
        const j = before?.slots.findIndex(
          (v, i) => v === e.receiver && (i < 11 ? 0 : 1) === e.side,
        );
        if (before && j !== undefined && j >= 0) {
          const was = [before.positions[2 * j]!, before.positions[2 * j + 1]!];
          if (Math.hypot(was[0]! - to[0], was[1]! - to[1]) > 1) ranIn++;
        }
        const next = trace.slice(k + 1).find((x) => x.outcome !== 'incident');
        if (!next || next.side !== e.side || next.idx !== e.receiver) return;
        // His next action starts where the ball met him (his carry's start when he carries it on).
        const start = next.knots?.[0]?.kind === 'carry' ? next.knots[0].ball : next.from!;
        expect(Math.hypot(start[0] - to[0], start[1] - to[1])).toBeLessThan(0.5);
        if (next.action !== 'shot') return;
        // A lofted ball he brings down he plays on by his table (T446: they now arrive), and may
        // carry it before he shoots; a header never follows a carry.
        if (next.knots![0]!.kind === 'carry') {
          expect(next.header).toBeFalsy();
          broughtDown++;
          return;
        }
        // A first-time finish: kicked at once from the zone, with no carry before it.
        expect(next.knots![0]).toMatchObject({ kind: 'kick', ball: next.from });
        finished++;
      });
    }
    expect(deliveries).toBeGreaterThan(4);
    expect(ranIn).toBeGreaterThan(0);
    expect(finished).toBeGreaterThan(4);
    expect(broughtDown).toBeLessThan(finished);
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

  /** The striker on the ball at `at` on the candidate model, side 1's `bodies` (roster 2 on) placed. */
  const shotScene = (at: Point, bodies: Point[], model = true) => {
    const sc = scene(9, at);
    if (model) sc.s.setup = { ...sc.s.setup, model: MATCH_MODEL_REVISION };
    bodies.forEach((p, i) => (sc.s.players[1][2 + i]!.pos = [p[0], p[1]]));
    return sc;
  };

  it('xG falls with bodies between the ball and the goal (T445)', () => {
    const at: Point = [92, 34];
    // More than the pressure radius from him, so only the bodies change.
    const lines: Point[][] = [
      [],
      [[99, 34]],
      [
        [99, 34],
        [101, 33],
      ],
      [
        [99, 34],
        [101, 33],
        [103, 35],
      ],
    ];
    let last = Infinity;
    for (const bodies of lines) {
      const sc = shotScene(at, bodies);
      const ctx = shotContext(sc.s);
      const tags = sc.tags();
      const o = resolveShot(sc.s, 0, 9, tags, ctx, random('bodies'));
      const chance = chanceXg(at, { pressure: tags.pressure, candidate: true }, sc.s.math);
      const open = unblocked(shotBlockers(sc.s, 0, at));
      if (bodies.length) expect(open).toBeLessThan(1);
      else expect(open).toBe(1);
      // The chance's xG times the share nobody blocks, recorded for the level's average players.
      expect(o.xg).toBeCloseTo(chance * open, 12);
      expect(o.recordedXg).toBeCloseTo(Math.min(SHOT_CONFIG.maxXg, o.xg * ctx.levelFactor), 12);
      expect(o.xg).toBeLessThan(last);
      last = o.xg;
    }
    // Recorded xG stays the goal probability for the average finisher and keeper: the keeper's
    // part reads the chance without the bodies, so they count once.
    const sc = shotScene(at, lines[2]!);
    const ctx = shotContext(sc.s);
    const tags = sc.tags();
    const r = random('bodies-goals');
    let goals = 0,
      recorded = 0;
    const n = 40000;
    for (let i = 0; i < n; i++) {
      const o = resolveShot(sc.s, 0, 9, tags, ctx, r);
      if (o.result === 'goal') goals++;
      recorded = o.recordedXg;
    }
    expect(Math.abs(goals / n - recorded)).toBeLessThan(0.008);
    // The decision reads the same bodies: shots against passes fall with them in his way, through
    // his temperature, so more for a sharp head (→MATCH-16). The current revision's curve (T482).
    const Q = DECISION_CONFIG.candidate.revision4.shotQuality;
    const weight = (xg: number) => Math.min(Q.most, (xg / Q.ref) ** Q.power);
    const factor = (decisions: number) => {
      const plain = shotScene(at, []);
      set(plain.s, 0, 9, 'decisions', decisions);
      // A defender ahead of him and wide: in the corridor to goal, so no clear chance (alone he
      // would take it whatever the bodies, T542), out of the shot's path, its closing reach and
      // pressing range. On revision 7 a man behind him no longer takes the chance away (T548).
      plain.s.players[1][10]!.pos = [at[0] + 5, at[1] + 8];
      const tagsOf = plain.tags();
      const before = actionMix(plain.s, 0, 9, tagsOf);
      lines[2]!.forEach((p, i) => (plain.s.players[1][2 + i]!.pos = [p[0], p[1]]));
      const after = actionMix(plain.s, 0, 9, tagsOf);
      const f = after.shot / after.pass / (before.shot / before.pass);
      const chance = chanceXg(at, { pressure: tagsOf.pressure, candidate: true }, plain.s.math);
      const seen =
        unblocked(shotBlockers(plain.s, 0, at)) ** (1 / temperature(plain.s, 0, 9, tagsOf));
      expect(f).toBeCloseTo(weight(chance * seen) / weight(chance), 9);
      return f;
    };
    const [poor, average, sharp] = [factor(30), factor(60), factor(90)];
    expect(poor).toBeLessThan(1);
    expect(average).toBeLessThan(poor);
    expect(sharp).toBeLessThan(average);
  });

  it('blocks come before the keeper (T445)', () => {
    const at: Point = [92, 34];
    const body: Point = [97, 34];
    const draws =
      (...v: number[]) =>
      () =>
        v.shift() ?? 0;
    const cand = shotScene(at, [body]);
    const ctx = shotContext(cand.s);
    const tags = cand.tags();
    const chance = shotBlockers(cand.s, 0, at)[0]!.chance;
    // The first draw is the body's on the candidate model, the keeper's on the pre-feature path.
    expect(resolveShot(cand.s, 0, 9, tags, ctx, draws(0))).toMatchObject({
      result: 'block',
      by: 2,
      then: 'corner',
    });
    const pre = shotScene(at, [body], false);
    expect(resolveShot(pre.s, 0, 9, pre.tags(), shotContext(pre.s), draws(0)).result).toBe('goal');
    // Only a shot nobody blocks meets the keeper.
    expect(resolveShot(cand.s, 0, 9, tags, ctx, draws(0.999, 0)).result).toBe('goal');
    // So the blocked share is the body's chance whatever the keeper; the keeper decides the rest.
    const goalShare: number[] = [];
    for (const reflexes of [20, 95]) {
      const sc = shotScene(at, [body]);
      set(sc.s, 1, 0, 'reflexes', reflexes);
      const r = random(`keeper-${reflexes}`);
      const counts = { block: 0, goal: 0 };
      const keeperCtx = shotContext(sc.s);
      for (let i = 0; i < 20000; i++) {
        const shot = resolveShot(sc.s, 0, 9, tags, keeperCtx, r);
        if (shot.result === 'block') counts.block++;
        if (shot.result === 'goal') counts.goal++;
      }
      expect(Math.abs(counts.block / 20000 - chance)).toBeLessThan(0.015);
      goalShare.push(counts.goal);
    }
    expect(goalShare[0]!).toBeGreaterThan(goalShare[1]!);
    // A block that stays in play runs 4–9 m back toward the shooter from the blocker, here to the
    // shooter himself, who stands in its way.
    const loose = resolveShot(cand.s, 0, 9, tags, ctx, draws(0, 0.9, 0.5));
    expect(loose).toMatchObject({
      result: 'block',
      then: 'loose',
      by: 2,
      via: body,
      winner: [0, 9],
    });
    const [lo, hi] = BOX_CONFIG.shot.rebound.block;
    const land = blockRebound(at, body, draws(0.5));
    expect(land[0]).toBeCloseTo(body[0] - (lo + (hi - lo) * 0.5), 12);
    expect(land[1]).toBe(34);
    expect(loose.at![0]).toBeGreaterThanOrEqual(land[0]);
    expect(loose.at![0]).toBeLessThanOrEqual(body[0]);
    expect(loose.at![1]).toBeCloseTo(34, 9);
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

describe('revision 6 misplaced passes (T542, →MATCH-31)', () => {
  it('revision 6: a misplaced pass in midfield stays in play, one aimed at the touchline goes out', () => {
    const outs = (model: MatchModelRevision, receiver: Point) => {
      const sc = scene(7, [50, 34]);
      sc.s.setup = { ...sc.s.setup, model };
      sc.s.players[0][8]!.pos = [...receiver];
      // A poor passer, so a share of the passes fail with nobody near to cut them out.
      set(sc.s, 0, 7, 'passing', 1);
      const r = random(`t542-misplaced-${model}-${receiver[1]}`);
      const tags = sc.tags();
      return tally(4000, () => resolvePass(sc.s, 0, 7, 8, tags, 'short', false, r)).out ?? 0;
    };
    const [, , , , fifth, sixth] = MATCH_MODEL_REVISIONS;
    expect(outs(fifth, [62, 34])).toBeGreaterThan(0);
    expect(outs(sixth, [62, 34])).toBe(0);
    expect(outs(sixth, [58, 66])).toBeGreaterThan(0);
  });
});

describe('revision 9 failed passes (T580, →MATCH-31)', () => {
  const R = DUEL_CONFIG.candidate.revision9.receiver;
  const press = DUEL_CONFIG.candidate.intercept.share.press;
  /**
   * A pass from [60, 34] to the receiver at [75, 34] against a pressing side, `foes` (side 1's
   * slots 3 on) placed; `draws` start with the completion draw.
   */
  const pass = (model: MatchModelRevision, foes: Point[], draws: number[]) => {
    const sc = scene(7, [60, 34], ['balanced', 'press']);
    sc.s.setup = { ...sc.s.setup, model };
    sc.s.players[0][8]!.pos = [75, 34];
    foes.forEach((p, i) => (sc.s.players[1][3 + i]!.pos = [p[0], p[1]]));
    const queue = [...draws];
    return resolvePass(sc.s, 0, 7, 8, sc.tags(), 'short', false, () => queue.shift() ?? 0.5);
  };
  const ninth = MATCH_MODEL_REVISIONS[8]!;
  const lostAt = (o: Outcome) => (o.kind === 'loose' || o.kind === 'foul' ? o.at : undefined);

  it('revision 9: a failed pass with nobody near its receiver is a miscontrol or kept, never a 50/50', () => {
    // Nobody reaches its path: the failed draws below `miscontrol` run `overrun` m past him, the
    // rest he keeps; revision 8 lost them to a 50/50 at his feet.
    for (const u of [0, R.miscontrol - 1e-6, R.miscontrol, 0.5, 0.95]) {
      const o = pass(ninth, [], [0.9999, u]);
      if (u < R.miscontrol) expect(lostAt(o)).toEqual([75 + R.overrun, 34]);
      else expect(o).toEqual({ kind: 'complete', to: [75, 34], receiver: 8 });
    }
    expect(lostAt(pass(REVISION_8, [], [0.9999, 0.5]))).toEqual([75, 34]);
    // A man in the lane who reaches it but does not cut it out (the draw past the press's share):
    // what is left reads the receiver the same way, scaled to the draws past that share.
    const inLane: Point[] = [[65, 34]];
    expect(pass(ninth, inLane, [0.9999, press - 1e-6])).toMatchObject({
      kind: 'intercepted',
      by: 3,
    });
    const slip = press + R.miscontrol * (1 - press);
    expect(lostAt(pass(ninth, inLane, [0.9999, slip - 1e-6]))).toEqual([75 + R.overrun, 34]);
    expect(pass(ninth, inLane, [0.9999, slip + 1e-6]).kind).toBe('complete');
    expect(lostAt(pass(REVISION_8, inLane, [0.9999, slip + 1e-6]))).toEqual([75, 34]);
    // A miscontrol beside the touchline runs out over it.
    const sc = scene(7, [60, 60], ['balanced', 'press']);
    sc.s.setup = { ...sc.s.setup, model: ninth };
    sc.s.players[0][8]!.pos = [62, 66.5];
    const draws = [0.9999, 0];
    expect(
      resolvePass(sc.s, 0, 7, 8, sc.tags(), 'short', false, () => draws.shift() ?? 0.5),
    ).toMatchObject({ kind: 'out', over: 'touch', lastTouch: 0 });
    // Drawn: the failed passes are mostly kept, and every one lost runs on past him.
    const scene9 = scene(7, [60, 34], ['balanced', 'press']);
    scene9.s.setup = { ...scene9.s.setup, model: ninth };
    scene9.s.players[0][8]!.pos = [75, 34];
    set(scene9.s, 0, 7, 'passing', 0);
    const r = random('t580-free');
    const tags = scene9.tags();
    const outcomes = Array.from({ length: 6000 }, () =>
      resolvePass(scene9.s, 0, 7, 8, tags, 'short', false, r),
    );
    const lost = outcomes.filter((o) => o.kind !== 'complete');
    expect(lost.length).toBeGreaterThan(100);
    for (const o of lost) expect(lostAt(o)).toEqual([75 + R.overrun, 34]);
  });

  it("revision 9: a marked receiver's failed pass is a 50/50 at him", () => {
    // A man 2 m from him, within `near`: every failed draw he does not cut out on the way is a
    // 50/50 at the receiver, which revision 8 split with misplaced balls running past him.
    const marker: Point[] = [[75, 36]];
    expect(R.near).toBeGreaterThan(2);
    for (const u of [0, R.miscontrol - 1e-6, 0.5, 0.95]) {
      const o = pass(ninth, marker, [0.9999, u]);
      if (o.kind === 'intercepted' || (lostAt(o) && lostAt(o)![0] < 75)) continue;
      expect(lostAt(o)).toEqual([75, 34]);
    }
    expect(lostAt(pass(ninth, marker, [0.9999, 0.95]))).toEqual([75, 34]);
    expect(lostAt(pass(REVISION_8, marker, [0.9999, 0.95]))![0]).toBeGreaterThan(75);
    // His man wins some of those 50/50s and he keeps others; the receiver weighs less there.
    const winners = new Set<number>();
    for (let k = 0; k < 40; k++) {
      const o = pass(ninth, marker, [0.9999, 0.95, k / 40, 0.99]);
      if (o.kind === 'loose') winners.add(o.winner[0]);
    }
    expect([...winners].sort()).toEqual([0, 1]);
  });
});

describe('revision 7 closing blocks (T548, →MATCH-35)', () => {
  const [, , , , , sixth, seventh] = MATCH_MODEL_REVISIONS;
  const K = BOX_CONFIG.shot.close;
  const at: Point = [92, 34];
  /** A shot from `at` with one man `behind` m behind the shooter and nobody in its path. */
  const chased = (behind: number, model: MatchModelRevision = seventh, read = 60) => {
    const sc = scene(9, at);
    sc.s.setup = { ...sc.s.setup, model };
    sc.s.players[1][10]!.pos = [at[0] - behind, at[1]];
    set(sc.s, 1, 10, 'tackling', read);
    set(sc.s, 1, 10, 'positioning', read);
    return sc;
  };
  const closers = (sc: ReturnType<typeof scene>) =>
    closingBlockers(sc.s, 0, at, shotBlockers(sc.s, 0, at));

  it('revision 7: a chaser within reach blocks some shots, nearer and sharper more often, nobody beyond the radius', () => {
    const chance = (behind: number, read = 60) =>
      closers(chased(behind, seventh, read)).find((b) => b.gp.idx === 10)?.chance ?? 0;
    // His 태클 and 위치선정 as the match reads them (fatigue and strength scaling included).
    const sc = chased(2);
    const mean = (skill(sc.s, 1, 10, 'tackling') + skill(sc.s, 1, 10, 'positioning')) / 2;
    expect(chance(2)).toBeCloseTo(K.block * (1 - 2 / K.radius) * (mean / K.skill), 12);
    expect(chance(4)).toBeCloseTo(chance(2) / 2, 12);
    expect(chance(1)).toBeGreaterThan(chance(2));
    expect(chance(2, 90)).toBeGreaterThan(chance(2) * 1.3);
    expect(chance(K.radius + 0.5)).toBe(0);
    // Resolved: his share of the shots is his chance; on revision 6 nobody closes it down.
    const blocked = (model: MatchModelRevision) => {
      const sc = chased(2, model);
      const ctx = shotContext(sc.s);
      const tags = sc.tags();
      const r = random(`t548-close-${model}`);
      let by = 0;
      let xg = 0;
      const n = 20000;
      for (let i = 0; i < n; i++) {
        const o = resolveShot(sc.s, 0, 9, tags, ctx, r);
        if (o.kind === 'shot' && o.result === 'block' && o.by === 10) by++;
        if (o.kind === 'shot') xg = o.xg;
      }
      const open = chanceXg(at, { pressure: tags.pressure, candidate: true }, sc.s.math);
      return { share: by / n, xg, open };
    };
    const seventhRead = blocked(seventh);
    expect(Math.abs(seventhRead.share - chance(2))).toBeLessThan(0.012);
    // The recorded chance reads him as it reads the bodies in the path (→MATCH-11).
    expect(seventhRead.xg).toBeCloseTo(seventhRead.open * unblocked(closers(chased(2))), 12);
    expect(blocked(sixth).share).toBe(0);
  });

  it("revision 7: the path's bodies are not counted twice and a header has no closing men", () => {
    const sc = chased(2);
    sc.s.players[1][2]!.pos = [95, 34];
    const path = shotBlockers(sc.s, 0, at);
    expect(path.some((b) => b.gp.idx === 2)).toBe(true);
    expect(closers(sc).map((b) => b.gp.idx)).toEqual([10]);
    // The closing man's draw comes first, the path's next, then the keeper's.
    const draws =
      (...v: number[]) =>
      () =>
        v.shift() ?? 0;
    const ctx = shotContext(sc.s);
    expect(resolveShot(sc.s, 0, 9, sc.tags(), ctx, draws(0))).toMatchObject({
      result: 'block',
      by: 10,
    });
    expect(resolveShot(sc.s, 0, 9, sc.tags(), ctx, draws(0.999, 0))).toMatchObject({
      result: 'block',
      by: 2,
    });
    const header = resolveShot(sc.s, 0, 9, sc.tags(), ctx, draws(0), { header: true });
    expect(header).not.toMatchObject({ by: 10 });
  });
});
