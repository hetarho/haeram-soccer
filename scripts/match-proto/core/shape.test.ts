import { describe, expect, it } from 'vitest';
import { PROTO_CONFIG } from './config.ts';
import { HALFWAY, PITCH, inPitch, ownGoal, toAttack } from './pitch.ts';
import { lineFor, nominalLineX, nominalSpot, offsideLineX, type ShapeContext } from './shape.ts';
import { demoFixture } from './squads.ts';
import type { Phase, TeamId, Vec } from './types.ts';
import { closestOnSegment, dist } from './vec.ts';

const fixture = demoFixture();
const SHAPE = PROTO_CONFIG.shape;
const AXIS = PITCH.width / 2;
const EPS = 1e-9;
const OUTFIELD = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const BACK_FOUR = [1, 2, 3, 4];
const PHASES: readonly Phase[] = ['buildUp', 'progression', 'finalThird', 'counter', 'setPiece'];

const other = (team: TeamId): TeamId => (team === 0 ? 1 : 0);
const indexOf = (team: TeamId, slot: number): number => team * 11 + slot;
const ctxOf = (
  ball: Vec,
  team: TeamId,
  phase: Phase,
  positions?: readonly Vec[],
): ShapeContext => ({ fixture, ball, team, phase, ...(positions ? { positions } : {}) });
/** The spot of `team`'s player in `slot`, in that team's attack frame. */
const spot = (ctx: ShapeContext, team: TeamId, slot: number): Vec =>
  toAttack(team, nominalSpot(ctx, indexOf(team, slot)));
/** A world ball as team 1 sees the same situation. */
const mirror = (ball: Vec): Vec => toAttack(1, ball);
const roleOf = (team: TeamId, slot: number) => fixture.players[indexOf(team, slot)].role;
const ys = (ctx: ShapeContext, team: TeamId): number[] =>
  OUTFIELD.map((slot) => nominalSpot(ctx, indexOf(team, slot))[1]);
const spread = (values: readonly number[]): number => Math.max(...values) - Math.min(...values);
const mean = (values: readonly number[]): number =>
  values.reduce((sum, v) => sum + v, 0) / values.length;
/** One team's 11 by slot at world x values for the keeper, the back four and the rest. */
const lineUp = (keeper: number, back: number, rest: number): Vec[] =>
  Array.from({ length: 11 }, (_, slot): Vec => [
    slot === 0 ? keeper : slot <= 4 ? back : rest,
    6 + slot * 5,
  ]);
const near = (actual: Vec, expected: Vec) => {
  expect(Math.abs(actual[0] - expected[0])).toBeLessThanOrEqual(0.1);
  expect(Math.abs(actual[1] - expected[1])).toBeLessThanOrEqual(0.1);
};

describe('match-proto shape', () => {
  it('inverted full-back steps inside in build-up', () => {
    expect(roleOf(0, 1)).toBe('invertedFullBack');
    const ctx = ctxOf([20, 34], 0, 'buildUp');
    const fullBack = spot(ctx, 0, 1);
    const midfielder = spot(ctx, 0, 5);
    const otherFullBack = spot(ctx, 0, 4);
    expect(Math.abs(fullBack[1] - AXIS)).toBeLessThanOrEqual(12);
    expect(Math.abs(fullBack[0] - midfielder[0])).toBeLessThanOrEqual(3);
    expect(Math.abs(otherFullBack[1] - AXIS) - Math.abs(fullBack[1] - AXIS)).toBeGreaterThanOrEqual(
      8,
    );
  });

  it('inverted full-back defends as a full-back', () => {
    const ctx = ctxOf([60, 34], 1, 'progression');
    const xs = BACK_FOUR.map((slot) => spot(ctx, 0, slot)[0]);
    for (const x of xs) expect(x).toBeCloseTo(xs[0], 9);
    expect(Math.abs(spot(ctx, 0, 1)[1] - AXIS)).toBeGreaterThanOrEqual(12);
  });

  it('false nine drops off the line, the poacher stays on its shoulder', () => {
    expect(roleOf(0, 9)).toBe('falseNine');
    expect(roleOf(1, 9)).toBe('poacher');
    const home = ctxOf([52, 34], 0, 'progression');
    expect(nominalLineX(home, 0) - spot(home, 0, 9)[0]).toBeGreaterThanOrEqual(5);
    const away = ctxOf([53, 34], 1, 'progression');
    expect(nominalLineX(away, 1) - spot(away, 1, 9)[0]).toBeCloseTo(SHAPE.shoulderGap, 9);
  });

  it('nobody in possession stands beyond the line', () => {
    const balls: readonly Vec[] = [
      [20, 34],
      [52, 20],
      [85, 50],
    ];
    for (const ball of balls)
      for (const phase of ['buildUp', 'progression', 'finalThird'] as const)
        for (const team of [0, 1] as const) {
          const ctx = ctxOf(team === 0 ? ball : mirror(ball), team, phase);
          const limit = lineFor(ctx, team) - SHAPE.onsideGap;
          for (const slot of OUTFIELD)
            expect(spot(ctx, team, slot)[0]).toBeLessThanOrEqual(limit + EPS);
        }
  });

  it('out of possession the block is narrower and follows the ball', () => {
    const balls: readonly [Vec, Phase][] = [
      [[20, 34], 'buildUp'],
      [[52.5, 34], 'progression'],
      [[85, 34], 'finalThird'],
    ];
    for (const team of [0, 1] as const)
      for (const [ball, phase] of balls) {
        const inPossession = spread(ys(ctxOf(ball, team, phase), team));
        const outOfPossession = spread(ys(ctxOf(ball, other(team), phase), team));
        expect(outOfPossession).toBeLessThan(inPossession);
      }
    for (const defending of [0, 1] as const) {
      const at = (y: number) =>
        mean(ys(ctxOf([52.5, y], other(defending), 'progression'), defending));
      expect(at(60) - at(8)).toBeGreaterThanOrEqual(10);
    }
  });

  it('the defending line drops with the ball', () => {
    for (const defending of [0, 1] as const)
      for (const slot of BACK_FOUR) {
        const xs = [10, 30, 52.5, 90].map((x) => {
          const ball = toAttack(defending, [x, 34]);
          return spot(ctxOf(ball, other(defending), 'progression'), defending, slot)[0];
        });
        for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1]);
      }
  });

  it('keepers', () => {
    expect(roleOf(0, 0)).toBe('sweeperKeeper');
    expect(roleOf(1, 0)).toBe('keeper');
    const balls: readonly Vec[] = [
      [20, 50],
      [60, 10],
      [8, 30],
      [95, 34],
    ];
    for (const ball of balls)
      for (const keeper of [0, 1] as const) {
        const at = nominalSpot(ctxOf(ball, other(keeper), 'progression'), indexOf(keeper, 0));
        const { point } = closestOnSegment(ownGoal(keeper), ball, at);
        expect(dist(point, at)).toBeLessThanOrEqual(EPS);
        expect(dist(at, ownGoal(keeper))).toBeGreaterThan(0);
      }
    for (const ball of [
      [20, 34],
      [52, 20],
      [85, 50],
    ] as const) {
      const sweeper = spot(ctxOf(ball, 0, 'buildUp'), 0, 0);
      const keeper = spot(ctxOf(mirror(ball), 1, 'buildUp'), 1, 0);
      expect(sweeper[0]).toBeGreaterThan(keeper[0]);
    }
  });

  it('offsideLineX takes the second-last defender and never drops below halfway', () => {
    const home = lineUp(30, 30, 30);
    expect(offsideLineX(fixture, [...home, ...lineUp(100, 80, 60)], 0)).toBe(80);
    expect(offsideLineX(fixture, [...home, ...lineUp(50, 40, 40)], 0)).toBe(HALFWAY);
    // The keeper counts: out of his goal, two defenders behind him decide the line.
    const away = lineUp(70, 60, 60);
    away[1] = [90, 10];
    away[2] = [85, 20];
    expect(offsideLineX(fixture, [...home, ...away], 0)).toBe(85);
    // Team 1 attacks toward x = 0: home's line read in team 1's attack frame.
    const homeDeep = lineUp(2, 30, 40);
    homeDeep[3] = [20, 30];
    expect(offsideLineX(fixture, [...homeDeep, ...lineUp(90, 70, 60)], 1)).toBe(85);
  });

  it('actual positions move the line', () => {
    // A high away line: nominally it would stand far deeper for this ball.
    const ball: Vec = [85, 50];
    const positions = [...lineUp(10, 40, 60), ...lineUp(90, 62, 50)];
    const ctx = ctxOf(ball, 0, 'finalThird', positions);
    const line = lineFor(ctx, 0);
    expect(line).toBe(offsideLineX(fixture, positions, 0));
    expect(line).toBeLessThan(nominalLineX(ctx, 0));
    const xs = OUTFIELD.map((slot) => spot(ctx, 0, slot)[0]);
    for (const x of xs) expect(x).toBeLessThanOrEqual(line - SHAPE.onsideGap + EPS);
    expect(Math.max(...xs)).toBeCloseTo(line - SHAPE.onsideGap, 9);
    // The poacher takes the shoulder of the actual line.
    const awayCtx = ctxOf(mirror(ball), 1, 'progression', positions);
    expect(lineFor(awayCtx, 1)).toBe(offsideLineX(fixture, positions, 1));
    expect(lineFor(awayCtx, 1) - spot(awayCtx, 1, 9)[0]).toBeCloseTo(SHAPE.shoulderGap, 9);
  });

  it('spots stay inside the margin and the function is pure', () => {
    const balls: readonly Vec[] = [
      [0, 0],
      [105, 68],
      [0, 34],
      [105, 34],
      [1, 67],
      [104, 1],
      [52.5, 34],
      [30, 60],
      [88, 12],
    ];
    for (const ball of balls)
      for (const phase of PHASES)
        for (const team of [0, 1] as const) {
          const ctx = ctxOf(ball, team, phase);
          for (const player of fixture.players) {
            const at = nominalSpot(ctx, player.index);
            const margin = player.slot === 0 ? 0 : PROTO_CONFIG.margin;
            expect(inPitch(at, margin - EPS)).toBe(true);
          }
        }
    const positions = [...lineUp(10, 40, 60), ...lineUp(90, 62, 50)];
    const before = structuredClone(positions);
    const ctx = ctxOf([70, 20], 0, 'finalThird', positions);
    const first = fixture.players.map((p) => nominalSpot(ctx, p.index));
    const second = fixture.players.map((p) => nominalSpot(ctx, p.index));
    expect(second).toEqual(first);
    expect(positions).toEqual(before);
  });

  it('matches the reference values', () => {
    const buildUp = ctxOf([20, 34], 0, 'buildUp');
    near(spot(buildUp, 0, 1), [32.4, 25.0]);
    near(spot(buildUp, 0, 5), [32.4, 34.0]);
    near(spot(buildUp, 0, 9), [46.3, 34.0]);
    near(spot(buildUp, 0, 0), [12.4, 34.0]);
    const finalThird = ctxOf([85, 50], 0, 'finalThird');
    near(spot(finalThird, 0, 2), [56.2, 27.4]);
    near(spot(finalThird, 0, 4), [85.9, 66.4]);
    near(spot(finalThird, 0, 1), [67.3, 28.4]);
    for (const slot of BACK_FOUR) expect(spot(finalThird, 1, slot)[0]).toBeCloseTo(11.0, 1);
    for (const slot of [5, 6, 7, 8]) expect(spot(finalThird, 1, slot)[0]).toBeCloseTo(23.5, 1);
  });
});
