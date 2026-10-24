import { describe, expect, it } from 'vitest';
import { MATCH_MODEL_REVISION } from '../../../contracts/src/match-model';
import { ATTRIBUTES } from '../../../contracts/src/player';
import { DISABLED_RELEASE } from '../../../../tests/fixtures/worlds';
import { GRID_BALL_CONFIG } from './movement';
import {
  coverShadow,
  dangerousOption,
  LANE_CONFIG,
  pathReached,
  reachOnPath,
  SHADOW_CONFIG,
  threatGain,
} from './lanes';
import type { Point } from './pitch';
import { gridKit } from './testkit';

/**
 * A candidate state with everyone standing parked far away and side 1's `idx` standing at `at`;
 * side 0 plays the ball, so only side 1 can reach it.
 */
function scene(at: Point, positioning = 60) {
  const s = gridKit(['balanced', 'balanced'], undefined, DISABLED_RELEASE).state;
  s.setup = { ...s.setup, model: MATCH_MODEL_REVISION };
  for (const side of s.players)
    for (const gp of side) {
      gp.pos = [gp.side === 0 ? 3 : 102, gp.side === 0 ? 2 : 66];
      gp.vel = undefined;
    }
  s.setup.shift = [0, 0];
  s.elapsed = 0;
  const gp = s.players[1][3]!;
  gp.pos = [...at];
  gp.base[ATTRIBUTES.indexOf('positioning')] = positioning;
  return { s, gp };
}
const FROM: Point = [40, 34];
const TO: Point = [60, 34];

describe('who reaches a pass’s path (→MATCH-31, T441)', () => {
  it('an opponent 10 m off the line cannot reach a 20 m pass', () => {
    const { s } = scene([50, 44]);
    const lane = reachOnPath(s, 0, FROM, TO, 0);
    expect(lane.first).toBeUndefined();
    expect(lane.weight).toBe(0);
  });

  it('a defender standing in the lane reaches it at once', () => {
    const { s, gp } = scene([50, 34]);
    const { first, weight } = reachOnPath(s, 0, FROM, TO, 0);
    expect(first?.gp).toBe(gp);
    // The ball is within his reach before it gets to him; he meets it there, or a step earlier.
    const standing = 10 - LANE_CONFIG.reach;
    expect(first!.stretch).toBe(false);
    expect(first!.along).toBeLessThanOrEqual(standing);
    expect(first!.along).toBeGreaterThan(standing - 1);
    expect(first!.ball).toBeCloseTo(first!.along / GRID_BALL_CONFIG.pass, 9);
    // He needs no run: the ball's whole flight to his reach is time in hand, so he wins it
    // cleanly and weighs fully in the lane.
    expect(first!.spare).toBeGreaterThanOrEqual(standing / GRID_BALL_CONFIG.pass);
    expect(first!.spare).toBeGreaterThanOrEqual(LANE_CONFIG.sure);
    expect(weight).toBe(1);
    // Behind the passer, or once the ball is past, he reaches nothing.
    expect(reachOnPath(s, 0, [55, 34], [75, 34], 0).first).toBeUndefined();
  });

  it('a late read reaches the path later', () => {
    // 1.5 m off the line, standing, with a second's wind-up before the kick: the good reader sets
    // off at once (T324's read covers the wind-up), the poor one only just before the kick.
    const kickAt = 1;
    const early = reachOnPath(scene([50, 35.5], 99).s, 0, FROM, TO, kickAt).first;
    const late = reachOnPath(scene([50, 35.5], 1).s, 0, FROM, TO, kickAt).first;
    expect(early).toBeDefined();
    expect(late).toBeDefined();
    expect(late!.along).toBeGreaterThan(early!.along + 1);
    expect(late!.spare).toBeLessThan(early!.spare);
    // Read at the kick, the same man meets the ball as late as the poor reader does.
    const atKick = reachOnPath(scene([50, 35.5], 99).s, 0, FROM, TO, 0).first;
    expect(atKick!.along).toBeGreaterThan(early!.along + 1);
  });
});

describe('the carrier’s dangerous option (→MATCH-32, T442)', () => {
  it('the dangerous option is the unreached teammate with the highest threat gain', () => {
    // Side 0's carrier in midfield; side 1's man stands in the lane to the striker ahead of him.
    const { s, gp: blocker } = scene([70, 34]);
    const carrier = s.players[0][6]!;
    const [striker, inside, deep, back] = [9, 10, 8, 5].map((idx) => s.players[0][idx]!);
    carrier.pos = [60, 34];
    striker.pos = [80, 34]; // the next band, central: 20 m away
    inside.pos = [78, 20]; // the next band, in the left half-space: 22.8 m away
    deep.pos = [90, 34]; // in front of the box, but 30 m away
    back.pos = [50, 34]; // behind him
    const gain = (gp: typeof carrier) => threatGain(0, carrier.pos, gp.pos);
    expect(gain(deep)).toBeGreaterThan(gain(striker));
    expect(gain(striker)).toBeGreaterThan(gain(inside));
    expect(gain(inside)).toBeGreaterThan(0);
    expect(gain(back)).toBeLessThan(0);
    // The striker's path is reached, the deep man is not nearby: the man in the half-space it is.
    expect(reachOnPath(s, 0, carrier.pos, striker.pos, 0).first?.gp).toBe(blocker);
    expect(pathReached(s, 0, carrier.pos, striker.pos, 0)).toBe(true);
    expect(pathReached(s, 0, carrier.pos, inside.pos, 0)).toBe(false);
    expect(Math.hypot(deep.pos[0] - 60, deep.pos[1] - 34)).toBeGreaterThan(SHADOW_CONFIG.near);
    expect(dangerousOption(s, 0, carrier)).toBe(inside);
    // With the lane open again the striker gains the most.
    blocker.pos = [102, 66];
    expect(pathReached(s, 0, carrier.pos, striker.pos, 0)).toBe(false);
    expect(dangerousOption(s, 0, carrier)).toBe(striker);
    // No teammate nearby gains threat: none.
    for (const gp of [striker, inside]) gp.pos = [50, 30];
    expect(dangerousOption(s, 0, carrier)).toBeUndefined();
  });

  it('a cover shadow bends the target toward the line to the option, at most `curve` m', () => {
    const carrier: Point = [43, 34];
    const goalSide: Point = [41.8, 34];
    // An option straight goal-side leaves the target where it was.
    expect(coverShadow(goalSide, carrier, [30, 34])).toEqual([41.8, 34]);
    // A lateral option: the target turns onto the line to it, as far from the carrier.
    const bent = coverShadow(goalSide, carrier, [35, 26]);
    const u = [-8 / Math.hypot(8, 8), -8 / Math.hypot(8, 8)];
    expect(bent[0]).toBeCloseTo(43 + 1.2 * u[0]!, 9);
    expect(bent[1]).toBeCloseTo(34 + 1.2 * u[1]!, 9);
    // Square to the goal-side line, the turn is cut to `curve`.
    const square = coverShadow(goalSide, carrier, [43, 10]);
    expect(Math.hypot(square[0] - 41.8, square[1] - 34)).toBeCloseTo(SHADOW_CONFIG.curve, 9);
  });
});
