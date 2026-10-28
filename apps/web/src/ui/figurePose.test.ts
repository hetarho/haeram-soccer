import { describe, expect, it } from 'vitest';
import type { PlayerMotion } from '../../../../packages/contracts/src/types';
import type { FigureActionKind, FigureActionWindow } from './figureActions';
import {
  FIGURE_POSE_CONFIG,
  figureOffset,
  gaitDistances,
  poseAt,
  type FigureInput,
  type FigurePose,
} from './figurePose';
import type { PresentationSample } from './presentationClock';

const MOVING = { reducedMotion: false };
const STILL = { reducedMotion: true };

/** A player standing at the centre spot with the ball to his right on screen. */
const input = (overrides: Partial<FigureInput> = {}): FigureInput => ({
  id: 'h9',
  keeper: false,
  time: 100,
  position: [50, 50],
  speed: 0,
  velocity: [0, 0],
  velocityBefore: [0, 0],
  toBall: [40, 0],
  ballHeight: 0,
  carrier: false,
  distance: 0,
  ...overrides,
});

/** Running along the screen's x at `speed` m/s, 10 px a metre. */
const running = (speed: number, overrides: Partial<FigureInput> = {}) =>
  input({ speed, velocity: [speed * 10, 0], velocityBefore: [speed * 10, 0], ...overrides });

const window = (
  kind: FigureActionKind,
  contact: number,
  extra: Partial<FigureActionWindow> = {},
): FigureActionWindow => ({
  kind,
  player: 'h9',
  start: contact - 0.7,
  contact,
  end: contact + 1,
  toward: [80, 50],
  ...extra,
});

const limbs = (pose: FigurePose) => ({
  facing: pose.facing,
  twist: pose.twist,
  arms: pose.arms,
  legs: pose.legs,
  head: pose.head,
  jump: pose.jump,
  lying: pose.lying,
});

const near = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);

describe('figure poses (→MATCH-37)', () => {
  it('same input same pose', () => {
    const windows = Object.freeze([
      Object.freeze(window('kick', 100)),
      Object.freeze(window('tackle', 101.5, { start: 101, end: 102.5 })),
    ]);
    for (const figure of [
      input(),
      running(6, { distance: 37.3, carrier: true }),
      running(3, { time: 99.7, keeper: true, velocityBefore: [0, 30] }),
      running(7, { time: 101.6 }),
    ]) {
      Object.freeze(figure);
      for (const options of [MOVING, STILL]) {
        const pose = poseAt(figure, windows, options);
        expect(poseAt(figure, windows, options)).toEqual(pose);
        expect(poseAt({ ...figure }, [...windows], { ...options })).toEqual(pose);
      }
    }
  });

  it('faces velocity when moving and the ball when still', () => {
    // Running down the screen with the ball to his right, he faces his run.
    const moving = poseAt(running(6, { velocity: [0, 60], velocityBefore: [0, 60] }), [], MOVING);
    expect(moving.facing).toBeCloseTo(Math.PI / 2, 9);
    // His head leads him down the screen.
    const head = figureOffset(moving.facing, moving.head, 20);
    expect(head[1]).toBeGreaterThan(0);
    expect(Math.abs(head[0])).toBeLessThan(1e-9);
    // Standing or ambling, he turns to the ball.
    expect(poseAt(input({ toBall: [-30, 0] }), [], MOVING).facing).toBeCloseTo(Math.PI, 9);
    const slow = input({ speed: 0.3, velocity: [0, 3], velocityBefore: [0, 3], toBall: [0, -30] });
    expect(poseAt(slow, [], MOVING).facing).toBeCloseTo(-Math.PI / 2, 9);
    // Turning, the upper body leads and the hips follow his earlier run, never too far behind.
    const turning = poseAt(running(6, { velocity: [0, 60], velocityBefore: [60, 0] }), [], MOVING);
    expect(turning.facing).toBeCloseTo(Math.PI / 2, 9);
    expect(turning.twist).toBeCloseTo(-FIGURE_POSE_CONFIG.maxTwist, 9);
    const settled = poseAt(running(6, { velocity: [0, 60], velocityBefore: [0, 60] }), [], MOVING);
    expect(settled.twist).toBeCloseTo(0, 9);
    // At contact a kick faces its target on screen, through the caller's px per unit (the drawn
    // pitch is not square), else through metres.
    const kick = [window('kick', 100, { toward: [60, 60] })];
    for (const reducedMotion of [false, true]) {
      const aimed = poseAt(input({ time: 100 }), kick, { reducedMotion, unit: [10, 5] });
      expect(aimed.facing).toBeCloseTo(Math.atan2(50, 100), 9);
    }
    expect(poseAt(input({ time: 100 }), kick, MOVING).facing).toBeCloseTo(Math.atan2(6.8, 10.5), 9);
  });

  it('stride amplitude grows with speed', () => {
    const swing = (speed: number) => {
      let reach = 0;
      for (let d = 0; d < FIGURE_POSE_CONFIG.strideMetres; d += 0.05) {
        const { legs } = poseAt(running(speed, { distance: d }), [], MOVING);
        reach = Math.max(reach, Math.abs(legs[0].end[1] - legs[1].end[1]));
      }
      return reach;
    };
    const speeds = [0, 1, 3, 5, 8];
    const poses = speeds.map((speed) => poseAt(running(speed), [], MOVING));
    for (let i = 1; i < speeds.length; i++) {
      expect(poses[i]!.stride).toBeGreaterThan(poses[i - 1]!.stride);
      expect(poses[i]!.lean).toBeGreaterThan(poses[i - 1]!.lean);
      expect(swing(speeds[i]!)).toBeGreaterThan(swing(speeds[i - 1]!));
    }
    // Standing he holds a ready stance, feet level; the stride is full at top speed.
    expect(poses[0]!.stride).toBe(0);
    expect(poses[0]!.legs[0].end[1]).toBeCloseTo(poses[0]!.legs[1].end[1], 9);
    expect(poseAt(running(12), [], MOVING).stride).toBeCloseTo(FIGURE_POSE_CONFIG.stride, 9);
    // Arms swing opposite the legs: the leg ahead has its arm behind.
    for (let d = 0.1; d < FIGURE_POSE_CONFIG.strideMetres; d += 0.3) {
      const { arms, legs } = poseAt(running(6, { distance: d }), [], MOVING);
      const ahead = legs[0].end[1] - legs[1].end[1];
      if (Math.abs(ahead) > 1e-6)
        expect(Math.sign(arms[0].end[1] - arms[1].end[1])).toBe(-Math.sign(ahead));
    }
  });

  it('phase follows distance not time', () => {
    const at = (time: number, distance: number) =>
      poseAt(running(6, { time, distance }), [], MOVING);
    const ground = at(10, 12.4);
    // The same ground covered at another time, or a cycle later, is the same step.
    expect(at(500, 12.4)).toEqual(ground);
    const cycle = at(10, 12.4 + FIGURE_POSE_CONFIG.strideMetres);
    expect(cycle.phase).toBeCloseTo(ground.phase, 9);
    expect(cycle.legs[0].end[1]).toBeCloseTo(ground.legs[0].end[1], 9);
    // Half a cycle on, the feet have swapped.
    const half = at(10, 12.4 + FIGURE_POSE_CONFIG.strideMetres / 2);
    expect(half.legs[0].end[1]).toBeCloseTo(ground.legs[1].end[1], 9);
    expect(half.legs[1].end[1]).toBeCloseTo(ground.legs[0].end[1], 9);
    // A speed change moves the stride, never the phase.
    expect(poseAt(running(2, { time: 10, distance: 12.4 }), [], MOVING).phase).toBe(ground.phase);
    // Each player keeps his own phase.
    expect(poseAt(running(6, { id: 'a4', time: 10, distance: 12.4 }), [], MOVING).phase).not.toBe(
      ground.phase,
    );
  });

  it('reduced motion holds still stance and key pose', () => {
    // Running, he keeps his facing but holds the still stance.
    const sprint = running(8, { velocity: [0, 80], velocityBefore: [0, 80], distance: 3.3 });
    const held = poseAt(sprint, [], STILL);
    expect(held.facing).toBeCloseTo(poseAt(sprint, [], MOVING).facing, 9);
    expect(held.stride).toBe(0);
    expect(held.lean).toBe(0);
    const standing = poseAt(input({ toBall: [0, 40] }), [], STILL);
    expect(held.legs).toEqual(standing.legs);
    expect(held.arms).toEqual(standing.arms);
    // Each action is one key pose over its whole window, never its stride.
    for (const kind of ['kick', 'shot', 'tackle', 'slide', 'header', 'dive'] as const) {
      const windows = [window(kind, 100, { dive: 1 })];
      const key = limbs(poseAt(running(6, { time: 99.35 }), windows, STILL));
      for (const time of [99.6, 99.95, 100.4, 100.95])
        expect(limbs(poseAt(running(6, { time, distance: time }), windows, STILL))).toEqual(key);
      expect(key).not.toEqual(limbs(poseAt(running(6, { time: 102 }), windows, STILL)));
    }
    // The ball leaves the kicker's socket at once at contact.
    const kick = [window('kick', 100)];
    expect(poseAt(running(3, { time: 99.8, carrier: true }), kick, STILL).ball?.hold).toBe(1);
    expect(poseAt(running(3, { time: 100.05 }), kick, STILL).ball).toBeUndefined();
  });

  it('throw-in holds the ball above the head', () => {
    const throwIn = [window('throwIn', 100, { start: 98.8, end: 100.6 })];
    for (const options of [MOVING, STILL])
      for (const time of [99.1, 99.5, 99.9]) {
        const pose = poseAt(input({ time }), throwIn, options);
        expect(pose.action).toBe('throwIn');
        expect(pose.overhead).toBe(true);
        expect(pose.ball?.hold).toBe(1);
        expect(pose.ball!.height).toBe(FIGURE_POSE_CONFIG.ball.overhead);
        // Both hands on the ball, over the head.
        for (const arm of pose.arms) expect(near(arm.end, pose.ball!.at)).toBeLessThan(0.3);
        expect(near(pose.ball!.at, pose.head)).toBeLessThan(0.3);
      }
    // Once thrown, the ball is its track's again.
    expect(poseAt(input({ time: 100.3 }), throwIn, MOVING).ball).toBeUndefined();
  });

  it('carrier socket stays within stride', () => {
    const C = FIGURE_POSE_CONFIG;
    const reach = C.stance.foot[1] + C.stride * (1 + C.ball.nudge) + C.ball.gap;
    for (const speed of [0, 1.5, 4, 6, 8])
      for (let distance = 0; distance < 6; distance += 0.35) {
        const pose = poseAt(running(speed, { carrier: true, distance }), [], MOVING);
        const lead = Math.max(pose.legs[0].end[1], pose.legs[1].end[1]);
        expect(pose.ball).toBeDefined();
        expect(pose.ball!.hold).toBe(1);
        expect(pose.ball!.height).toBe(0);
        // Ahead of his feet, never beyond his stride.
        expect(pose.ball!.at[1]).toBeGreaterThan(lead);
        expect(pose.ball!.at[1] - lead).toBeLessThanOrEqual(
          C.ball.gap + C.stride * (1 + C.ball.nudge),
        );
        expect(Math.hypot(...pose.ball!.at)).toBeLessThanOrEqual(reach + 0.1);
      }
    // Nobody else carries it.
    expect(poseAt(running(6), [], MOVING).ball).toBeUndefined();
  });

  it('a keeper catches at the chest', () => {
    const save = [window('catch', 100, { start: 99.55, end: 101.2 })];
    const keeper = (time: number) => input({ keeper: true, time, toBall: [-40, 0] });
    // The ball reaches his hands at the contact and stays at his chest.
    expect(poseAt(keeper(99.6), save, MOVING).ball).toBeUndefined();
    for (const time of [100, 100.5, 100.9]) {
      const pose = poseAt(keeper(time), save, MOVING);
      expect(pose.ball).toMatchObject({ hold: 1, height: FIGURE_POSE_CONFIG.ball.chest });
      for (const arm of pose.arms) expect(near(arm.end, pose.ball!.at)).toBeLessThan(0.3);
    }
  });
});

describe('gait distances', () => {
  const sample = (time: number, home: [string, number, number][]): PresentationSample => ({
    frame: 0,
    ball: [50, 50],
    players: [
      home.map(([id, x, y]): PlayerMotion => ({
        id,
        position: [x, y],
        velocity: [0, 0],
        state: 'run',
        intent: [x, y],
      })),
      [],
    ],
    within: time / 60,
    time,
  });

  it('adds the metres drawn between samples, NaN where a player is absent', () => {
    const distances = gaitDistances([
      sample(0, [['h9', 50, 50]]),
      sample(2, [
        ['h9', 60, 50],
        ['h12', 0, 0],
      ]),
      sample(4, [['h12', 0, 10]]),
      sample(6, [
        ['h9', 60, 60],
        ['h12', 0, 10],
      ]),
    ]);
    const metres = (id: string) => [...distances.get(id)!].map((m) => Number(m.toFixed(9)));
    // 10 units along x are 10.5 m; along y 6.8 m. Absent, he neither moves nor loses ground.
    expect(metres('h9')).toEqual([0, 10.5, NaN, 10.5]);
    expect(metres('h12')).toEqual([NaN, 0, 6.8, 6.8]);
  });
});
