import { describe, expect, it } from 'vitest';
import { MATCH_MODEL_REVISION } from '../../../contracts/src/match-model';
import { DISABLED_RELEASE } from '../../../../tests/fixtures/worlds';
import { BOX_CONFIG, boxScene, boxSide, boxZones } from './box';
import { setIntention } from './intentions';
import { BAND_EDGES, LANE_EDGES, toEngine, type Point } from './pitch';
import { createState, type GridState } from './state';
import { gridKit } from './testkit';

// Side 0 plays possession (4-3-3), side 1 balanced (3-5-2), both parked at their own ends.
const kit = gridKit(['possession', 'balanced'], 'box-lab', DISABLED_RELEASE);

/** A candidate state with `side`'s right winger on the ball at `at` (`side`'s attack frame). */
function lab(at: Point, side: 0 | 1 = 0, model = true): GridState {
  const s = createState(model ? { ...kit.setup, model: MATCH_MODEL_REVISION } : kit.setup);
  for (const sd of [0, 1] as const)
    s.players[sd].forEach((gp, i) => (gp.pos = toEngine(sd, [8, 2 + 6 * i])));
  const p = toEngine(side, at);
  s.possession = side;
  s.owner = [side, 10];
  s.ball = [p[0], p[1]];
  s.players[side][10]!.pos = [p[0], p[1]];
  return s;
}

describe('the box scene (→MATCH-33, T443)', () => {
  it('the scene names near and far post by the ball’s side', () => {
    const Z = BOX_CONFIG.zones;
    const post = BOX_CONFIG.post;
    // The ball wide on the left in the final third: the near post is the left one.
    for (const side of [0, 1] as const) {
      const left = lab([80, 6], side);
      expect(boxSide(left, side)).toBe(-1);
      const scene = boxScene(left, side)!;
      expect(scene).toMatchObject({ side, ball: -1 });
      expect(scene.zones.nearPost[0]).toBeCloseTo(105 - Z.nearPost.out, 9);
      expect(scene.zones.nearPost[1]).toBeCloseTo(34 - post + Z.nearPost.inside, 9);
      expect(scene.zones.farPost[0]).toBeCloseTo(105 - Z.farPost.out, 9);
      expect(scene.zones.farPost[1]).toBeCloseTo(34 + post + Z.farPost.beyond, 9);
      expect(scene.zones.spot).toEqual([105 - Z.spot.out, 34]);
      expect(scene.zones.edge).toEqual([105 - Z.edge.out, 34]);
      // Each post zone lies in its half of the goal-area centre (→MATCH-14's 니어/파 포스트).
      expect(scene.zones.nearPost[0]).toBeGreaterThanOrEqual(BAND_EDGES[7]);
      expect(scene.zones.nearPost[1]).toBeLessThan(34);
      expect(scene.zones.farPost[1]).toBeGreaterThan(34);
      // On the right the posts swap, mirrored across the centre line.
      const right = lab([80, 62], side);
      expect(boxSide(right, side)).toBe(1);
      const mirrored = boxScene(right, side)!.zones;
      expect(mirrored.nearPost[1]).toBeCloseTo(68 - scene.zones.nearPost[1], 9);
      expect(mirrored.farPost[1]).toBeCloseTo(68 - scene.zones.farPost[1], 9);
      expect(mirrored.spot).toEqual(scene.zones.spot);
    }
    expect(boxZones(-1).nearPost[1]).toBeLessThan(boxZones(-1).farPost[1]);
    // A cut-back zone (the goal-area band's half-spaces) turns it on too, from either side.
    expect(boxSide(lab([101, (LANE_EDGES[1] + LANE_EDGES[2]) / 2]), 0)).toBe(-1);
    expect(boxSide(lab([101, (LANE_EDGES[3] + LANE_EDGES[4]) / 2]), 0)).toBe(1);
    // Wide from `wideFrom` up.
    expect(boxSide(lab([BOX_CONFIG.wideFrom, 4]), 0)).toBe(-1);
  });

  it('the scene is off with the ball central outside the box', () => {
    // Central in front of the box (아크 정면), wide short of the final third, a half-space in
    // front of the box, and central inside the box: none is the scene's area.
    for (const at of [
      [80, 34],
      [BOX_CONFIG.wideFrom - 1, 4],
      [80, 20],
      [95, 34],
    ] as Point[]) {
      expect(boxSide(lab(at), 0)).toBeUndefined();
      expect(boxScene(lab(at), 0)).toBeUndefined();
    }
    const wide: Point = [85, 62];
    expect(boxSide(lab(wide), 0)).toBe(1);
    // Only the side on the ball attacks, and only on the candidate model.
    expect(boxSide(lab(wide), 1)).toBeUndefined();
    expect(boxSide(lab(wide, 0, false), 0)).toBeUndefined();
    // A set piece's jobs keep §4.7's scene: a committed box spot held for the second ball.
    const s = lab(wide);
    setIntention(s, s.players[0][9]!, {
      kind: 'run',
      run: 'box',
      priority: 'committed',
      target: [98.5, 30.5],
      until: s.elapsed + 8,
    });
    expect(boxSide(s, 0)).toBeUndefined();
  });
});
