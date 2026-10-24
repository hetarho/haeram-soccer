import { describe, expect, it } from 'vitest';
import { MATCH_MODEL_REVISION } from '../../../contracts/src/match-model';
import { ATTRIBUTES } from '../../../contracts/src/player';
import { DISABLED_RELEASE } from '../../../../tests/fixtures/worlds';
import { GRID_BALL_CONFIG } from './movement';
import { LANE_CONFIG, reachOnPath } from './lanes';
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
