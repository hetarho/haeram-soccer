import { describe, expect, it } from 'vitest';
import { MATCH_MODEL_REVISION } from '../../../contracts/src/match-model';
import { createWorld } from '../index';
import { playGrid } from './engine';
import {
  advance,
  flightSeconds,
  GRID_BALL_CONFIG,
  GRID_MOVEMENT_CONFIG,
  prepareRestart,
  reachSeconds,
  stepToward,
  type Mover,
} from './movement';
import { RESTART_CONFIG, type Restart } from './restarts';
import { buildGridSetup } from './setup';
import { SHAPE_CONFIG, setPieceTargets, speedOf } from './shape';
import { onPitch, type GridState } from './state';
import type { TraceEntry } from './trace';
import { gridKit } from './testkit';

const C = GRID_MOVEMENT_CONFIG;
/** The fastest any player runs: full pace, fresh, recovering after a turnover. */
const TOP = (SHAPE_CONFIG.speed.base + SHAPE_CONFIG.speed.pace) * SHAPE_CONFIG.recoverySpeed;
const EPS = 1e-3;

const kit = gridKit();
function field(): GridState {
  const s = kit.state;
  s.players.forEach((side, sd) =>
    side.forEach((gp, i) => {
      gp.pos = sd === 0 ? [20 + i * 3, 20] : [85 - i * 3, 48];
      gp.vel = undefined;
      gp.run = undefined;
      gp.sentOff = false;
    }),
  );
  s.elapsed = 0;
  s.t = 0;
  s.owner = undefined;
  s.lastLoss = undefined;
  s.lastRegain = undefined;
  return s;
}

const w = createWorld({
  country: 'ENG',
  name: 'Grid Movement Lab',
  color: '#2a5d8f',
  seed: 'grid-movement',
  level: 'normal',
});
const [home, away] = w.clubs.filter(
  (c) => c.country === 'ENG' && c.tier === 0 && c.id !== w.playerClub,
);
const watched = Array.from({ length: 4 }, (_, i) =>
  playGrid(
    buildGridSetup(
      w,
      { ...w.fixtures[0]!, id: `movement-${i}`, home: home!.id, away: away!.id },
      { observe: true, recordPlayers: true, model: MATCH_MODEL_REVISION },
    ),
  ),
);

/** Each on-pitch player's position in an entry, by side and roster index. */
function where(e: TraceEntry): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  for (let k = 0; k < 22; k++)
    if (e.slots[k]! >= 0)
      out.set(`${k < 11 ? 0 : 1}:${e.slots[k]}`, [e.positions[k * 2]!, e.positions[k * 2 + 1]!]);
  return out;
}
const gap = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);

/** Every player present in both entries moved no faster than the top speed allows. */
function expectContinuous(a: TraceEntry, b: TraceEntry) {
  const before = where(a);
  for (const [key, p] of where(b)) {
    const q = before.get(key);
    if (q)
      expect(gap(p, q), `${key} at ${b.elapsed}`).toBeLessThanOrEqual(
        TOP * (b.elapsed - a.elapsed) + EPS,
      );
  }
}

describe('grid movement', () => {
  it('bounds speed acceleration and turning', () => {
    const m: Mover = { pos: [10, 10] };
    const vmax = 7.5;
    const speeds: number[] = [];
    const headings: number[] = [];
    const run = (target: [number, number], steps: number) => {
      for (let i = 0; i < steps; i++) {
        stepToward(m, target, vmax, C.step);
        const v = m.vel!;
        speeds.push(Math.hypot(v[0], v[1]));
        headings.push(Math.atan2(v[1], v[0]));
      }
    };
    const reach = reachSeconds(m, [90, 50], vmax);
    run([90, 50], 40);
    // Then reverse toward the start while still running.
    run([10, 10], 120);
    let prev = 0;
    speeds.forEach((v, i) => {
      expect(v).toBeLessThanOrEqual(vmax + 1e-9);
      expect(v - prev).toBeLessThanOrEqual(C.acceleration * C.step + 1e-9);
      expect(prev - v).toBeLessThanOrEqual(C.braking * C.step + 1e-9);
      if (i > 0 && v > 1e-9 && prev > 1e-9) {
        let turn = Math.abs(headings[i]! - headings[i - 1]!);
        if (turn > Math.PI) turn = 2 * Math.PI - turn;
        expect(turn).toBeLessThanOrEqual(((C.turn * Math.PI) / 180) * C.step + 1e-9);
      }
      prev = v;
    });
    expect(Math.max(...speeds)).toBeCloseTo(vmax, 6);
    // A dry run predicts exactly when he stands on the point.
    const probe: Mover = { pos: [10, 10] };
    for (let t = 0; t < reach - 1e-9; t += C.step) stepToward(probe, [90, 50], vmax, C.step);
    expect(probe.pos).toEqual([90, 50]);
    expect(m.pos).toEqual([10, 10]);
    expect(m.vel).toEqual([0, 0]);
    // Top speed reads pace and fatigue.
    const s = field();
    const gp = s.players[0][5]!;
    gp.player = { ...gp.player, attrs: { ...gp.player.attrs, pace: 90 } };
    const fast = speedOf(s, gp);
    gp.player = { ...gp.player, attrs: { ...gp.player.attrs, pace: 50 } };
    expect(speedOf(s, gp)).toBeLessThan(fast);
    s.elapsed = 90 * 60;
    expect(speedOf(s, gp)).toBeLessThan(fast);
    const from = [...gp.pos];
    advance(s, 3, [{ gp, to: [gp.pos[0] + 60, gp.pos[1]] }]);
    expect(gap(gp.pos, from)).toBeLessThanOrEqual(speedOf(s, gp) * 3 + EPS);
  });

  it('does not teleport the restart taker or set-piece group', () => {
    const s = field();
    const taker = 9;
    s.players[0][taker]!.pos = [5, 60];
    const rs: Restart = {
      kind: 'corner',
      side: 0,
      spot: [105, 0.5],
      dead: RESTART_CONFIG.dead.corner,
    };
    const scene = setPieceTargets(s, 0, taker);
    const group = [...scene.up, ...scene.marks];
    expect(group.length).toBeGreaterThan(4);
    const before = new Map(s.players.flat().map((gp) => [gp, [...gp.pos]]));
    const reach = Math.max(
      reachSeconds(s.players[0][taker]!, rs.spot, speedOf(s, s.players[0][taker]!)),
      ...group.map(({ gp, to }) => reachSeconds(gp, to, speedOf(s, gp))),
    );
    prepareRestart(s, rs, taker, [104, 3], group);
    expect(rs.dead).toBe(Math.max(RESTART_CONFIG.dead.corner, reach));
    expect(s.elapsed).toBe(rs.dead);
    expect(s.players[0][taker]!.pos).toEqual([105, 0.5]);
    for (const { gp, to } of group) expect(gp.pos).toEqual(to);
    for (const gp of s.players.flat())
      if (onPitch(gp))
        expect(gap(gp.pos, before.get(gp)!)).toBeLessThanOrEqual(TOP * rs.dead + EPS);
    // A taker too far for the nominal dead time is waited for instead of moved.
    const t = field();
    t.players[1][4]!.pos = [104, 67];
    const throwIn: Restart = {
      kind: 'throwIn',
      side: 1,
      spot: [2, 0],
      dead: RESTART_CONFIG.dead.throwIn,
    };
    const need = reachSeconds(t.players[1][4]!, throwIn.spot, speedOf(t, t.players[1][4]!));
    expect(need).toBeGreaterThan(RESTART_CONFIG.dead.throwIn);
    prepareRestart(t, throwIn, 4, [2, 0]);
    expect(throwIn.dead).toBe(need);
    expect(t.players[1][4]!.pos).toEqual([2, 0]);
    // On a whole candidate match nobody moves faster than he can, through every restart.
    for (const { trace } of watched)
      for (let k = 1; k < trace!.length; k++)
        if (trace![k]!.transition !== 'period') expectContinuous(trace![k - 1]!, trace![k]!);
  });

  it('records retrieval before the kick', () => {
    const s = field();
    s.players[0][2]!.pos = [10, 30];
    const rs: Restart = {
      kind: 'goalKick',
      side: 0,
      spot: [5.5, 34],
      dead: RESTART_CONFIG.dead.goalKick,
    };
    const knots = prepareRestart(s, rs, 2, [0, 50]);
    expect(knots.map((k) => k.kind)).toEqual(['retrieve', 'place']);
    expect(knots[0]!.ball).toEqual([0, 50]);
    expect(knots[1]!.ball).toEqual([5.5, 34]);
    expect(knots[1]!.at - knots[0]!.at).toBeCloseTo(
      gap([0, 50], [5.5, 34]) / GRID_BALL_CONFIG.retrieval + GRID_BALL_CONFIG.placement,
      9,
    );
    expect(knots[1]!.at).toBeLessThanOrEqual(s.elapsed);
    let restarts = 0;
    for (const { trace } of watched)
      trace!.forEach((e) => {
        if (!e.spot || !e.knots || e.knots[0]?.kind !== 'retrieve') return;
        restarts++;
        const [retrieve, place, ...rest] = e.knots;
        expect(place!.kind).toBe('place');
        expect(place!.ball).toEqual(e.spot);
        expect(place!.at).toBeGreaterThanOrEqual(retrieve!.at);
        expect(place!.at - retrieve!.at).toBeGreaterThanOrEqual(
          gap(retrieve!.ball, e.spot) / GRID_BALL_CONFIG.retrieval - 1e-9,
        );
        const kick = rest[0];
        if (kick) expect(kick.at).toBeGreaterThanOrEqual(retrieve!.at + e.dead! - 1e-9);
        if (kick) expect(kick.at).toBeGreaterThanOrEqual(place!.at);
        expect(e.dead!).toBeGreaterThanOrEqual(place!.at - retrieve!.at - 1e-9);
      });
    // Every restart but the period kick-offs carries its retrieval.
    const expected = watched.reduce(
      (n, { trace }) => n + trace!.filter((e) => e.spot && e.outcome !== 'incident').length,
      0,
    );
    expect(restarts).toBe(expected - watched.reduce((n, r) => n + r.record.added!.length, 0));
  });

  it('waits for a long flight to land', () => {
    expect(flightSeconds([0, 0], [70, 0], 'pass')).toBeCloseTo(3.5, 9);
    expect(flightSeconds([0, 0], [80, 0], 'shot')).toBeCloseTo(80 / 30, 9);
    let longest = 0;
    for (const { trace } of watched)
      for (const e of trace!) {
        const knots = e.knots ?? [];
        const kick = knots.findIndex((k) => k.kind === 'kick');
        if (kick < 0) continue;
        const end = knots.at(-1)!;
        let distance = 0;
        for (let i = kick + 1; i < knots.length; i++)
          distance += gap(knots[i]!.ball, knots[i - 1]!.ball);
        // The ball never flies faster than the fastest kick, and the action lasts until it lands.
        expect(end.at - knots[kick]!.at).toBeGreaterThanOrEqual(
          distance / GRID_BALL_CONFIG.max - 1e-9,
        );
        expect(e.elapsed).toBeGreaterThanOrEqual(end.at - 1e-9);
        longest = Math.max(longest, distance);
        // A long pass or clearance in one flight takes at least its distance at pass speed.
        if (distance > 50 && knots.length - kick === 2 && e.result === undefined)
          expect(end.at - knots[kick]!.at).toBeGreaterThanOrEqual(
            distance / GRID_BALL_CONFIG.pass - 1e-9,
          );
      }
    expect(longest).toBeGreaterThan(50);
  });

  it('keeps continuity at minute boundaries', () => {
    let crossings = 0;
    for (const { trace } of watched) {
      const plays = trace!.filter((e) => e.outcome !== 'incident');
      let lastKnot = 0;
      for (let k = 1; k < plays.length; k++) {
        const [a, b] = [plays[k - 1]!, plays[k]!];
        for (const knot of b.knots ?? []) {
          expect(knot.at).toBeGreaterThanOrEqual(lastKnot - 1e-9);
          expect(knot.at).toBeLessThanOrEqual(b.elapsed + 1e-9);
          lastKnot = knot.at;
        }
        // A new period starts from the kick-off line-up; within one the ball picks up where it stopped.
        if (a.period !== b.period) continue;
        if (Math.floor(a.elapsed / 60) !== Math.floor(b.elapsed / 60)) crossings++;
        expect(
          gap(b.knots?.[0]?.ball ?? b.ball, a.ball),
          `${b.action} at ${b.elapsed}`,
        ).toBeLessThan(1e-6);
        expectContinuous(a, b);
      }
    }
    expect(crossings).toBeGreaterThan(300);
  });
});
