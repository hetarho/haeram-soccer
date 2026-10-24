import { describe, expect, it } from 'vitest';
import { MATCH_MODEL_REVISION } from '../../../contracts/src/match-model';
import { random } from '../primitives';
import { createWorld } from '../index';
import { playGrid } from './engine';
import {
  interruptAll,
  takeBall,
  updateIntentions,
  type EndedIntention,
  type Intention,
} from './intentions';
import {
  advance,
  carryInStride,
  flightSeconds,
  GRID_BALL_CONFIG,
  GRID_MOVEMENT_CONFIG,
  heading,
  IN_STRIDE_CONFIG,
  prepareOnClock,
  prepareRestart,
  presserOf,
  reachSeconds,
  readAt,
  stepToward,
  strideSpeed,
  type MotionKnot,
  type Mover,
} from './movement';
import { attackFrame, cellOf } from './pitch';
import { playRestart, RESTART_CONFIG, type Restart } from './restarts';
import { shotContext } from './resolve';
import { buildGridSetup } from './setup';
import { SHAPE_CONFIG, setPieceTargets, speedOf, targetOf, type SetPieceScene } from './shape';
import { createState, onPitch, skill, type GridPlayer, type GridState } from './state';
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
// Six observed matches (four until T398, whose late box runs left those four without a cross the
// attackers kept from a set piece, which the placement check below needs).
const watched = Array.from({ length: 6 }, (_, i) =>
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

  it('keeps off-ball players on their way until they read the kick (T324)', () => {
    const s = field();
    const [mate, foe] = [s.players[0][6]!, s.players[1][3]!];
    mate.pos = [40, 30];
    foe.pos = [60, 30];
    // Both were heading upfield (x + 20) before the pass and now turn back to x − 20.
    const plan = [mate, foe].map((gp) => ({
      gp,
      to: [gp.pos[0] - 20, 30] as [number, number],
      before: [gp.pos[0] + 20, 30] as [number, number],
      readAt: 1,
    }));
    advance(s, 1, plan);
    expect(mate.pos[0]).toBeGreaterThan(40);
    expect(foe.pos[0]).toBeGreaterThan(60);
    // After the read they brake and come back toward the new point.
    advance(
      s,
      4,
      [mate, foe].map((gp) => ({ gp, to: [gp === mate ? 20 : 40, 30] as [number, number] })),
    );
    expect(mate.vel![0]).toBeLessThan(0);
    // A teammate reads at the kick; a defender earlier by his 위치선정, never before the action.
    const kick = 1.5;
    expect(readAt(s, mate, 0, kick)).toBe(kick);
    const read = GRID_MOVEMENT_CONFIG.read;
    const share = Math.min(99, Math.max(1, skill(s, 1, foe.idx, 'positioning'))) / 99;
    expect(readAt(s, foe, 0, kick)).toBeCloseTo(Math.max(0, kick * (1 - read * share)), 9);
    expect(readAt(s, foe, 0, kick)).toBeGreaterThanOrEqual(0);
    expect(readAt(s, foe, 0, kick)).toBeLessThanOrEqual(kick);
    // `heading` reads where everyone was going before the action changed the state.
    const h = heading(s);
    expect(h.get(mate)).toEqual(targetOf(s, 0, mate.idx));
    expect(h.get(foe)).toEqual(targetOf(s, 1, foe.idx));
  });

  it('carries the ball in stride at a bounded pace, and shields it when pressed (T426)', () => {
    const s = field();
    const gp = s.players[0][6]!;
    const pace = (n: number) =>
      (gp.player = { ...gp.player, attrs: { ...gp.player.attrs, pace: n } });
    // A fresh player of average pace strides at the configured pace; pace and fatigue scale it.
    pace(50);
    expect(strideSpeed(s, gp)).toBeCloseTo(IN_STRIDE_CONFIG.speed, 9);
    pace(90);
    const quick = strideSpeed(s, gp);
    expect(quick).toBeGreaterThan(IN_STRIDE_CONFIG.speed);
    expect(quick / IN_STRIDE_CONFIG.speed).toBeCloseTo(
      speedOf(s, gp) / (SHAPE_CONFIG.speed.base + (SHAPE_CONFIG.speed.pace * 50) / 99),
      9,
    );
    // Standing, he takes it toward his aim, accelerating within the rules, and is still running.
    gp.pos = [40, 30];
    gp.vel = undefined;
    carryInStride(s, gp, [60, 30], 1.6);
    expect(gp.pos[0]).toBeGreaterThan(41);
    expect(gp.pos[0] - 40).toBeLessThanOrEqual(quick * 1.6 + EPS);
    expect(gp.pos[1]).toBeCloseTo(30, 9);
    expect(gp.vel![0]).toBeGreaterThan(0);
    // Running across, he blends his heading with the aim instead of turning on the spot.
    gp.pos = [40, 30];
    gp.vel = [0, quick];
    carryInStride(s, gp, [60, 30], 1);
    expect(gp.pos[0]).toBeGreaterThan(40);
    expect(gp.pos[1]).toBeGreaterThan(30);
    // A cell he must not leave (a shot's) stops him at its edge: band 4 ends at 70 m.
    gp.pos = [68, 30];
    gp.vel = undefined;
    carryInStride(s, gp, [105, 34], 2, cellOf(attackFrame(0, gp.pos)));
    expect(cellOf(gp.pos)).toBe(cellOf([68, 30]));
    expect(gp.pos[0]).toBeGreaterThan(69.9);
    // The other side mirrors: side 1 attacks toward x = 0 and keeps its own cell too.
    const foe = s.players[1][6]!;
    foe.pos = [37, 30];
    foe.vel = undefined;
    carryInStride(s, foe, [0, 34], 2, cellOf(attackFrame(1, foe.pos)));
    expect(cellOf(attackFrame(1, foe.pos))).toBe(cellOf(attackFrame(1, [37, 30])));
    expect(foe.pos[0]).toBeLessThan(35.1);
    // The nearest opponent within the pressure radius presses him.
    gp.pos = [40, 30];
    foe.pos = [gp.pos[0] + IN_STRIDE_CONFIG.pressureRadius - 0.1, gp.pos[1]];
    expect(presserOf(s, gp)).toBe(foe);
    foe.pos = [gp.pos[0] + IN_STRIDE_CONFIG.pressureRadius + 0.1, gp.pos[1]];
    expect(presserOf(s, gp)).toBeUndefined();
    // Pressed from in front (1.2 m goal-side), he shields it on the move, away from the presser at
    // the same pace, while the presser tracks him on his intention and the others move on theirs.
    gp.vel = undefined;
    foe.pos = [41.2, 30];
    foe.vel = undefined;
    foe.intention = {
      kind: 'press',
      priority: 'committed',
      target: [41.2, 30],
      opponent: gp.idx,
      since: 0,
      until: 60,
    };
    const idle = s.players[0][2]!;
    const was = [idle.pos[0], idle.pos[1]];
    const idleTo = targetOf(s, 0, idle.idx);
    carryInStride(s, gp, [60, 30], 1.6);
    expect(gp.pos[0]).toBeLessThan(39);
    expect(40 - gp.pos[0]).toBeLessThanOrEqual(quick * 1.6 + EPS);
    expect(gap(foe.pos, gp.pos)).toBeLessThan(IN_STRIDE_CONFIG.pressureRadius);
    expect(foe.pos[0]).toBeLessThan(41.2);
    // The ball goes with him; a player with nothing to track heads for his place.
    expect(s.ball).toEqual(gp.pos);
    if (gap(was, idleTo) > 0.1) expect(gap(idle.pos, idleTo)).toBeLessThan(gap(was, idleTo));
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

  /** Delivered set pieces both ways (T348): corners from both touchlines and a crossed wide free kick. */
  const DELIVERIES: Restart[] = [
    { kind: 'corner', side: 0, spot: [105, 0.5], dead: RESTART_CONFIG.dead.corner },
    { kind: 'corner', side: 0, spot: [105, 67.5], dead: RESTART_CONFIG.dead.corner },
    { kind: 'corner', side: 1, spot: [0, 0.5], dead: RESTART_CONFIG.dead.corner },
    { kind: 'corner', side: 1, spot: [0, 67.5], dead: RESTART_CONFIG.dead.corner },
    { kind: 'freeKick', side: 0, spot: [92, 6], dead: RESTART_CONFIG.dead.freeKick },
    { kind: 'freeKick', side: 1, spot: [13, 62], dead: RESTART_CONFIG.dead.freeKick },
  ];
  type Job = Pick<Intention, 'kind' | 'priority' | 'since' | 'opponent' | 'run'> | null;
  /**
   * A delivered set piece on the candidate model in stages, as `playGrid` plays it (T348): from
   * where everyone stood when the ball went dead, through the candidate preparation to the kick,
   * the delivery to the first man up, the second ball laid off to the man at the edge and the
   * defenders winning it. Each stage records the clock, everyone's position and job, and the ball.
   */
  function deliveredSetPiece(rs: Restart) {
    const s = createState({ ...kit.setup, model: MATCH_MODEL_REVISION });
    s.elapsed = s.t = 900;
    const corner = rs.kind === 'corner';
    const rest: [number, number] = corner ? [rs.spot[0], rs.spot[1] < 34 ? 20 : 48] : rs.spot;
    s.ball = [rest[0], rest[1]];
    const all = s.players.flat();
    const stages: { at: number; pos: [number, number][]; jobs: Job[]; ball: [number, number] }[] =
      [];
    const snap = () =>
      stages.push({
        at: s.elapsed,
        pos: all.map((gp) => [gp.pos[0], gp.pos[1]]),
        jobs: all.map((gp) => {
          const i = gp.intention;
          return i
            ? {
                kind: i.kind,
                priority: i.priority,
                since: i.since,
                ...(i.opponent === undefined ? {} : { opponent: i.opponent }),
                ...(i.run ? { run: i.run } : {}),
              }
            : null;
        }),
        ball: [s.ball[0], s.ball[1]],
      });
    snap();
    let scene: SetPieceScene | undefined;
    let taker = -1;
    const prepare = prepareOnClock(rest, { knots: [] as MotionKnot[] });
    const r = random(`delivered:${rs.side}:${rs.spot.join(',')}`);
    playRestart(s, rs, r, shotContext(s), (st, restart, t, sc) => {
      scene = sc;
      taker = t;
      prepare(st, restart, t, sc);
    });
    snap();
    /** `gp` gets the ball where he stands from `from`, everyone reacts, and `seconds` pass. */
    const hand = (gp: GridPlayer, from: number | undefined, seconds: number) => {
      if (s.possession !== gp.side) interruptAll(s, 'turnover');
      takeBall(s, gp, gp.pos, from);
      s.owner = [gp.side, gp.idx];
      s.possession = gp.side;
      s.ball = [gp.pos[0], gp.pos[1]];
      updateIntentions(s);
      advance(s, seconds);
      s.elapsed += seconds;
      s.t += seconds;
      snap();
    };
    const up = scene!.up.map((u) => u.gp);
    // The cross's 3.2 s (`ACTION_SECONDS.cross`), a lay-off, then the clearance.
    hand(up[0]!, taker, 3.2);
    hand(up.at(-1)!, up[0]!.idx, 2.4);
    hand(scene!.marks.find((m) => m.opponent === up.at(-1))!.gp, undefined, 2);
    return { stages, scene: scene!, all };
  }

  it('both sides retain continuous recorded paths through a corner', () => {
    const P = SHAPE_CONFIG.setPiece;
    for (const rs of DELIVERIES) {
      const label = `${rs.kind} by ${rs.side} from ${rs.spot.join(',')}`;
      const { stages, scene, all } = deliveredSetPiece(rs);
      // Repeated same-seed runs reproduce exactly.
      expect(deliveredSetPiece(rs).stages, label).toEqual(stages);
      const at = (gp: GridPlayer) => all.indexOf(gp);
      // Bounded travel between stages for everyone on the pitch, preparation included.
      for (let k = 1; k < stages.length; k++)
        all.forEach((gp, i) => {
          if (!onPitch(gp)) return;
          const [a, b] = [stages[k - 1]!, stages[k]!];
          expect(gap(b.pos[i]!, a.pos[i]!), `${label} stage ${k}`).toBeLessThanOrEqual(
            TOP * (b.at - a.at) + EPS,
          );
        });
      // The delivery boundary: at the kick everyone in the scene stands on his place, both sides.
      const [, kick, delivered, second, cleared] = stages;
      for (const { gp, to } of [...scene.up, ...scene.marks])
        expect(kick!.pos[at(gp)], label).toEqual(to);
      const since = kick!.at;
      const job = (stage: (typeof stages)[number], gp: GridPlayer) => stage.jobs[at(gp)];
      const owner = (stage: (typeof stages)[number]) =>
        all.find((gp) => gap(gp.pos, stage.ball) === 0 && job(stage, gp)?.kind === 'receive');
      for (const stage of [delivered!, second!]) {
        const carrier = owner(stage);
        // Each man still holding his spot keeps his marker, goal-side within reach of him.
        for (const { gp, opponent } of scene.marks.filter((m) => m.opponent)) {
          const theirs = job(stage, opponent!);
          if (theirs?.kind !== 'run') continue;
          expect(theirs, label).toMatchObject({ run: 'box', since });
          expect(job(stage, gp), label).toMatchObject({
            kind: 'mark',
            opponent: opponent!.idx,
            since,
          });
          expect(gap(stage.pos[at(gp)]!, stage.pos[at(opponent!)]!)).toBeLessThanOrEqual(
            SHAPE_CONFIG.markGoalSide + EPS,
          );
        }
        // Each zone and the goal stay guarded, unless a guard went out to press the ball.
        for (const { gp, to } of scene.marks.filter((m) => !m.opponent)) {
          const mine = job(stage, gp);
          if (mine?.kind === 'press')
            expect(mine).toMatchObject({ priority: 'danger', opponent: carrier?.idx });
          else {
            expect(mine, label).toMatchObject({ kind: 'cover', since });
            expect(gap(stage.pos[at(gp)]!, to)).toBeLessThanOrEqual(
              P.zone + SHAPE_CONFIG.markGoalSide,
            );
          }
        }
        expect(job(stage, scene.keeper!), label).toMatchObject({ kind: 'cover', since });
      }
      // The keeper answers the delivery: it moves his target, so he moves, inside his goal area.
      const keeper = at(scene.keeper!);
      expect(gap(delivered!.pos[keeper]!, kick!.pos[keeper]!), label).toBeGreaterThan(0.1);
      for (const stage of [delivered!, second!]) {
        const k = attackFrame(scene.keeper!.side, stage.pos[keeper]!);
        expect(k[0], label).toBeLessThanOrEqual(5.5);
        expect(Math.abs(k[1] - 34)).toBeLessThanOrEqual(P.keeper.wide + EPS);
      }
      // Once the defenders win the second ball, no set-piece job is left on either side.
      expect(
        cleared!.jobs.some((j) => j?.since === since && j.priority === 'committed'),
        label,
      ).toBe(false);
    }
  });

  it('defensive placement is not discarded before its job ends', () => {
    const stay = SHAPE_CONFIG.setPiece.stay;
    const ENDS = new Set<string>([
      'expiry',
      'cleared',
      'turnover',
      'restart',
      'danger',
      'replaced',
      'departed',
      'unreachable',
      'substitution',
      'injury',
      'dismissal',
    ]);
    let deliveries = 0,
      kept = 0,
      followed = 0,
      ended = 0;
    for (const { trace } of watched)
      trace!.forEach((e, n) => {
        if (!(e.action === 'corner' || (e.spot && e.kind === 'cross'))) return;
        // The jobs start as the preparation ends: its retrieval knot plus its dead time.
        const retrieve = e.knots?.[0];
        if (retrieve?.kind !== 'retrieve') return;
        const kick = { at: retrieve.at + e.dead! };
        deliveries++;
        const att = e.side;
        const def = att === 0 ? 1 : 0;
        const slotOf = (side: 0 | 1, idx: number) => {
          for (let k = side * 11; k < side * 11 + 11; k++) if (e.slots[k] === idx) return k;
          return -1;
        };
        // The defenders' jobs as the delivery lands: one end with the attackers' hold, every mark on
        // a different man on the pitch, each marker still with him.
        const jobs: { k: number; i: Intention }[] = [];
        for (let k = def * 11; k < def * 11 + 11; k++) {
          const i = e.intentions?.[k];
          if (!i || 'end' in i || i.since !== kick.at || i.priority !== 'committed') continue;
          // A defender who won the delivery commits to the ball instead.
          if (i.kind !== 'mark' && i.kind !== 'cover') continue;
          expect(i.until).toBeCloseTo(kick.at + stay, 6);
          jobs.push({ k, i });
        }
        const marked = jobs.flatMap(({ i }) => (i.kind === 'mark' ? [i.opponent!] : []));
        expect(new Set(marked).size).toBe(marked.length);
        for (const { k, i } of jobs) {
          if (i.kind !== 'mark') continue;
          const o = slotOf(att, i.opponent!);
          expect(o).toBeGreaterThanOrEqual(0);
          const d = Math.hypot(
            e.positions[k * 2]! - e.positions[o * 2]!,
            e.positions[k * 2 + 1]! - e.positions[o * 2 + 1]!,
          );
          expect(d, `mark at ${e.elapsed}`).toBeLessThanOrEqual(SHAPE_CONFIG.markGoalSide + 1);
        }
        // A cross the attackers keep leaves the defending scene in place, the keeper on his goal.
        if (e.outcome === 'complete') {
          kept++;
          expect(jobs.length).toBeGreaterThanOrEqual(6);
          expect(jobs.some(({ k }) => k === def * 11)).toBe(true);
        }
        // Each job holds until it ends with a reason, never on arrival, and never once the
        // defenders have the ball or another restart has been taken.
        for (const { k, i } of jobs) {
          followed++;
          for (let m = n + 1; m < trace!.length; m++) {
            const f = trace![m]!;
            const j: Intention | EndedIntention | null | undefined = f.intentions?.[k];
            if (f.period !== e.period || f.slots[k] !== e.slots[k]) break;
            if (!j || j.since !== i.since || j.kind !== i.kind) break;
            if ('end' in j) {
              expect(ENDS.has(j.reason), j.reason).toBe(true);
              ended++;
              break;
            }
            if (f.outcome === 'incident') continue;
            expect(f.side, `held at ${f.elapsed}`).toBe(att);
            expect(f.spot, `held at ${f.elapsed}`).toBeUndefined();
          }
        }
      });
    expect(deliveries).toBeGreaterThan(20);
    expect(kept).toBeGreaterThan(0);
    expect(followed).toBeGreaterThan(100);
    expect(ended).toBeGreaterThan(0);
  });
});
