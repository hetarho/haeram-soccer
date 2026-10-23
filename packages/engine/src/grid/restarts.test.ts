import { describe, expect, it } from 'vitest';
import { MATCH_MODEL_REVISION } from '../../../contracts/src/match-model';
import { ATTRIBUTES } from '../../../contracts/src/player';
import { random } from '../primitives';
import { interruptAll, takeBall, updateIntentions, type IntentionReason } from './intentions';
import { prepareOnClock, type MotionKnot } from './movement';
import type { Point } from './pitch';
import {
  classifyOut,
  foulRestart,
  isOffside,
  placeAtOnce,
  playRestart,
  RESTART_CONFIG,
  type Restart,
} from './restarts';
import { shotContext } from './resolve';
import { SHAPE_CONFIG, type SetPieceScene } from './shape';
import { createState, type GridPlayer, type GridState } from './state';
import { gridKit } from './testkit';

/** One world for the whole file (building it is slow); every call resets it: all players at 60, no shift, parked in the far corners. */
const kit = gridKit();
function field() {
  const s = kit.state;
  for (const side of s.players)
    for (const gp of side) {
      gp.pos = gp.side === 0 ? [0, 0] : [105, 68];
      gp.base.fill(60);
      gp.player.traits = [];
      gp.sentOff = false;
      gp.run = undefined;
    }
  s.setup.shift = [0, 0];
  s.elapsed = 0;
  s.owner = undefined;
  s.lastRegain = undefined;
  s.lastLoss = undefined;
  return s;
}
const put = (s: GridState, side: 0 | 1, idx: number, p: Point) =>
  (s.players[side][idx]!.pos = [p[0], p[1]]);
const set = (
  s: GridState,
  side: 0 | 1,
  idx: number,
  attr: (typeof ATTRIBUTES)[number],
  v: number,
) => (s.players[side][idx]!.base[ATTRIBUTES.indexOf(attr)] = v);

describe('grid restarts', () => {
  it('gives a throw-in at the crossing point to the other side', () => {
    expect(classifyOut({ at: [40, 0], lastTouch: 0, over: 'touch' })).toEqual({
      kind: 'throwIn',
      side: 1,
      spot: [40, 0],
      dead: RESTART_CONFIG.dead.throwIn,
    });
    expect(classifyOut({ at: [70, 68], lastTouch: 1, over: 'touch' }).side).toBe(0);
  });

  it('gives a goal kick when attackers touched it last over the byline and a corner when defenders did', () => {
    expect(classifyOut({ at: [105, 20], lastTouch: 0, over: 'byline' })).toEqual({
      kind: 'goalKick',
      side: 1,
      spot: [99.5, 34],
      dead: RESTART_CONFIG.dead.goalKick,
    });
    expect(classifyOut({ at: [105, 20], lastTouch: 1, over: 'byline' })).toEqual({
      kind: 'corner',
      side: 0,
      spot: [105, 0.5],
      dead: RESTART_CONFIG.dead.corner,
    });
    expect(classifyOut({ at: [0, 50], lastTouch: 1, over: 'byline' })).toEqual({
      kind: 'goalKick',
      side: 0,
      spot: [5.5, 34],
      dead: RESTART_CONFIG.dead.goalKick,
    });
    expect(classifyOut({ at: [0, 50], lastTouch: 0, over: 'byline' })).toMatchObject({
      kind: 'corner',
      side: 1,
      spot: [0, 67.5],
    });
  });

  it('turns a saved or blocked shot over the byline into a corner', () => {
    expect(
      classifyOut({ at: [105, 40], lastTouch: 0, over: 'byline', blockedOrSaved: true }),
    ).toMatchObject({
      kind: 'corner',
      side: 0,
      spot: [105, 67.5],
    });
    expect(
      classifyOut({ at: [0, 10], lastTouch: 1, over: 'byline', blockedOrSaved: true }),
    ).toMatchObject({
      kind: 'corner',
      side: 1,
    });
  });

  it('places a free kick at the foul and a penalty inside the box', () => {
    const s = field();
    expect(foulRestart(s, 0, [60, 34])).toEqual({
      kind: 'freeKick',
      side: 0,
      spot: [60, 34],
      dead: RESTART_CONFIG.dead.freeKick,
    });
    expect(foulRestart(s, 0, [100, 30])).toEqual({
      kind: 'penalty',
      side: 0,
      spot: [94, 34],
      dead: RESTART_CONFIG.dead.penalty,
    });
    expect(foulRestart(s, 1, [5, 34])).toEqual({
      kind: 'penalty',
      side: 1,
      spot: [11, 34],
      dead: RESTART_CONFIG.dead.penalty,
    });
    expect(foulRestart(s, 1, [100, 34]).kind).toBe('freeKick');
  });

  const rate = (s: GridState, target: number, n = 4000, from?: Restart['kind']) => {
    const r = random('offside');
    let count = 0;
    for (let i = 0; i < n; i++) if (isOffside(s, 0, target, r, from)) count++;
    return count / n;
  };
  const offsideScene = () => {
    const s = field();
    put(s, 0, 9, [60, 34]);
    s.ball = [60, 34];
    put(s, 1, 0, [104, 34]);
    put(s, 1, 2, [80, 20]);
    put(s, 1, 3, [82, 40]);
    for (const i of [1, 4, 5, 6, 7, 8, 9, 10]) put(s, 1, i, [50, 60]);
    put(s, 0, 10, [90, 34]);
    return s;
  };

  it('flags offside only for a target in the opponent half beyond both the ball and the second-last opponent when the pass is played', () => {
    const s = offsideScene();
    const p = rate(s, 10);
    expect(p).toBeGreaterThan(RESTART_CONFIG.offside.min);
    expect(p).toBeLessThan(RESTART_CONFIG.offside.base + 0.1);
    // Level with the second-last defender, in his own half, behind the ball: never.
    put(s, 0, 10, [81, 34]);
    expect(rate(s, 10)).toBe(0);
    put(s, 0, 10, [45, 34]);
    expect(rate(s, 10)).toBe(0);
    put(s, 0, 10, [90, 34]);
    s.ball = [95, 10];
    expect(rate(s, 10)).toBe(0);
    s.ball = [60, 34];
    for (const from of ['throwIn', 'goalKick', 'corner'] as const)
      expect(rate(s, 10, 500, from)).toBe(0);
    expect(rate(s, 10, 500, 'freeKick')).toBeGreaterThan(0);
  });

  it('lets a high-decisions runner time his run better and a line breaker more so', () => {
    // The world is shared, so each scene is measured before the next one is built.
    const base = rate(offsideScene(), 10);
    const sharp = offsideScene();
    set(sharp, 0, 10, 'decisions', 90);
    const sharpRate = rate(sharp, 10);
    const dull = offsideScene();
    set(dull, 0, 10, 'decisions', 30);
    const dullRate = rate(dull, 10);
    const runner = offsideScene();
    runner.players[0][10]!.player.traits = ['linebreaker'];
    const runnerRate = rate(runner, 10);
    expect(sharpRate).toBeLessThan(base);
    expect(dullRate).toBeGreaterThan(base);
    expect(runnerRate).toBeLessThan(base - 0.05);
  });

  it('a receiver with poor 판단력 in an offside position is called more often than one with good 판단력, on the candidate model only', () => {
    const called = (decisions: number, candidate: boolean) => {
      const s = offsideScene();
      const gp = s.players[0][10]!;
      const player = gp.player;
      gp.player = { ...player, attrs: { ...player.attrs, decisions } };
      s.setup.model = candidate ? MATCH_MODEL_REVISION : undefined;
      try {
        return rate(s, 10);
      } finally {
        gp.player = player;
        s.setup.model = undefined;
      }
    };
    // The candidate call reads his own 판단력 (T384): a quarter's worth below the pivot is called
    // well over three times as often as a quarter's worth above it.
    expect(called(55, true)).toBeGreaterThan(3 * called(80, true));
    // The pre-feature call reads the duels' scale, where his attribute here is unchanged.
    expect(called(55, false)).toBe(called(80, false));
  });

  const kinds = (build: () => { s: GridState; rs: Restart }, n: number) => {
    const out: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const { s, rs } = build();
      const result = playRestart(s, rs, random(`rs-${i}`), shotContext(s));
      out[String(result.kind)] = (out[String(result.kind)] ?? 0) + 1;
    }
    return out;
  };
  const freeKickAt = (spot: Point) => () => ({
    s: field(),
    rs: {
      kind: 'freeKick',
      side: 0,
      spot: [spot[0], spot[1]],
      dead: RESTART_CONFIG.dead.freeKick,
    } as Restart,
  });

  it('shoots direct free kicks only within range, crosses wide free kicks and corners into the box', () => {
    const near = kinds(freeKickAt([85, 34]), 300);
    expect(Math.abs(near.shot! / 300 - RESTART_CONFIG.directChance)).toBeLessThan(0.08);
    expect(kinds(freeKickAt([84, 34]), 100).cross).toBeGreaterThan(0);
    expect(kinds(freeKickAt([70, 34]), 100).shot).toBeUndefined();
    expect(kinds(freeKickAt([95, 6]), 100)).toEqual({ cross: 100 });
    const corners = kinds(
      () => ({
        s: field(),
        rs: {
          kind: 'corner',
          side: 0,
          spot: [105, 0.5],
          dead: RESTART_CONFIG.dead.corner,
        } as Restart,
      }),
      400,
    );
    expect(corners.cross! / 400).toBeGreaterThan(0.78);
    expect(corners.short! / 400).toBeGreaterThan(0.08);
    expect(corners.short! / 400).toBeLessThan(0.22);
  });

  it('throws in short to the nearest free teammate', () => {
    const s = field();
    put(s, 0, 5, [52, 4]);
    put(s, 0, 6, [60, 10]);
    put(s, 0, 7, [75, 20]);
    put(s, 1, 3, [53, 4]);
    const rs = classifyOut({ at: [50, 0], lastTouch: 1, over: 'touch' });
    const result = playRestart(s, rs, random('throw'), shotContext(s));
    expect(rs.side).toBe(0);
    expect(result.kind).toBe('short');
    expect(result.taker).toBe(5);
    expect(result.target).toBe(6);
    expect(s.players[0][5]!.pos).toEqual([50, 0]);
    expect(s.ball).toEqual([50, 0]);
  });

  it('never plays a dropped ball to a teammate standing on its spot', () => {
    const s = field();
    const keeper = s.players[0].find((gp) => gp.slot === 0)!.idx;
    put(s, 0, keeper, [103, 34]);
    put(s, 0, 5, [100, 30]);
    put(s, 0, 6, [95, 40]);
    const rs: Restart = { kind: 'dropBall', side: 0, spot: [103, 34], dead: 0 };
    const result = playRestart(s, rs, random('drop'), shotContext(s));
    expect(result.taker).toBe(5);
    expect(result.target).toBe(6);
    expect(s.ball.every(Number.isFinite)).toBe(true);
  });

  it('kicks off backwards from the centre spot', () => {
    for (let i = 0; i < 40; i++) {
      const s = field();
      put(s, 0, 9, [52.5, 34]);
      put(s, 0, 6, [45, 30]);
      put(s, 0, 7, [47, 40]);
      put(s, 0, 10, [56, 34]);
      s.owner = [0, 9];
      const result = playRestart(
        s,
        { kind: 'kickoff', side: 0, spot: [52.5, 34], dead: RESTART_CONFIG.dead.kickoff },
        random(`ko-${i}`),
        shotContext(s),
      );
      expect(result.taker).toBe(9);
      expect(s.players[0][9]!.pos).toEqual([52.5, 34]);
      expect([6, 7]).toContain(result.target);
    }
  });

  it('gets the taker and a delivery scene to the restart through its preparation', () => {
    const calls: { taker: number; scene?: SetPieceScene; at: Point }[] = [];
    const s = field();
    put(s, 0, 9, [60, 30]);
    const rs: Restart = { kind: 'corner', side: 0, spot: [105, 0.5], dead: 32 };
    const result = playRestart(
      s,
      rs,
      random('corner-prep'),
      shotContext(s),
      (st, r, taker, scene) => {
        calls.push({ taker, scene, at: [...st.players[0][taker]!.pos] as Point });
        placeAtOnce(st, r, taker, scene);
      },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.taker).toBe(result.taker);
    // Nobody stands on the restart before the preparation runs.
    expect(calls[0]!.at).not.toEqual([105, 0.5]);
    const scene = calls[0]!.scene!;
    expect(scene.up.length).toBeGreaterThan(3);
    expect(scene.marks.length).toBeGreaterThan(3);
    // The pre-feature preparation puts everyone on his spot at once and keeps the attackers up.
    for (const { gp, to } of [...scene.up, ...scene.marks]) expect(gp.pos).toEqual(to);
    for (const { gp } of scene.up)
      expect(gp.run?.until).toBe(s.elapsed + 32 + SHAPE_CONFIG.setPiece.stay);
    expect(s.players[0][result.taker]!.pos).toEqual([105, 0.5]);
    // A throw-in has a taker and no scene.
    calls.length = 0;
    playRestart(
      field(),
      classifyOut({ at: [40, 0], lastTouch: 1, over: 'touch' }),
      random('t'),
      shotContext(s),
      (st, r, taker, sc) => {
        calls.push({ taker, scene: sc, at: [0, 0] });
        placeAtOnce(st, r, taker, sc);
      },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.scene).toBeUndefined();
  });

  /**
   * A candidate corner by side 0 taken through the candidate preparation (T348): both sides walk
   * from their kick-off places to the scene, whose jobs start at the kick.
   */
  const candidateCorner = () => {
    const s = createState({ ...kit.setup, model: MATCH_MODEL_REVISION });
    s.elapsed = s.t = 1200;
    s.ball = [105, 20];
    const rs: Restart = {
      kind: 'corner',
      side: 0,
      spot: [105, 0.5],
      dead: RESTART_CONFIG.dead.corner,
    };
    let scene: SetPieceScene | undefined;
    const prepare = prepareOnClock([105, 20], { knots: [] as MotionKnot[] });
    playRestart(s, rs, random('second-ball'), shotContext(s), (st, r, taker, sc) => {
      scene = sc;
      prepare(st, r, taker, sc);
    });
    return { s, scene: scene!, kick: s.elapsed };
  };
  /** The set-piece jobs held now: everything committed at `kick`. */
  const jobs = (s: GridState, kick: number) =>
    s.players
      .flat()
      .filter((gp) => gp.intention?.since === kick && gp.intention.priority === 'committed');
  /** `gp` wins the second ball at `at` a second later, as `playGrid` hands it over, and everyone reacts. */
  const win = (s: GridState, gp: GridPlayer, at: Point) => {
    s.elapsed += 1;
    if (s.possession !== gp.side) interruptAll(s, 'turnover');
    takeBall(s, gp, at);
    s.owner = [gp.side, gp.idx];
    s.possession = gp.side;
    s.ball = [at[0], at[1]];
    updateIntentions(s);
  };
  const endedAs = (gps: GridPlayer[], reason: IntentionReason) => {
    for (const gp of gps) expect(gp.ended?.reason, `${gp.side}:${gp.idx}`).toBe(reason);
  };

  it('second ball releases obsolete restart jobs', () => {
    const { s, scene, kick } = candidateCorner();
    const until = kick + SHAPE_CONFIG.setPiece.stay;
    const runners = scene.up.map((u) => u.gp);
    const pairs = scene.marks.filter((m) => m.opponent);
    const guards = [...scene.marks.filter((m) => !m.opponent).map((m) => m.gp), scene.keeper!];
    // At the kick every restart place is reached and no restart job is left; the men who went up,
    // their markers, the zone guards and the keeper hold their jobs to one end.
    expect(s.players.flat().some((gp) => gp.intention?.priority === 'restart')).toBe(false);
    for (const { gp } of [...scene.up, ...scene.marks]) {
      expect(gp.ended).toMatchObject({ kind: 'restart', reason: 'arrival' });
      expect(gp.intention).toMatchObject({ priority: 'committed', since: kick, until });
    }
    expect(scene.keeper!.intention).toMatchObject({ kind: 'cover', since: kick, until });
    expect(jobs(s, kick)).toHaveLength(runners.length + scene.marks.length + 1);

    // The attackers win the second ball at the edge of the box: every other job still serves it.
    const edge = runners.at(-1)!;
    win(s, edge, [88, 40]);
    for (const gp of guards) expect(gp.intention).toMatchObject({ kind: 'cover', since: kick });
    for (const { gp, opponent } of pairs.filter((m) => m.opponent !== edge))
      expect(gp.intention).toMatchObject({ kind: 'mark', opponent: opponent!.idx, since: kick });
    // They play it back out of the area: the zones and the goal need no guard, while the markers
    // stay with the men still holding the box.
    const back = s.players[0].find(
      (gp) => gp.slot > 0 && gp.slot < 11 && !runners.includes(gp) && !gp.intention,
    )!;
    win(s, back, [70, 34]);
    endedAs(guards, 'cleared');
    const holding = pairs.filter((m) => m.opponent!.intention?.run === 'box');
    expect(holding.length).toBeGreaterThan(2);
    for (const { gp, opponent } of holding)
      expect(gp.intention).toMatchObject({ kind: 'mark', opponent: opponent!.idx, since: kick });
    // Their hold ends: the men and their markers are released together, and nothing is left.
    s.elapsed = until;
    updateIntentions(s);
    endedAs(
      holding.map((m) => m.opponent!),
      'expiry',
    );
    expect(jobs(s, kick)).toEqual([]);

    // The defenders win the second ball instead: a turnover ends every set-piece job on both sides.
    const won = candidateCorner();
    const clearer = won.scene.marks[0]!.gp;
    win(won.s, clearer, [100, 33]);
    endedAs(
      [...won.scene.up, ...won.scene.marks].map((p) => p.gp),
      'turnover',
    );
    endedAs([won.scene.keeper!], 'turnover');
    expect(jobs(won.s, won.kick)).toEqual([]);
    // Or the ball goes out: the next restart ends them all.
    const out = candidateCorner();
    interruptAll(out.s, 'restart');
    endedAs(
      [...out.scene.up, ...out.scene.marks, { gp: out.scene.keeper! }].map((p) => p.gp),
      'restart',
    );
  });

  it('takes penalties and goal kicks and re-picks a taker who has left', () => {
    const s = field();
    const rs = foulRestart(s, 0, [100, 34]);
    const taker = s.setup.takers[0].penalty;
    s.players[0][taker]!.sentOff = true;
    const result = playRestart(s, rs, random('pen'), shotContext(s));
    expect(result.kind).toBe('penalty');
    expect(result.taker).not.toBe(taker);
    expect(result.outcome.kind).toBe('shot');
    const kick = playRestart(
      s,
      classifyOut({ at: [105, 20], lastTouch: 0, over: 'byline' }),
      random('gk'),
      shotContext(s),
    );
    expect(kick.taker).toBe(0);
    expect(['short', 'long']).toContain(kick.kind);
  });
});
