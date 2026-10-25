import { describe, expect, it } from 'vitest';
import { MATCH_MODEL_REVISION } from '../../../contracts/src/match-model';
import { ATTRIBUTES, type Attribute } from '../../../contracts/src/player';
import { DISABLED_RELEASE } from '../../../../tests/fixtures/worlds';
import { CELL_BASELINES } from './baselines';
import { BOX_CONFIG, boxScene, boxSide, boxZones, deliveries, type Delivery } from './box';
import { setIntention } from './intentions';
import { BAND_EDGES, cellOf, clamp, LANE_EDGES, toEngine, type Point } from './pitch';
import { createState, skill, type GridState } from './state';
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

describe('the delivery into the zones (→MATCH-33, T444)', () => {
  /**
   * `lab`'s right winger on the ball at `at` (ball on the right), every skill 60 with no day shift,
   * the opponents back at halfway, so every zone is free: the striker 5 m short of the near post,
   * the left winger short of the far post, the mezzala short of the spot.
   */
  function runners(at: Point): GridState {
    const s = lab(at);
    s.setup.shift = [0, 0];
    for (const roster of s.players) for (const gp of roster) gp.base.fill(60);
    s.players[1].forEach((gp, i) => (gp.pos = toEngine(1, [50, 4 + 6 * i])));
    const z = boxZones(1);
    const put = (idx: number, p: Point) => (s.players[0][idx]!.pos = toEngine(0, p));
    put(9, [z.nearPost[0] - 5, z.nearPost[1]]);
    put(8, [z.farPost[0] - 5, z.farPost[1]]);
    put(6, [z.spot[0] - 4, z.spot[1]]);
    return s;
  }
  const rate = (s: GridState, idx: number, values: Partial<Record<Attribute, number>>) => {
    for (const [a, v] of Object.entries(values))
      s.players[0][idx]!.base[ATTRIBUTES.indexOf(a as Attribute)] = v!;
  };
  const byKind = (s: GridState) =>
    Object.fromEntries(deliveries(s, 0, 10).map((d) => [d.kind, d])) as Partial<
      Record<Delivery['kind'], Delivery>
    >;
  /** A runner's weight: free (1), `suit` × his attributes' shares, his zone's xT. */
  const expected = (s: GridState, d: Delivery, weights: Partial<Record<Attribute, number>>) => {
    let suit = 0;
    for (const [a, w] of Object.entries(weights))
      suit += w! * (clamp(skill(s, 0, d.runner, a as Attribute), 1, 99) / 99);
    const at = boxZones(d.ball)[d.zone];
    return (
      BOX_CONFIG.delivery.free + BOX_CONFIG.delivery.suit * suit + CELL_BASELINES[cellOf(at)]!.xT
    );
  };
  /** The share of the draw (`exp(score / τ)`, τ = 1) a kind takes among `options`. */
  const share = (options: Partial<Record<Delivery['kind'], Delivery>>, kind: Delivery['kind']) => {
    const all = Object.values(options);
    return Math.exp(options[kind]!.score) / all.reduce((sum, d) => sum + Math.exp(d.score), 0);
  };

  it('a lofted ball to the far post prefers the better header', () => {
    const D = BOX_CONFIG.delivery;
    expect(D.kinds.farPost).toContain('far');
    // Wide in the final third: a driven ball to the near post, a lofted one to the far post and a
    // cut-back to the spot; nothing squared from short of the goal-area band.
    const plain = byKind(runners([85, 62]));
    expect(Object.keys(plain).sort()).toEqual(['back', 'far', 'near']);
    expect(plain.far).toMatchObject({ zone: 'farPost', runner: 8, ball: 1 });
    expect(plain.near).toMatchObject({ zone: 'nearPost', runner: 9 });
    expect(plain.back).toMatchObject({ zone: 'spot', runner: 6 });
    const header = runners([85, 62]);
    rate(header, 8, { heading: 85, strength: 80, finishing: 40, composure: 40 });
    const finisher = runners([85, 62]);
    rate(finisher, 8, { heading: 40, strength: 40, finishing: 85, composure: 80 });
    const [h, f] = [byKind(header), byKind(finisher)];
    // His head, not his feet: 0.6 공중볼 + 0.4 몸싸움 on their 0–1 shares, besides free and xT.
    expect(h.far!.score).toBeCloseTo(expected(header, h.far!, D.lofted), 12);
    expect(f.far!.score).toBeCloseTo(expected(finisher, f.far!, D.lofted), 12);
    expect(h.far!.score).toBeGreaterThan(plain.far!.score);
    expect(f.far!.score).toBeLessThan(plain.far!.score);
    // The draw prefers the far post with the better header on it; the near post is untouched.
    expect(share(h, 'far')).toBeGreaterThan(share(plain, 'far'));
    expect(share(plain, 'far')).toBeGreaterThan(share(f, 'far'));
    expect(h.near!.score).toBe(plain.near!.score);
  });

  it('a low ball prefers the better finisher', () => {
    const D = BOX_CONFIG.delivery;
    // From the byline the far post's runner may take it squared low across the goal area too.
    const byline: Point = [101, 62];
    expect(byline[0]).toBeGreaterThanOrEqual(BAND_EDGES[7]);
    const finisher = runners(byline);
    rate(finisher, 8, { heading: 40, strength: 40, finishing: 85, composure: 80 });
    rate(finisher, 9, { finishing: 85, composure: 80 });
    const header = runners(byline);
    rate(header, 8, { heading: 85, strength: 80, finishing: 40, composure: 40 });
    rate(header, 9, { heading: 85, strength: 80 });
    const [f, h] = [byKind(finisher), byKind(header)];
    expect(f.square).toMatchObject({ zone: 'farPost', runner: 8 });
    // His feet, not his head: 0.7 슈팅 + 0.3 침착성 on their 0–1 shares.
    for (const kind of ['near', 'square', 'back'] as const)
      expect(f[kind]!.score, kind).toBeCloseTo(expected(finisher, f[kind]!, D.low), 12);
    expect(f.near!.score).toBeGreaterThan(h.near!.score);
    expect(f.back!.score).toBe(h.back!.score);
    // The same far-post runner: squared low when he finishes better, lofted when he heads better.
    expect(f.square!.score).toBeGreaterThan(f.far!.score);
    expect(h.far!.score).toBeGreaterThan(h.square!.score);
    expect(share(f, 'square')).toBeGreaterThan(share(h, 'square'));
  });
});
