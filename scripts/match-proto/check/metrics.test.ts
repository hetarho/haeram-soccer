import { describe, expect, it } from 'vitest';
import { demoFixture } from '../core/squads.ts';
import type { Fixture, Frame, Playback, StageEvent, Vec } from '../core/types.ts';
import { beats } from '../stage/script.testkit.ts';
import { computeMetrics, type Metric } from './metrics.ts';
import { fakePlayback, frameOf, kickOffPlace, type FrameOverrides } from './playback.testkit.ts';

const FIXTURE = demoFixture();
const T = 0.1;

const metricOf = (pb: Playback, id: string): Metric | undefined =>
  computeMetrics(pb).find((m) => m.id === id);
const get = (pb: Playback, id: string): Metric => {
  const m = metricOf(pb, id);
  if (!m) throw new Error('no metric ' + id);
  return m;
};

const event = (
  t: number,
  kind: StageEvent['kind'],
  extra: Partial<StageEvent> = {},
): StageEvent => ({ t, beat: 0, kind, team: 0, actor: 6, at: [52.5, 34], ...extra });

/** Players `indexes` at x `x`, 6 m apart across from y = 4. */
const lineAt = (indexes: readonly number[], x: number): Record<number, Vec> =>
  Object.fromEntries(indexes.map((i, k) => [i, [x, 4 + 6 * k] as Vec]));
const H_OUTFIELD = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const A_OUTFIELD = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

describe('staging metrics', () => {
  it('maxStep catches a teleport', () => {
    const [x, y] = kickOffPlace(3);
    const walk = fakePlayback({
      frames: [frameOf(0), frameOf(T, { players: { 3: [x + 1, y] } })],
    });
    expect(get(walk, 'kinematics.maxStep')).toMatchObject({ value: 10, pass: true });
    const jump = fakePlayback({
      frames: [frameOf(0), frameOf(T, { players: { 3: [x + 5, y] } })],
    });
    expect(get(jump, 'kinematics.maxStep')).toMatchObject({ value: 50, pass: false });
    expect(get(jump, 'kinematics.maxStep').detail).toContain('player=H4');
  });

  it('ball.maxSpeed catches a jumping ball', () => {
    const pb = fakePlayback({
      frames: [
        frameOf(0, { ball: [40, 30] }),
        frameOf(T, { ball: [41, 30] }),
        frameOf(2 * T, { ball: [47, 30] }),
      ],
    });
    expect(get(pb, 'ball.maxSpeed')).toMatchObject({ value: 1, pass: false });
    const steady = fakePlayback({ frames: [frameOf(0), frameOf(T)] });
    expect(get(steady, 'ball.maxSpeed')).toMatchObject({ value: 0, pass: true });
  });

  it("ball.ownerDistance reads the share of frames at the owner's feet", () => {
    const [x, y] = kickOffPlace(9);
    const held = (t: number, off: number): ReturnType<typeof frameOf> =>
      frameOf(t, { owner: 9, mode: 'held', ball: [x + off, y] });
    const pb = fakePlayback({
      frames: [held(0, 0.6), held(T, 0.6), held(2 * T, 1), held(3 * T, 3), frameOf(4 * T)],
    });
    expect(get(pb, 'ball.ownerDistance')).toMatchObject({ value: 0.75, pass: false });
  });

  it("events.reception and events.contest read the distance at the event's frame", () => {
    const frames = [frameOf(0), frameOf(T), frameOf(2 * T, { players: { 10: [60, 30] } })];
    const pb = fakePlayback({
      frames,
      events: [
        event(T, 'receive', { other: 10, at: [60.5, 30] }),
        event(2 * T, 'receive', { other: 10, at: [60.5, 30] }),
        event(2 * T, 'tackle', { other: 10, at: [61, 30] }),
        event(2 * T, 'save', { other: 11, at: [61, 30] }),
      ],
    });
    expect(get(pb, 'events.reception')).toMatchObject({ value: 0.5, pass: false });
    expect(get(pb, 'events.contest')).toMatchObject({ value: 0.5, pass: false });
  });

  it('recast and stretch rates divide by the contested events', () => {
    const pb = fakePlayback({
      frames: [frameOf(0)],
      events: [
        event(0, 'intercept', { other: 15, recast: true }),
        event(0, 'tackle', { other: 15 }),
        event(0, 'foul', { other: 15 }),
        event(0, 'block', { other: 15, stretch: true }),
        event(0, 'save', { other: 11 }),
      ],
    });
    expect(get(pb, 'events.recastRate')).toMatchObject({ value: 0.25, pass: true });
    expect(get(pb, 'events.stretchRate')).toMatchObject({ value: 0.25, pass: false });
  });

  it('offside.consistency flags an ordinary pass to an offside man and an offside call on an onside man', () => {
    const defence = { ...lineAt(A_OUTFIELD, 70), 11: [100, 34] as Vec };
    const at = (k: number, players: Record<number, Vec>): ReturnType<typeof frameOf> =>
      frameOf(k * T, {
        beat: k,
        owner: 6,
        ball: [60, 34],
        players: { ...defence, 6: [60, 34], ...players },
      });
    const list = beats(FIXTURE, [
      { kind: 'pass', actor: 6, receiver: 9, to: [80, 30] },
      { kind: 'pass', actor: 6, receiver: 10, to: [65, 40], outcome: 'offside' },
      { kind: 'pass', actor: 6, receiver: 7, to: [65, 20] },
      { kind: 'throwIn', actor: 6, receiver: 8, to: [80, 50] },
      { kind: 'pass', actor: 6, receiver: 9, to: [85, 30], outcome: 'offside', through: true },
    ]);
    const frames = [
      at(0, { 9: [80, 30] }),
      at(1, { 10: [65, 40] }),
      at(2, { 7: [65, 20] }),
      at(3, { 8: [80, 50] }),
      at(4, { 9: [72, 30] }),
    ];
    const events = list.map((b, k) =>
      event(k * T, 'kick', { beat: k, other: b.receiver, at: [60, 34] }),
    );
    const m = get(fakePlayback({ frames, events, beats: list }), 'offside.consistency');
    expect(m).toMatchObject({ value: 2, pass: false });
    expect(m.detail).toBe('kicks=5 onsideCalls=1 missedCalls=1');
  });

  it('shape.swarm ignores set pieces and the boxes', () => {
    const around = (c: Vec): Record<number, Vec> =>
      Object.fromEntries(
        A_OUTFIELD.slice(0, 7).map((i, k) => [i, [c[0] + k - 3, c[1] + 2] as Vec]),
      );
    const open: Vec = [30, 60];
    const box: Vec = [10, 34];
    const frames = [
      frameOf(0, { ball: open, players: around(open) }),
      frameOf(T, { ball: open, players: around(open), phase: 'setPiece' }),
      frameOf(2 * T, { ball: box, players: around(box) }),
      frameOf(3 * T, { ball: open }),
      frameOf(4 * T, { ball: open, players: around(open), live: false }),
    ];
    const m = get(fakePlayback({ frames }), 'shape.swarm');
    expect(m).toMatchObject({ value: 0.5, pass: false, detail: 'n=1/2' });
  });

  it('shape.spacing and shape.teamLength', () => {
    const spread = (lo: number, hi: number, extra: FrameOverrides['players'] = {}) => ({
      ...Object.fromEntries(
        H_OUTFIELD.map((i, k) => [i, [lo + ((hi - lo) * k) / 9, 4 + 6 * k] as Vec]),
      ),
      ...extra,
    });
    const crowd = { 2: [21, 4.5] as Vec };
    const frames = [
      frameOf(0, { players: spread(20, 50) }),
      frameOf(T, { players: spread(20, 50, crowd) }),
      frameOf(2 * T, { players: spread(20, 80, crowd), phase: 'setPiece' }),
      frameOf(3 * T, { players: spread(20, 30) }),
      frameOf(4 * T, { players: spread(20, 30) }),
    ];
    const pb = fakePlayback({ frames });
    expect(get(pb, 'shape.spacing')).toMatchObject({ value: 0.25, pass: false, detail: 'n=1/4' });
    expect(get(pb, 'shape.teamLength.H')).toMatchObject({ value: 30, pass: true });
    const short = fakePlayback({ frames: [frames[3], frames[4], frames[0]] });
    expect(get(short, 'shape.teamLength.H')).toMatchObject({ value: 10, pass: false });
  });

  it('role metrics compare the inverted full-back with the other full-back and read the gap to the line', () => {
    const defence = { ...lineAt(A_OUTFIELD, 70), 11: [100, 34] as Vec };
    const homeDeep = { ...lineAt(H_OUTFIELD, 40), 0: [5, 34] as Vec };
    const frames = [
      frameOf(0, { players: { 1: [40, 30], 4: [40, 60], 5: [45, 34] } }),
      frameOf(T, { phase: 'finalThird', players: { 1: [80, 5], 4: [80, 60], 5: [70, 34] } }),
      frameOf(2 * T, {
        phase: 'progression',
        players: { ...defence, 1: [50, 28], 4: [50, 62], 5: [55, 34], 9: [62, 34] },
      }),
      frameOf(3 * T, { team: 1, phase: 'finalThird', players: { ...homeDeep, 20: [42, 34] } }),
      frameOf(4 * T, { team: 1, phase: 'buildUp', players: { 1: [40, 2], 4: [40, 34] } }),
    ];
    const pb = fakePlayback({ frames });
    expect(get(pb, 'role.invertedFullBack.inside')).toMatchObject({ value: 22, pass: true });
    expect(get(pb, 'role.invertedFullBack.pivot')).toMatchObject({ value: 5, pass: true });
    expect(get(pb, 'role.falseNine.drop')).toMatchObject({ value: 8, pass: true });
    expect(get(pb, 'role.poacher.shoulder')).toMatchObject({ value: 2, pass: true });

    const plain: Fixture = {
      ...FIXTURE,
      players: FIXTURE.players.map((p) => (p.role === 'poacher' ? { ...p, role: 'targetMan' } : p)),
    };
    const ids = computeMetrics({ ...pb, fixture: plain }).map((m) => m.id);
    expect(ids).not.toContain('role.poacher.shoulder');
    expect(ids).toContain('role.falseNine.drop');
  });

  it('script.backPassReason counts only unreasoned passes', () => {
    const list = beats(FIXTURE, [
      { kind: 'carry', actor: 6, to: [85, 30] },
      { kind: 'pass', actor: 6, receiver: 7, to: [70, 30] },
      { kind: 'carry', actor: 7, to: [86, 40] },
      { kind: 'pass', actor: 7, receiver: 6, to: [72, 40], reason: 'reset' },
      { kind: 'carry', actor: 6, to: [90, 40] },
      { kind: 'pass', actor: 6, receiver: 8, to: [85, 40] },
      { kind: 'carry', actor: 16, to: [19, 30], team: 1 },
      { kind: 'pass', actor: 16, receiver: 17, to: [33, 30], team: 1 },
      { kind: 'throwIn', actor: 17, receiver: 16, to: [5, 30], team: 1 },
      { kind: 'throwIn', actor: 16, receiver: 17, to: [20, 30], team: 1 },
    ]);
    const m = get(fakePlayback({ frames: [frameOf(0)], beats: list }), 'script.backPassReason');
    expect(m).toMatchObject({ value: 2, pass: false, detail: 'backward=3' });
  });

  it('stage.pressVisible', () => {
    const list = beats(FIXTURE, [
      { kind: 'pass', actor: 6, receiver: 7, to: [40, 30], reason: 'pressed' },
      { kind: 'pass', actor: 7, receiver: 8, to: [40, 40], reason: 'pressed' },
      { kind: 'pass', actor: 8, receiver: 6, to: [40, 20] },
      { kind: 'pass', actor: 6, receiver: 7, to: [30, 30], reason: 'pressed' },
    ]);
    const frames = [
      frameOf(0, { players: { 6: [30, 30], 15: [32, 31] } }),
      frameOf(T, { players: { 7: [40, 30] } }),
      frameOf(2 * T, { players: { 8: [40, 40], 15: [41, 40] } }),
      frameOf(3 * T, { players: { 6: [20, 30], 11: [21, 30] } }),
    ];
    const events = list.map((b, k) =>
      event(k * T, 'kick', { beat: k, actor: b.actor, other: b.receiver }),
    );
    const m = get(fakePlayback({ frames, events, beats: list }), 'stage.pressVisible');
    expect(m).toMatchObject({ value: 0.333, pass: false, detail: 'n=1/3' });
  });

  it('an empty denominator passes with value 1', () => {
    const pb = fakePlayback({ frames: [frameOf(0), frameOf(T)] });
    for (const id of [
      'ball.ownerDistance',
      'events.reception',
      'events.contest',
      'stage.pressVisible',
    ]) {
      expect(get(pb, id)).toMatchObject({ value: 1, pass: true });
    }
    expect(get(pb, 'events.recastRate')).toMatchObject({ value: 0, pass: true });
    expect(get(pb, 'score.consistent')).toMatchObject({ value: 0, pass: true });
    const dead = fakePlayback({ frames: [frameOf(0, { live: false })] });
    expect(get(dead, 'shape.swarm')).toMatchObject({ value: 1, pass: true });
  });
});

/** One open-play pass (beat 0, every frame's default) and a kick-off (beat 1), for `beatOf`. */
const OPEN_BEATS = beats(FIXTURE, [
  { kind: 'pass', actor: 6, receiver: 7, to: [60, 34] },
  { kind: 'kickOff', actor: 9, receiver: 6, to: [50, 34] },
]);
/** Every outfield player at least 7 m from any other: home along y = 20, away along y = 48. */
const GRID: Readonly<Record<number, Vec>> = {
  ...Object.fromEntries(H_OUTFIELD.map((i, k) => [i, [20 + 7 * k, 20] as Vec])),
  ...Object.fromEntries(A_OUTFIELD.map((i, k) => [i, [20 + 7 * k, 48] as Vec])),
};

/**
 * Frames 0..`last`, ten a second, from `base`: player `i` of `vx` moves along x at `vx[i](f)` m/s
 * into frame `f`; `extra(f)` adds frame overrides, its players placed last.
 */
function framesOf(
  last: number,
  vx: Readonly<Record<number, (f: number) => number>> = {},
  extra: (f: number) => FrameOverrides = () => ({}),
  base: Readonly<Record<number, Vec>> = GRID,
): Frame[] {
  const at: Record<number, Vec> = { ...base };
  const frames: Frame[] = [];
  for (let f = 0; f <= last; f++) {
    if (f > 0) {
      for (const [i, v] of Object.entries(vx)) {
        const [x, y] = at[Number(i)];
        at[Number(i)] = [x + v(f) * T, y];
      }
    }
    const o = extra(f);
    frames.push(frameOf(f * T, { ...o, players: { ...at, ...o.players } }));
  }
  return frames;
}

const open = (frames: Frame[]): Playback => fakePlayback({ frames, beats: OPEN_BEATS });
/** `players` while `on`, else nobody. */
const when = (on: boolean, players: Record<number, Vec>): Record<number, Vec> =>
  on ? players : {};
const every = (indexes: readonly number[], v: (f: number) => number) =>
  Object.fromEntries(indexes.map((i) => [i, v]));
/** Entry `j` of row `r` of a Sylvester Hadamard matrix: rows 1-31 of 32 are orthogonal with mean 0. */
const hadamard = (r: number, j: number): number => {
  let bits = r & j;
  let sign = 1;
  while (bits) {
    sign = -sign;
    bits &= bits - 1;
  }
  return sign;
};
/** A settled turnover at frame 10 (team 1 from it) and a counter at frame 30 (team 0 again). */
const TURNOVERS = (f: number): FrameOverrides =>
  f < 10 ? {} : f < 30 ? { team: 1 } : { team: 0, phase: 'counter' };

describe('naturalness metrics', () => {
  it('events.shortKick counts only ordinary passes kicked with the receiver inside the distance', () => {
    const list = beats(FIXTURE, [
      { kind: 'pass', actor: 6, receiver: 7, to: [44, 30] },
      { kind: 'pass', actor: 7, receiver: 8, to: [50, 30] },
      { kind: 'throwIn', actor: 8, receiver: 6, to: [41, 40] },
      { kind: 'pass', actor: 6, receiver: 9, to: [45, 40] },
    ]);
    const frames = [
      frameOf(0, { players: { 6: [40, 30], 7: [44, 30] } }),
      frameOf(T, { players: { 7: [40, 30], 8: [50, 30] } }),
      frameOf(2 * T, { players: { 8: [40, 40], 6: [41, 40] } }),
      frameOf(3 * T, { players: { 6: [44, 40], 9: [45, 40] } }),
    ];
    const events = [
      event(0, 'kick', { beat: 0, actor: 6, other: 7 }),
      event(0, 'receive', { beat: 0, actor: 6, other: 7 }),
      event(T, 'kick', { beat: 1, actor: 7, other: 8 }),
      event(2 * T, 'kick', { beat: 2, actor: 8, other: 6 }),
      event(3 * T, 'kick', { beat: 3, actor: 6 }),
    ];
    const m = get(fakePlayback({ frames, events, beats: list }), 'events.shortKick');
    expect(m).toMatchObject({ value: 0.5, pass: false, detail: 'n=1/2' });
  });

  it('shape.huddle counts episodes longer than the allowance and leaves out restarts, set pieces and pairs inside one penalty area', () => {
    const frames = framesOf(59, {}, (f) => ({
      ...(f >= 35 && f <= 39 ? { phase: 'setPiece' as const } : {}),
      ...(f >= 45 && f <= 49 ? { beat: 1 } : {}),
      players: {
        ...when(f >= 1 && f <= 25, { 2: [33, 20] }),
        ...when(f >= 1 && f <= 10, { 5: [54, 20] }),
        ...when(f >= 30 && f <= 55, { 7: [68, 20] }),
        ...when(f >= 1 && f <= 30, { 13: [95, 34], 14: [96, 34] }),
      },
    }));
    const m = get(open(frames), 'shape.huddle');
    expect(m).toMatchObject({ pass: false, detail: 'n=1/5 minutes=0.082' });
    expect(m.value).toBeCloseTo(60 / 4.9, 2);
  });

  it('shape.huddleLongest names the pair and its start', () => {
    const frames = framesOf(59, {}, (f) => ({
      players: {
        ...when(f >= 5 && f <= 34, { 2: [33, 20] }),
        ...when(f >= 10, { 15: [47, 48] }),
      },
    }));
    const m = get(open(frames), 'shape.huddleLongest');
    expect(m).toMatchObject({ value: 5, pass: false, detail: 'pair=A2-A11 t=1' });
  });

  it('motion.restarts counts a start only after a rest', () => {
    // Moving from the start, resting, starting, between the speeds, resting, too slow, starting.
    const speeds = [0, 2, 2, 2, 0, 0, 2, 2, 0.7, 0.7, 0.2, 0.8, 0.8, 1.5, 1.5];
    const m = get(open(framesOf(14, { 4: (f) => speeds[f] })), 'motion.restarts');
    expect(m).toMatchObject({ pass: false, detail: 'starts=2' });
    expect(m.value).toBeCloseTo(2 / ((20 * 1.4) / 60), 3);
  });

  it('motion.startSync reads how many starts share a window', () => {
    const startAt = (s: number) => (f: number) => (f >= s ? 2 : 0);
    const vx = {
      ...every([1, 2, 3, 4], startAt(5)),
      ...every([5, 6, 7, 8], startAt(7)),
      ...every([12, 13], startAt(15)),
    };
    const pb = open(framesOf(20, vx));
    expect(get(pb, 'motion.startSync')).toMatchObject({
      value: 0.8,
      pass: false,
      detail: 'n=8/10',
    });
    expect(get(pb, 'motion.restarts').detail).toBe('starts=10');
  });

  it('motion.speedSync is 1 for players moving in step and near 0 for unrelated ones', () => {
    const outfield = [...H_OUTFIELD, ...A_OUTFIELD];
    const inStep = open(
      framesOf(
        32,
        every(outfield, (f) => 2 + hadamard(1, f - 1)),
      ),
    );
    expect(get(inStep, 'motion.speedSync')).toMatchObject({
      value: 1,
      pass: false,
      detail: 'bands=0/0.5/0.5/0/0',
    });
    const vx = Object.fromEntries(
      outfield.map((i, k) => [i, (f: number) => 2 + hadamard(k + 1, f - 1)]),
    );
    const unrelated = get(open(framesOf(32, vx)), 'motion.speedSync');
    expect(unrelated.pass).toBe(true);
    expect(Math.abs(unrelated.value)).toBeLessThan(0.01);
  });

  it('turn.reverse counts movers who turn within the time after a settled turnover and ignores counters', () => {
    const vx = {
      2: (f: number) => (f < 12 ? 2 : -2),
      3: (f: number) => (f < 32 ? 2 : -2),
      4: (f: number) => (f < 25 ? 2 : -2),
      5: (f: number) => (f < 12 ? 0.5 : -2),
      6: (f: number) => (f < 12 ? 2 : -0.5),
      13: (f: number) => (f < 15 ? -2 : 2),
    };
    const m = get(open(framesOf(45, vx, TURNOVERS)), 'turn.reverse');
    expect(m).toMatchObject({ value: 0.4, pass: false, detail: 'n=2/5 turnovers=1' });
  });

  it('turn.run and turn.counterRun read the running share at the set time', () => {
    const vx = {
      ...every(H_OUTFIELD, (f) => (f === 25 || f === 45 ? 5 : 0)),
      ...every([12, 13], (f) => (f === 45 ? 5 : 0)),
      ...every([14, 15, 16, 17, 18, 19, 20, 21], (f) => (f === 24 ? 5 : 0)),
    };
    const pb = open(framesOf(45, vx, TURNOVERS));
    expect(get(pb, 'turn.run')).toMatchObject({ value: 0.5, pass: false, detail: 'turnovers=1' });
    expect(get(pb, 'turn.counterRun')).toMatchObject({
      value: 0.6,
      pass: true,
      detail: 'turnovers=1',
    });
  });

  it('mark.near reads attackers in the last part of the pitch with a defender close', () => {
    const attack: Record<number, Vec> = { 7: [75, 20], 8: [66, 60], 9: [80, 30], 10: [70, 46] };
    const marking: Record<number, Vec> = { 14: [71, 46], 15: [67, 60] };
    const frames = framesOf(
      10,
      {},
      (f) => ({
        owner: 7,
        ...(f === 10 ? { phase: 'setPiece' as const } : {}),
        players: {
          ...attack,
          13: [82, 30] as Vec,
          ...when(f === 7 || f === 10, marking),
        },
      }),
      lineAt(A_OUTFIELD, 30),
    );
    const m = get(open(frames), 'mark.near');
    expect(m).toMatchObject({ value: 0.333, pass: false, detail: 'n=1/3' });
  });

  it('the new metrics pass on an empty playback', () => {
    const pb = fakePlayback({ frames: [frameOf(0), frameOf(T)] });
    const values: Record<string, number> = {
      'events.shortKick': 0,
      'shape.huddle': 0,
      'shape.huddleLongest': 0,
      'motion.restarts': 0,
      'motion.startSync': 0,
      'motion.speedSync': 0,
      'turn.reverse': 0,
      'turn.run': 0,
      'turn.counterRun': 1,
      'mark.near': 1,
    };
    for (const [id, value] of Object.entries(values)) {
      expect(get(pb, id)).toMatchObject({ value, pass: true });
    }
    expect(get(pb, 'turn.counterRun').detail).toBe('turnovers=0 empty');
  });
});
