import { describe, expect, it, vi } from 'vitest';
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
  resolveDelivery,
  resolvePass,
  resolvePenalty,
  resolveShot,
  resolveTakeOn,
  shotContext,
  type Outcome,
} from './resolve';
import { deliveryPoint, type DeliveryAim } from './box';
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

  /** A failing candidate pass from [60, 34] to [75, 34], drawn `n` times; `foe` stands where given. */
  const failing = (n: number, seed: string, foe?: Point) => {
    const sc = scene(7, [60, 34], ['balanced', 'press']);
    sc.s.setup = { ...sc.s.setup, model: MATCH_MODEL_REVISION };
    sc.s.players[0][8]!.pos = [75, 34];
    if (foe) sc.s.players[1][3]!.pos = [...foe];
    set(sc.s, 0, 7, 'passing', 0);
    const r = random(seed);
    const tags = sc.tags();
    return Array.from({ length: n }, () => resolvePass(sc.s, 0, 7, 8, tags, 'short', false, r));
  };
  const lostAt = (o: Outcome) => (o.kind === 'loose' || o.kind === 'foul' ? o.at : undefined);

  it('a pass whose lane nobody reaches is never intercepted (T441)', () => {
    const outcomes = failing(20000, 't441-open');
    const kinds = tally(outcomes.length, (i) => outcomes[i]!);
    expect(kinds.intercepted ?? 0).toBe(0);
    expect(kinds.loose).toBeGreaterThan(1000);
    expect(kinds.out).toBeGreaterThan(100);
    // Lost only at its receiver: every loose ball and 50/50 foul is where he stands.
    for (const o of outcomes) {
      const at = lostAt(o);
      if (at) expect(at).toEqual([75, 34]);
    }
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
      return at && (at[0] !== 75 || at[1] !== 34);
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
    const rate = (passer: number, off: number, positioning: number) => {
      const sc = scene(passer, [10, 34]);
      sc.s.setup = { ...sc.s.setup, model: MATCH_MODEL_REVISION };
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
      const ctx = shotContext(sc.s);
      return Array.from({ length: 4000 }, () => resolveDelivery(sc.s, 0, 1, 9, near, tags, ctx, r));
    };
    const his = (o: Outcome, idx: number) =>
      (o.kind === 'intercepted' && o.by === idx) ||
      (o.kind === 'loose' && o.winner[0] === 1 && o.winner[1] === idx);
    const atOf = (o: Outcome) =>
      o.kind === 'intercepted' || o.kind === 'loose' ? o.at : undefined;
    // Nobody reaches it: never cut out; a bad ball is lost at the zone, a good one is his shot.
    const open = deliver('t444-open');
    const kinds = tally(open.length, (i) => open[i]!);
    expect(kinds.intercepted ?? 0).toBe(0);
    expect(kinds.shot).toBeGreaterThan(1500);
    for (const o of open) if (o.kind === 'loose') expect(o.at).toEqual(zone);
    // A centre-back standing in its path, midway: every ball is his where it meets him, cut out
    // `cross.intercept` of the time and headed clear the rest; one at the zone behind him gets none.
    const mid = along(0.5);
    for (const behind of [false, true]) {
      const lane = deliver('t444-lane', (s) => {
        s.players[1][3]!.pos = [mid[0], mid[1]];
        if (behind) s.players[1][4]!.pos = [zone[0], zone[1]];
      });
      expect(lane.every((o) => his(o, 3))).toBe(true);
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
    // A man who only just gets there, at full stretch 2.6 m off its line, is beaten by a good ball
    // (MATCH-31): it reaches the striker as often as an open one does, and a bad one is his.
    const len = Math.hypot(zone[0] - from[0], zone[1] - from[1]);
    const off: Point = [
      mid[0] + ((zone[1] - from[1]) / len) * 2.6,
      mid[1] - ((zone[0] - from[0]) / len) * 2.6,
    ];
    const stretched = (s: GridState) => (s.players[1][3]!.pos = [off[0], off[1]]);
    expect(reachOnPath(setUp(stretched).s, 0, from, zone, 0).first).toMatchObject({
      stretch: true,
      gp: { idx: 3 },
    });
    const stretch = deliver('t444-stretch', stretched);
    const shots = stretch.filter((o) => o.kind === 'shot').length;
    expect(Math.abs(shots - (kinds.shot ?? 0))).toBeLessThan(200);
    for (const o of stretch)
      if (o.kind !== 'shot' && o.kind !== 'out' && o.kind !== 'held') expect(his(o, 3)).toBe(true);
  });

  it('a low ball across the goal area is shot with the foot, not headed (T444)', () => {
    // From the left byline, squared to the striker on the far post; nobody near enough to reach it.
    const square: DeliveryAim = { zone: 'farPost', kind: 'square', ball: -1 };
    const zone = deliveryPoint(0, square);
    const deliver = (aim: DeliveryAim, seed: string) => {
      const sc = scene(1, [101, 4]);
      sc.s.setup = { ...sc.s.setup, model: MATCH_MODEL_REVISION };
      sc.s.players[0][10]!.pos = [zone[0], zone[1]];
      expect(reachOnPath(sc.s, 0, [101, 4], zone, 0).first).toBeUndefined();
      const r = random(seed);
      const tags = sc.tags();
      const ctx = shotContext(sc.s);
      return Array.from({ length: 3000 }, () => resolveDelivery(sc.s, 0, 1, 10, aim, tags, ctx, r));
    };
    const low = deliver(square, 't444-square');
    const shots = low.filter((o) => o.kind === 'shot');
    expect(shots.length).toBeGreaterThan(1200);
    // Every shot is his, first time with the foot: no header, no aerial duel, a cut-back's chance.
    const xg = chanceXg([zone[0], zone[1]], { cutBack: true, pressure: 0, candidate: true });
    expect(xg).toBeGreaterThan(chanceXg([zone[0], zone[1]], { candidate: true }));
    for (const o of shots) {
      expect(o).toMatchObject({ kind: 'shot', shooter: 10 });
      expect(o.kind === 'shot' && (o.header ?? false)).toBe(false);
      expect('aerial' in o).toBe(false);
      expect(o.kind === 'shot' && o.xg).toBeCloseTo(xg, 12);
    }
    expect(low.some((o) => o.kind === 'complete')).toBe(false);
    // Lofted to the same man instead: the keeper's claim and his header, or he brings it down.
    const high = deliver({ ...square, kind: 'far' }, 't444-far');
    expect(high.filter((o) => o.kind === 'shot' && o.header).length).toBeGreaterThan(100);
    expect(high.filter((o) => o.kind === 'shot' && !o.header)).toHaveLength(0);
    for (const o of high) if (o.kind === 'complete') expect(o.to).toEqual(zone);
    expect(high.some((o) => o.kind === 'held')).toBe(true);
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
