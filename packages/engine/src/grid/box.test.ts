import { describe, expect, it } from 'vitest';
import {
  MATCH_MODEL_REVISION,
  MATCH_MODEL_REVISIONS,
  type MatchModelRevision,
} from '../../../contracts/src/match-model';
import { ATTRIBUTES, type Attribute } from '../../../contracts/src/player';
import { DISABLED_RELEASE } from '../../../../tests/fixtures/releases';
import { CELL_BASELINES } from './baselines';
import { random } from '../primitives';
import { BOX_CONFIG, boxScene, boxSide, boxZones, deliveries, type Delivery } from './box';
import { setIntention } from './intentions';
import { LANE_CONFIG } from './lanes';
import { actionTiming, flightSeconds, reachSeconds } from './movement';
import { BAND_EDGES, cellOf, clamp, LANE_EDGES, toEngine, type Point } from './pitch';
import {
  blockedBehind,
  blockRebound,
  chanceXg,
  closingBlockers,
  keeperNarrowing,
  resolveShot,
  saveRebound,
  secondBall,
  SHOT_CONFIG,
  shotBlockers,
  shotContext,
  unblocked,
} from './resolve';
import { speedOf } from './shape';
import { createState, skill, type GridState } from './state';
import { computeTags } from './tags';
import { gridKit } from './testkit';

// Side 0 plays possession (4-3-3), side 1 balanced (3-5-2), both parked at their own ends.
const kit = gridKit(['possession', 'balanced'], 'box-lab', DISABLED_RELEASE);
/** Revision 9: a shot's second ball before revision 10 struck it at once and won it clear (T596). */
const REVISION_9 = MATCH_MODEL_REVISIONS[8]!;

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
      // Each post zone lies on its side of the goal's middle (→MATCH-14's 니어/파 포스트): the near
      // post in the goal area, the far post beyond the six-yard line in the box, where a lofted
      // ball to it is met (T447, 8 m out).
      expect(scene.zones.nearPost[0]).toBeGreaterThanOrEqual(BAND_EDGES[7]);
      expect(scene.zones.farPost[0]).toBeLessThan(BAND_EDGES[7]);
      expect(scene.zones.farPost[0]).toBeGreaterThanOrEqual(BAND_EDGES[6]);
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

describe('the bodies in front of goal (→MATCH-35, T445)', () => {
  /**
   * A candidate state on `model`, every skill 60 with no day shift: side 0's striker on the ball at
   * `at`, side 1's keeper on his line, everyone else parked in a far corner, then side 1's `bodies`
   * (roster index → engine point; side 0 attacks toward x = 105).
   */
  function shotLab(
    at: Point,
    bodies: Record<number, Point> = {},
    model: MatchModelRevision = MATCH_MODEL_REVISION,
  ): GridState {
    const s = createState({ ...kit.setup, model });
    s.setup.shift = [0, 0];
    for (const roster of s.players)
      for (const gp of roster) {
        gp.base.fill(60);
        gp.pos = gp.side === 0 ? [3, 2] : [102, 66];
      }
    s.players[1][0]!.pos = [104.5, 34];
    for (const [idx, p] of Object.entries(bodies)) s.players[1][Number(idx)]!.pos = [p[0], p[1]];
    s.possession = 0;
    s.owner = [0, 9];
    s.players[0][9]!.pos = [at[0], at[1]];
    s.ball = [at[0], at[1]];
    return s;
  }
  /** `n` shots of the striker: how many were blocked, and by whom. */
  const shoot = (s: GridState, n: number, seed: string) => {
    const ctx = shotContext(s);
    const tags = computeTags(s, 0, 9);
    const r = random(seed);
    const out = { block: 0, by: {} as Record<number, number> };
    for (let i = 0; i < n; i++) {
      const o = resolveShot(s, 0, 9, tags, ctx, r);
      if (o.result !== 'block') continue;
      out.block++;
      out.by[o.by!] = (out.by[o.by!] ?? 0) + 1;
    }
    return out;
  };
  /** A body's chance by `BOX_CONFIG.shot`: `block` × his nearness × his 위치선정's factor. */
  const chanceOf = (s: GridState, idx: number, from: Point) => {
    const B = BOX_CONFIG.shot;
    const [x, y] = s.players[1][idx]!.pos;
    const [gx, gy] = [105 - from[0], 34 - from[1]];
    const along = ((x - from[0]) * gx + (y - from[1]) * gy) / (gx * gx + gy * gy);
    const read = 1 + (skill(s, 1, idx, 'positioning') - 55) * SHOT_CONFIG.block.skill;
    return B.block * (1 - (1 - B.far) * along) * read;
  };

  it('two defenders in the shot’s path block it more often than one', () => {
    const from: Point = [90, 34];
    const one = shotLab(from, { 4: [96, 34] });
    const two = shotLab(from, { 4: [96, 34], 5: [101, 33] });
    const [b1, b2] = [shotBlockers(one, 0, from), shotBlockers(two, 0, from)];
    expect(b1.map((b) => b.gp.idx)).toEqual([4]);
    expect(b1[0]!.chance).toBeCloseTo(chanceOf(one, 4, from), 12);
    // Nearest the shooter first; the one nearer the goal line is the less likely to block it.
    expect(b2.map((b) => b.gp.idx)).toEqual([4, 5]);
    expect(b2[1]!.chance).toBeCloseTo(chanceOf(two, 5, from), 12);
    expect(b2[1]!.chance).toBeLessThan(b2[0]!.chance);
    expect(unblocked(b2)).toBeCloseTo((1 - b2[0]!.chance) * (1 - b2[1]!.chance), 12);
    const n = 20000;
    const [a, b] = [shoot(one, n, 'block-one'), shoot(two, n, 'block-two')];
    expect(Math.abs(a.block / n - b1[0]!.chance)).toBeLessThan(0.015);
    expect(Math.abs(b.block / n - (1 - unblocked(b2)))).toBeLessThan(0.015);
    expect(b.block).toBeGreaterThan(a.block);
    // The nearer one draws first: the farther blocks only what gets past him.
    const past = (1 - b2[0]!.chance) * b2[1]!.chance;
    expect(Math.abs((b.by[5] ?? 0) / n - past)).toBeLessThan(0.015);
    // A better reader of the play gets in the way more often.
    const sharp = shotLab(from, { 4: [96, 34] });
    sharp.players[1][4]!.base[ATTRIBUTES.indexOf('positioning')] = 90;
    expect(shotBlockers(sharp, 0, from)[0]!.chance).toBeGreaterThan(b1[0]!.chance);
  });

  it('a shot with nobody in its path is never blocked', () => {
    const from: Point = [90, 34];
    // Beside the triangle to the posts by more than `lane` (1.76 m off its edge, 1.71 m square to
    // it), behind the ball beyond closing reach (T548) and well wide; the keeper is no outfielder.
    const s = shotLab(from, { 4: [100, 38.2], 5: [83, 34], 6: [96, 25] });
    expect(shotBlockers(s, 0, from)).toEqual([]);
    expect(closingBlockers(s, 0, from, [])).toEqual([]);
    // A step behind the ball he is no body in its path, but on revision 7 he closes it down.
    const chased = shotLab(from, { 5: [89, 34] });
    expect(shotBlockers(chased, 0, from)).toEqual([]);
    expect(closingBlockers(chased, 0, from, []).map((b) => b.gp.idx)).toEqual([5]);
    expect(shoot(s, 5000, 'open').block).toBe(0);
    // With nobody in its path the shot's xG is the chance's, narrowed on revision 9 by the keeper
    // half a metre off his line (T579).
    const tags = computeTags(s, 0, 9);
    const o = resolveShot(s, 0, 9, tags, shotContext(s), random('open-xg'));
    const narrowed = keeperNarrowing(s, 0, from, s.players[1][0]!);
    expect(narrowed).toBeLessThan(1);
    expect(o.xg).toBe(
      chanceXg(from, { pressure: tags.pressure, candidate: true }, s.math) * narrowed,
    );
    // 1.26 m off the edge (1.22 m square to it) he is in its path.
    const edge = shotLab(from, { 4: [100, 37.7] });
    expect(shotBlockers(edge, 0, from).map((b) => b.gp.idx)).toEqual([4]);
  });

  /** The keeper's parry of a shot struck at once from `from`, on `model`, with side 0's `mates`. */
  const parry = (model: MatchModelRevision, from: Point, mates: Record<number, Point> = {}) => {
    const s = shotLab(from, {}, model);
    for (const [idx, p] of Object.entries(mates)) s.players[0][Number(idx)]!.pos = [p[0], p[1]];
    const keeper = s.players[1][0]!;
    const land = saveRebound(from, keeper.pos, () => 0.5);
    return { s, keeper, ball: secondBall(s, 0, s.players[0][9]!, keeper, land, 0) };
  };

  it('a parry is won clear of the keeper on revision 10, not on his spot (T596)', () => {
    // An attacker 1.08 m from the keeper, within reach of the ball as it leaves him.
    const from: Point = [92, 30];
    const mates = { 8: [103.6, 33.4] as Point };
    const ninth = parry(REVISION_9, from, mates);
    const tenth = parry(MATCH_MODEL_REVISION, from, mates);
    const keeperAt = ninth.keeper.pos;
    // Revision 9 keeps its meeting point: he plays it on the keeper's own spot.
    expect(ninth.ball).toEqual({ via: keeperAt, at: keeperAt, winner: [0, 8] });
    // Revision 10: the same man meets it where it has left the keeper's body (→MATCH-35 r44).
    const clear = BOX_CONFIG.shot.revision10.clear;
    expect(tenth.ball.via).toEqual(keeperAt);
    expect(tenth.ball.winner).toEqual([0, 8]);
    const off = Math.hypot(tenth.ball.at[0] - keeperAt[0], tenth.ball.at[1] - keeperAt[1]);
    expect(off).toBeGreaterThanOrEqual(clear - 1e-9);
    expect(off).toBeLessThan(clear + LANE_CONFIG.step);
    // Beyond his body nothing changes: a man further out meets it where he did.
    const out = { 8: [100.5, 30] as Point };
    expect(parry(MATCH_MODEL_REVISION, from, out).ball).toEqual(parry(REVISION_9, from, out).ball);
  });

  it('a block the byline cuts short of clearing its blocker goes behind on revision 10 (T607)', () => {
    // T607's t445-rebound-35: a shot struck on the goal line, closed down from 0.2 m behind. Its
    // rebound runs back toward the shooter, over the line, so the pitch keeps it 0.5 m inside it.
    const from: Point = [105 - 1e-6, 34];
    const blocker: Point = [104.8, 33.97];
    const clear = BOX_CONFIG.shot.revision10.clear;
    const scene = (model: MatchModelRevision) => {
      const s = shotLab(from, { 4: blocker }, model);
      expect(closingBlockers(s, 0, from, shotBlockers(s, 0, from)).map((b) => b.gp.idx)).toEqual([
        4,
      ]);
      return s;
    };
    const land = blockRebound(from, blocker, () => 0.5);
    expect(land[0]).toBeGreaterThan(105);
    // Its bounded path, were it left loose: shorter than `clear`, so nobody can meet it on the way
    // and it rests where the pitch stops it, within the blocker's reach, for whoever gets there.
    const tenth = scene(MATCH_MODEL_REVISION);
    const rest = secondBall(tenth, 0, tenth.players[0][9]!, tenth.players[1][4]!, land, 0);
    expect(rest.via).toEqual(blocker);
    expect(rest.at).toEqual([104.5, clamp(land[1], 0.5, 67.5)]);
    expect(Math.hypot(rest.at[0] - blocker[0], rest.at[1] - blocker[1])).toBeLessThan(clear);
    // Revision 10 sends it behind instead, so it is never won on top of him (→MATCH-35 r44);
    // revision 9 keeps its football.
    expect(blockedBehind(tenth, 0, tenth.players[1][4]!, land)).toBe(true);
    const ninth = scene(REVISION_9);
    expect(blockedBehind(ninth, 0, ninth.players[1][4]!, land)).toBe(false);
    const shots = (s: GridState) => {
      const tags = computeTags(s, 0, 9);
      const r = random('goal-line-block');
      return Array.from({ length: 4000 }, () => resolveShot(s, 0, 9, tags, shotContext(s), r))
        .filter((o) => o.result === 'block')
        .map((o) => ({ then: o.then, at: o.at }));
    };
    // Draw for draw the same blocks: a loose one on revision 10 is won clear of him; a rebound its
    // draw sends no further than the byline's reach of him goes behind.
    const [before, after] = [shots(ninth), shots(tenth)];
    expect(after).toHaveLength(before.length);
    let wentBehind = 0;
    after.forEach((o, i) => {
      if (o.then === 'loose') {
        expect(before[i]!.then).toBe('loose');
        expect(Math.hypot(o.at![0] - blocker[0], o.at![1] - blocker[1])).toBeGreaterThanOrEqual(
          clear - 1e-9,
        );
      } else if (before[i]!.then === 'loose') {
        expect(o).toEqual({ then: 'corner', at: undefined });
        wentBehind++;
      }
    });
    expect(wentBehind).toBeGreaterThan(20);
    // A rebound kept on the pitch, or one the byline stops clear of its blocker, stays loose.
    const path = scene(MATCH_MODEL_REVISION);
    path.players[1][4]!.pos = [96, 34];
    expect(blockedBehind(path, 0, path.players[1][4]!, [100, 34])).toBe(false);
    const behind: Point = [99, 34];
    const far = shotLab([101, 34], { 4: behind });
    const over = blockRebound([101, 34], behind, () => 0.5);
    expect(over[0]).toBeGreaterThan(105);
    expect(blockedBehind(far, 0, far.players[1][4]!, over)).toBe(false);
    const loose = secondBall(far, 0, far.players[0][9]!, far.players[1][4]!, over, 0);
    expect(Math.hypot(loose.at[0] - behind[0], loose.at[1] - behind[1])).toBeGreaterThanOrEqual(
      clear - 1e-9,
    );
  });

  it('a first-time shot is struck at once on revision 10, its second ball waiting for its winner (T596)', () => {
    // Nobody near the parry's path: the shooter himself runs to where it stops, needing longer
    // than the shot and the parry take to get there (T596's t445-rebound-31).
    const from: Point = [92, 30];
    const timing = (model: MatchModelRevision) => {
      const { s, keeper, ball } = parry(model, from);
      expect(ball.winner).toEqual([0, 9]);
      const shooter = s.players[0][9]!;
      const flight =
        flightSeconds(from, keeper.pos, 'shot') + flightSeconds(keeper.pos, ball.at, 'pass');
      const reach = reachSeconds(shooter, ball.at, speedOf(s, shooter));
      expect(reach).toBeGreaterThan(flight + 0.5);
      // A first-time shot has no carry and no time of its own beyond its route (`least` 0).
      return { flight, reach, ...actionTiming(s.setup, 100, 0, flight, reach, false, true) };
    };
    const ninth = timing(REVISION_9);
    const tenth = timing(MATCH_MODEL_REVISION);
    // Both last until he gets there.
    expect(ninth.dt).toBe(ninth.reach);
    expect(tenth.dt).toBe(tenth.reach);
    // Revision 9 keeps its wind-up: the shot waits so the ball lands as he arrives.
    expect(ninth.windUp).toBeCloseTo(ninth.reach - ninth.flight, 12);
    expect(ninth.kick).toBeGreaterThan(100);
    expect(ninth.lands).toBe(100 + ninth.dt);
    // Revision 10 strikes it as the action starts; the ball lands its flight later and waits.
    expect(tenth).toMatchObject({ windUp: 0, kick: 100, lands: 100 + tenth.flight });
    expect(tenth.lands).toBeLessThan(100 + tenth.dt);
    // Any other action keeps its timing on revision 10: a pass lands as its receiver arrives.
    const tenthPass = actionTiming(
      { ...kit.setup, model: MATCH_MODEL_REVISION },
      100,
      0,
      tenth.flight,
      tenth.reach,
      false,
      false,
    );
    expect(tenthPass).toMatchObject({ windUp: ninth.windUp, kick: ninth.kick, lands: ninth.lands });
  });
});
