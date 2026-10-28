import { describe, expect, it } from 'vitest';
import {
  MATCH_MODEL_REVISION,
  MATCH_MODEL_REVISIONS,
  type MatchModelRevision,
} from '../../../contracts/src/match-model';
import { ATTRIBUTES } from '../../../contracts/src/player';
import type { Tactic } from '../../../contracts/src/types';
import { DISABLED_RELEASE } from '../../../../tests/fixtures/releases';
import { FORMATIONS, lineOf } from '../player';
import { random } from '../primitives';
import { defendSetPiece, restartTaken, takeBall, updateIntentions } from './intentions';
import { advance } from './movement';
import { attackFrame, inBox, PITCH, toEngine, type Point } from './pitch';
import {
  lineX,
  moveAll,
  offsideLine,
  runContext,
  runPlan,
  setPieceShape,
  setPieceTargets,
  SHAPE_CONFIG,
  speedOf,
  startRuns,
  tacticShape,
  targetOf,
} from './shape';
import { createState, onPitch, type GridPlayer, type GridState } from './state';
import { ROLE_SHIFT, SPOTS } from './spots';
import { gridKit } from './testkit';

const TACTICS: Tactic[] = ['balanced', 'possession', 'counter', 'press'];
// Every kit below plays the pre-feature path; candidate cases set the setup's model.
/** Side 0's targets in its own attack frame, which is the engine frame. */
const targets = (kit: ReturnType<typeof gridKit>, side: 0 | 1 = 0) =>
  kit.state.players[side]
    .slice(0, 11)
    .map((gp) => attackFrame(side, targetOf(kit.state, side, gp.idx)));
const outfieldMeanX = (kit: ReturnType<typeof gridKit>) => {
  const xs = targets(kit).slice(1);
  return xs.reduce((sum, p) => sum + p[0], 0) / xs.length;
};

const gap = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);
const setPieceKit = gridKit(['balanced', 'possession'], 'set-piece-lab', DISABLED_RELEASE);
/**
 * A candidate corner kick by side 0 from [105, 0.5] (T348): everyone stands on his scene place, as
 * the preparation leaves them, and the kick is taken.
 */
function cornerKick() {
  const s = createState({ ...setPieceKit.setup, model: MATCH_MODEL_REVISION });
  s.elapsed = s.t = 600;
  const taker = s.setup.takers[0].corner;
  const scene = setPieceTargets(s, 0, taker);
  s.players[0][taker]!.pos = [105, 0.5];
  for (const { gp, to } of [...scene.up, ...scene.marks]) gp.pos = [to[0], to[1]];
  s.ball = [105, 0.5];
  s.possession = 0;
  s.owner = [0, taker];
  const until = s.elapsed + SHAPE_CONFIG.setPiece.stay;
  restartTaken(s, scene.up, until);
  defendSetPiece(s, scene, until);
  return { s, scene, taker, until };
}
/** The delivery reaches `gp` of side 0, as `playGrid` hands it to him, and everyone reacts. */
function deliver(s: GridState, gp: GridPlayer, taker: number) {
  takeBall(s, gp, gp.pos, taker);
  s.owner = [0, gp.idx];
  s.ball = [gp.pos[0], gp.pos[1]];
  updateIntentions(s);
}

describe('grid shape and movement', () => {
  it("holds each tactic's defensive line inside its bounds, dropping goal-side of a ball played behind it", () => {
    for (const tactic of TACTICS) {
      const kit = gridKit([tactic, 'balanced'], undefined, DISABLED_RELEASE);
      const { line } = SHAPE_CONFIG.tactic[tactic];
      const slots = FORMATIONS[tactic].slots;
      kit.state.possession = 1;
      kit.state.owner = [1, 5];
      for (let bx = 10; bx <= 95; bx += 5) {
        kit.state.ball = [bx, 20];
        const t = targets(kit);
        // Side 0 defends x = 0, so the ball's x is its distance from his goal.
        const { behindBall, min } = SHAPE_CONFIG.deepLine;
        const floor = Math.min(line[0], Math.max(min, bx - behindBall));
        slots.forEach((slot, i) => {
          if (lineOf(slot.position) !== 'DF') return;
          expect(t[i]![0], `${tactic} slot ${i} ball ${bx}`).toBeGreaterThanOrEqual(floor - 1e-9);
          expect(t[i]![0], `${tactic} slot ${i} ball ${bx}`).toBeLessThanOrEqual(line[1] + 1e-9);
        });
      }
    }
  });

  it('sends the best headers into the box for a set piece, marked goal-side, and holds them there', () => {
    const kit = gridKit(undefined, undefined, DISABLED_RELEASE);
    const s = kit.state;
    const taker = 9;
    setPieceShape(s, 0, taker, s.elapsed + 30);
    const box = (side: 0 | 1) =>
      s.players[side].filter((gp) => onPitch(gp) && gp.slot > 0 && inBox(attackFrame(0, gp.pos)));
    const P = SHAPE_CONFIG.setPiece;
    expect(box(0).length).toBe(P.box.length);
    expect(box(0).some((gp) => gp.idx === taker)).toBe(false);
    // Every attacker in the box has a marker goal-side of him; the six-yard line is held too.
    expect(box(1).length).toBe(P.box.length + P.zonal.length);
    for (const gp of box(0)) {
      expect(gp.run?.kind).toBe('box');
      expect(
        box(1).some((d) => d.pos[0] > gp.pos[0] && Math.abs(d.pos[1] - gp.pos[1]) < 1e-9),
      ).toBe(true);
    }
    // The defenders' most advanced stay out for the counter, the attackers keep a rest defence.
    const outfield = (side: 0 | 1) => s.players[side].filter((gp) => onPitch(gp) && gp.slot > 0);
    expect(outfield(1).length - box(1).length).toBeGreaterThanOrEqual(P.stayUp);
    expect(outfield(0).length - box(0).length).toBeGreaterThan(2);
    // Until the second ball is over they keep their spots.
    moveAll(s, 4);
    for (const gp of box(0)) expect(targetOf(s, 0, gp.idx)).toEqual(gp.run!.target);
    expect(box(0)[0]!.run!.target).toEqual(toEngine(0, P.box[0] as Point));
  });

  it('corner defenders retain and update their marks after the kick', () => {
    const { s, scene, taker, until } = cornerKick();
    const marks = scene.marks.filter((m) => m.opponent);
    // Every man who went up, the one at the edge too, has exactly one marker; the six-yard places
    // mark nobody and guard their zones.
    const ids = (gps: GridPlayer[]) => gps.map((gp) => gp.idx).sort((a, b) => a - b);
    expect(ids(marks.map((m) => m.opponent!))).toEqual(ids(scene.up.map((u) => u.gp)));
    expect(scene.marks.length - marks.length).toBe(SHAPE_CONFIG.setPiece.zonal.length);
    for (const { gp, opponent } of marks)
      expect(gp.intention).toMatchObject({
        kind: 'mark',
        priority: 'committed',
        opponent: opponent!.idx,
        since: s.elapsed,
        until,
      });
    for (const { gp } of scene.marks.filter((m) => !m.opponent))
      expect(gp.intention).toMatchObject({ kind: 'cover', priority: 'committed', until });
    // The cross reaches the first man up: one defender presses him on the ball, and every other
    // marker keeps his man, goal-side of him (side 1 defends x = 105).
    const receiver = scene.up[0]!.gp;
    deliver(s, receiver, taker);
    expect(
      s.players[1].filter(
        (gp) => gp.intention?.kind === 'press' && gp.intention.opponent === receiver.idx,
      ),
    ).toHaveLength(1);
    const kept = marks.filter((m) => m.opponent !== receiver);
    for (const { gp, opponent } of kept) {
      expect(gp.intention).toMatchObject({ kind: 'mark', opponent: opponent!.idx, until });
      expect(gp.intention!.target[0]).toBeCloseTo(
        Math.min(PITCH.length, opponent!.pos[0] + SHAPE_CONFIG.markGoalSide),
        9,
      );
      expect(gp.intention!.target[1]).toBeCloseTo(opponent!.pos[1], 9);
    }
    // A runner who moves takes his marker's target with him; nobody else's target changes.
    const [moved, ...others] = kept;
    const before = others.map(({ gp }) => [...gp.intention!.target]);
    const runner = moved!.opponent!;
    runner.pos = [runner.pos[0] - 2, runner.pos[1] + 3];
    s.elapsed += 0.4;
    updateIntentions(s);
    const target = moved!.gp.intention!.target;
    expect(target[1]).toBeCloseTo(runner.pos[1], 9);
    expect(others.map(({ gp }) => gp.intention!.target)).toEqual(before);
    // He runs toward it, no faster than he can.
    const from = [...moved!.gp.pos];
    advance(s, 1);
    expect(gap(moved!.gp.pos, target)).toBeLessThan(gap(from, target));
    expect(gap(moved!.gp.pos, from)).toBeLessThanOrEqual(speedOf(s, moved!.gp) + 1e-9);
  });

  it('keeper responds to the delivery', () => {
    const { s, scene } = cornerKick();
    const keeper = scene.keeper!;
    expect(keeper.slot).toBe(0);
    expect(keeper.intention).toMatchObject({ kind: 'cover', priority: 'committed' });
    const K = SHAPE_CONFIG.setPiece.keeper;
    /** Where he goes once the delivery heads for `to` (engine frame; his goal line is x = 105). */
    const guard = (to: Point) => {
      s.ball = [to[0], to[1]];
      s.elapsed += 0.2;
      updateIntentions(s);
      expect(keeper.intention?.kind).toBe('cover');
      return keeper.intention!.target;
    };
    const near = guard([102, 31]);
    const far = guard([102, 38]);
    const spot = guard([94, 34]);
    // He shifts across to the delivery's side and steps out to one further from goal, between his
    // posts and inside his goal area.
    expect(near[1]).toBeLessThan(PITCH.width / 2);
    expect(far[1]).toBeGreaterThan(PITCH.width / 2);
    expect(PITCH.length - spot[0]).toBeGreaterThan(PITCH.length - near[0]);
    for (const p of [near, far, spot]) {
      expect(PITCH.length - p[0]).toBeGreaterThanOrEqual(K.line - 1e-9);
      expect(PITCH.length - p[0]).toBeLessThanOrEqual(K.depth + 1e-9);
      expect(Math.abs(p[1] - PITCH.width / 2)).toBeLessThanOrEqual(K.wide + 1e-9);
    }
    // He moves toward where the delivery takes him.
    const from = [...keeper.pos];
    advance(s, 1);
    expect(gap(keeper.pos, spot)).toBeLessThan(gap(from, spot));
    // A delivery that does not move the ball does not move his target.
    s.elapsed += 0.2;
    updateIntentions(s);
    expect(keeper.intention!.target).toEqual(spot);
  });

  it('pushes the possession and press shapes higher than counter', () => {
    const mean = (tactic: Tactic, inPossession: boolean) => {
      const kit = gridKit([tactic, 'balanced'], undefined, DISABLED_RELEASE);
      kit.state.ball = [52.5, 34];
      kit.state.possession = inPossession ? 0 : 1;
      kit.state.owner = [inPossession ? 0 : 1, 9];
      return outfieldMeanX(kit);
    };
    const ins = Object.fromEntries(TACTICS.map((t) => [t, mean(t, true)]));
    expect(ins.press).toBeGreaterThanOrEqual(ins.possession!);
    expect(ins.possession).toBeGreaterThan(ins.balanced!);
    expect(ins.balanced).toBeGreaterThan(ins.counter!);
    const outs = Object.fromEntries(TACTICS.map((t) => [t, mean(t, false)]));
    expect(outs.press).toBeGreaterThan(outs.possession!);
    expect(outs.possession).toBeGreaterThan(outs.balanced!);
    expect(outs.balanced).toBeGreaterThan(outs.counter!);
  });

  it('keeps the MATCH-8 order of the candidate shapes wherever the ball is (T324)', () => {
    const mean = (tactic: Tactic, inPossession: boolean, x: number) => {
      const kit = gridKit([tactic, 'balanced'], undefined, DISABLED_RELEASE);
      kit.state.setup = { ...kit.state.setup, model: MATCH_MODEL_REVISION };
      kit.state.ball = [inPossession ? x : 105 - x, 34];
      kit.state.possession = inPossession ? 0 : 1;
      kit.state.owner = [inPossession ? 0 : 1, 9];
      return outfieldMeanX(kit);
    };
    // The ball in the side's own third, at halfway and in the final third of its attack.
    for (const x of [30, 52.5, 75]) {
      const ins = Object.fromEntries(TACTICS.map((t) => [t, mean(t, true, x)]));
      expect(ins.press, `in possession at ${x}`).toBeGreaterThanOrEqual(ins.possession!);
      expect(ins.possession).toBeGreaterThan(ins.balanced!);
      expect(ins.balanced).toBeGreaterThan(ins.counter!);
      const outs = Object.fromEntries(TACTICS.map((t) => [t, mean(t, false, x)]));
      expect(outs.press, `out of possession at ${x}`).toBeGreaterThan(outs.possession!);
      expect(outs.possession).toBeGreaterThan(outs.balanced!);
      expect(outs.balanced, `out of possession at ${x}`).toBeGreaterThan(outs.counter!);
    }
  });

  it("holds counter's candidate back line no deeper than balanced's floor (T334)", () => {
    const counter = SHAPE_CONFIG.candidate.tactic.counter!;
    const balanced = SHAPE_CONFIG.candidate.tactic.balanced!;
    expect(counter.line[0]).toBe(balanced.line[0]);
    expect(counter.line[1]).toBeLessThan(balanced.line[1]);
    // The opponents on the ball 30 m from counter's goal: its back four stand at the floor or
    // higher on the candidate model, deeper on the pre-feature one.
    const defenders = (candidate: boolean) => {
      const kit = gridKit(['counter', 'balanced'], undefined, DISABLED_RELEASE);
      if (candidate) kit.state.setup = { ...kit.state.setup, model: MATCH_MODEL_REVISION };
      kit.state.ball = [30, 34];
      kit.state.possession = 1;
      kit.state.owner = [1, 9];
      return targets(kit)
        .slice(1, 5)
        .map((p) => p[0]);
    };
    for (const x of defenders(true)) expect(x).toBeGreaterThanOrEqual(counter.line[0]);
    expect(Math.min(...defenders(false))).toBeLessThan(counter.line[0]);
  });

  it("drops counter's candidate block instead of following a ball upfield (T336)", () => {
    expect(SHAPE_CONFIG.candidate.tactic.counter!.upfield).toBe(0);
    // Counter without the ball, the opponents on it in their own half (ball x from counter's goal).
    const outfield = (candidate: boolean, bx: number) => {
      const kit = gridKit(['counter', 'balanced'], undefined, DISABLED_RELEASE);
      if (candidate) kit.state.setup = { ...kit.state.setup, model: MATCH_MODEL_REVISION };
      kit.state.ball = [bx, 34];
      kit.state.possession = 1;
      kit.state.owner = [1, 9];
      return outfieldMeanX(kit);
    };
    // On the candidate model its block holds its height wherever in their half the ball is, and
    // still follows a ball in its own half; the pre-feature shape follows the ball up.
    expect(outfield(true, 90)).toBeCloseTo(outfield(true, 60), 9);
    expect(outfield(true, 30)).toBeLessThan(outfield(true, 52.5));
    expect(outfield(false, 90)).toBeGreaterThan(outfield(false, 60) + 5);
  });

  it('plays the candidate shape of a tactic on the candidate model only', () => {
    for (const tactic of TACTICS) {
      const kit = gridKit([tactic, 'balanced'], undefined, DISABLED_RELEASE);
      expect(tacticShape(kit.state, 0)).toBe(SHAPE_CONFIG.tactic[tactic]);
      kit.state.ball = [52.5, 34];
      kit.state.possession = 0;
      kit.state.owner = [0, 9];
      // A midfielder with no sense of space, so revision 6's spread leaves his target (T542).
      const mf = kit.state.players[0][6]!;
      mf.base[ATTRIBUTES.indexOf('decisions')] = 30;
      mf.base[ATTRIBUTES.indexOf('positioning')] = 30;
      const before = targets(kit)[6]!;
      kit.state.setup = { ...kit.state.setup, model: MATCH_MODEL_REVISION };
      const shape = SHAPE_CONFIG.candidate.tactic[tactic] ?? SHAPE_CONFIG.tactic[tactic];
      expect(tacticShape(kit.state, 0)).toBe(shape);
      // A midfielder with the ball moves by the change of his side's step up (T321).
      expect(targets(kit)[6]![0] - before[0]).toBeCloseTo(
        shape.advance - SHAPE_CONFIG.tactic[tactic].advance,
        9,
      );
    }
  });

  const presserCount = (kit: ReturnType<typeof gridKit>) => {
    const b = kit.state.ball;
    return targets(kit).filter(
      (p, i) => i > 0 && Math.abs(p[0] - (b[0] - 1.2)) < 1e-9 && Math.abs(p[1] - b[1]) < 1e-9,
    ).length;
  };
  const setUp = (tactic: Tactic) => {
    const kit = gridKit([tactic, 'balanced'], undefined, DISABLED_RELEASE);
    const s = kit.state;
    s.possession = 1;
    s.owner = [1, 7];
    // Midfielders (slots 5–7) stand 6 m, 8 m and 30 m from a ball on the halfway line.
    s.ball = [52.5, 34];
    s.players[0][6]!.pos = [46.5, 34];
    s.players[0][5]!.pos = [47, 40];
    s.players[0][7]!.pos = [20, 20];
    return kit;
  };

  it('sends the nearest player within pressing distance at the ball', () => {
    const kit = setUp('balanced');
    expect(presserCount(kit)).toBe(1);
    const [x, y] = attackFrame(0, targetOf(kit.state, 0, 6));
    expect(x).toBeCloseTo(52.5 - 1.2, 9);
    expect(y).toBeCloseTo(34, 9);
  });

  it('adds a second presser only under press', () => {
    expect(presserCount(setUp('press'))).toBe(2);
    expect(presserCount(setUp('possession'))).toBe(1);
    expect(presserCount(setUp('counter'))).toBe(1);
  });

  it('counter-presses for five seconds after a loss', () => {
    const kit = gridKit(['possession', 'balanced'], undefined, DISABLED_RELEASE);
    const s = kit.state;
    s.possession = 1;
    s.owner = [1, 7];
    s.ball = [52.5, 34];
    s.players[0].forEach((gp, i) => i > 0 && (gp.pos = [20, 10]));
    s.players[0][6]!.pos = [37.5, 34];
    s.elapsed = 100;
    expect(presserCount(kit)).toBe(0);
    s.lastLoss = { side: 0, at: 98 };
    expect(presserCount(kit)).toBe(1);
    s.elapsed = 104;
    expect(presserCount(kit)).toBe(0);
    s.lastLoss = { side: 1, at: 100 };
    s.elapsed = 101;
    expect(presserCount(kit)).toBe(0);
  });

  it('moves an inverted full-back inward and a false nine back in possession', () => {
    let seen = 0;
    for (const tactic of TACTICS) {
      const slots = FORMATIONS[tactic].slots;
      slots.forEach((slot, i) => {
        const shift = ROLE_SHIFT[slot.role];
        if (!shift || i === 0) return;
        const kit = gridKit([tactic, 'balanced'], undefined, DISABLED_RELEASE);
        const s = kit.state;
        s.ball = [52.5, 34];
        const spot = SPOTS[tactic][i]!;
        const cfg = SHAPE_CONFIG.tactic[tactic];
        s.possession = 0;
        s.owner = [0, 9];
        const inP = attackFrame(0, targetOf(s, 0, i));
        const centre = (spot[1] < 34 ? 1 : spot[1] > 34 ? -1 : 0) * shift[1];
        expect(inP[0], `${tactic} ${slot.role} x`).toBeCloseTo(
          Math.min(spot[0] + cfg.advance + shift[0], offsideLine(s, 1) - 0.5),
          6,
        );
        expect(inP[1], `${tactic} ${slot.role} y`).toBeCloseTo(spot[1] + centre, 6);
        s.possession = 1;
        s.owner = [1, 9];
        s.ball = [100, 34];
        s.players[1].forEach((gp) => (gp.pos = [2, 66]));
        const outP = attackFrame(0, targetOf(s, 0, i));
        expect(outP[1], `${tactic} ${slot.role} out`).toBeCloseTo(spot[1], 6);
        seen++;
      });
    }
    expect(seen).toBeGreaterThan(3);
    const roles = Object.values(FORMATIONS).flatMap((f) => f.slots.map((slot) => slot.role));
    expect(roles).toContain('invertedFullBack');
    expect(ROLE_SHIFT.falseNine![0]).toBeLessThan(0);
  });

  it('shifts the block toward the ball side', () => {
    const kit = gridKit(['balanced', 'balanced'], undefined, DISABLED_RELEASE);
    const s = kit.state;
    s.possession = 1;
    s.owner = [1, 9];
    s.players[1].forEach((gp) => (gp.pos = [95, 34]));
    const meanY = (by: number) => {
      s.ball = [52.5, by];
      const ys = targets(kit)
        .slice(1)
        .map((p) => p[1]);
      return ys.reduce((a, b) => a + b, 0) / ys.length;
    };
    expect(meanY(60)).toBeGreaterThan(meanY(34) + 1);
    expect(meanY(8)).toBeLessThan(meanY(34) - 1);
  });

  it('starts runs in behind for forwards and overlaps for overlapping full-backs', () => {
    const play = () => {
      const kit = gridKit(['possession', 'balanced'], 'run-seed', DISABLED_RELEASE);
      const s = kit.state;
      const r = random('run-draws');
      s.ball = [62, 34];
      s.possession = 0;
      s.owner = [0, 6];
      const slots = FORMATIONS.possession.slots;
      const log: string[] = [];
      for (let k = 0; k < 2000; k++) {
        s.players[0].forEach((gp) => (gp.run = undefined));
        startRuns(s, 0, r);
        for (const gp of s.players[0]) {
          if (!gp.run) continue;
          const slot = slots[gp.slot]!;
          log.push(`${gp.idx}:${gp.run.kind}`);
          if (gp.run.kind === 'behind')
            expect(
              lineOf(slot.position) === 'FW' ||
                ['attackingMidfielder', 'shadowStriker', 'trequartista'].includes(slot.role),
            ).toBe(true);
          if (gp.run.kind === 'overlap')
            expect(['overlappingFullBack', 'attackingWingBack']).toContain(slot.role);
          expect(gp.run.until - s.elapsed).toBeGreaterThanOrEqual(4);
          expect(gp.run.until - s.elapsed).toBeLessThanOrEqual(6);
        }
      }
      return log;
    };
    const first = play();
    expect(first.some((e) => e.endsWith('behind'))).toBe(true);
    expect(first.some((e) => e.endsWith('overlap'))).toBe(true);
    expect(play()).toEqual(first);
  });

  it("sends a 4-4-2's wide midfielders in behind only while it breaks on the candidate model (T324)", () => {
    const kit = gridKit(['counter', 'balanced'], undefined, DISABLED_RELEASE);
    const s = kit.state;
    s.ball = [40, 34];
    s.possession = 0;
    s.owner = [0, 6];
    const wide = s.players[0].find((gp) => FORMATIONS.counter.slots[gp.slot]?.position === 'LM')!;
    expect(SHAPE_CONFIG.breakRoles).toContain(FORMATIONS.counter.slots[wide.slot]!.role);
    const always = () => 0;
    const plan = (breaking: boolean) => runPlan(s, wide, runContext(s, 0), always, 1, breaking);
    expect(plan(true)).toBeUndefined();
    s.setup = { ...s.setup, model: MATCH_MODEL_REVISION };
    expect(plan(false)).toBeUndefined();
    expect(plan(true)?.kind).toBe('behind');
  });

  it('never moves a player faster than his pace allows', () => {
    const kit = gridKit(['press', 'counter'], undefined, DISABLED_RELEASE);
    const s = kit.state;
    s.ball = [60, 20];
    s.possession = 1;
    s.owner = [1, 9];
    s.elapsed = 1800;
    s.lastLoss = { side: 0, at: 1798 };
    const before = s.players.flatMap((side) => side.map((gp) => [...gp.pos] as Point));
    moveAll(s, 0.5);
    s.players.flat().forEach((gp, i) => {
      if (!gp.onPitch) return;
      const moved = Math.hypot(gp.pos[0] - before[i]![0], gp.pos[1] - before[i]![1]);
      expect(moved).toBeLessThanOrEqual(speedOf(s, gp) * 0.5 + 1e-9);
    });
    const carrier = s.players[1][9]!;
    expect(carrier.pos).toEqual(before[s.players[0].length + 9]);
    const fresh = gridKit(['press', 'counter'], undefined, DISABLED_RELEASE).state;
    expect(speedOf(s, s.players[0][4]!)).toBeLessThan(
      speedOf(fresh, fresh.players[0][4]!) * SHAPE_CONFIG.recoverySpeed,
    );
  });

  it('keeps a sweeper keeper higher than a shot stopper behind a high line', () => {
    const sweeper = TACTICS.find((t) => FORMATIONS[t].slots[0]!.role === 'sweeperKeeper')!;
    const stopper = TACTICS.find((t) => FORMATIONS[t].slots[0]!.role !== 'sweeperKeeper')!;
    const keeperX = (tactic: Tactic) => {
      const kit = gridKit([tactic, 'balanced'], undefined, DISABLED_RELEASE);
      const s = kit.state;
      s.possession = 1;
      s.owner = [1, 9];
      s.ball = [52.5, 34];
      kit.state.players[0].forEach((gp, i) => {
        if (i > 0 && lineOf(FORMATIONS[tactic].slots[i]!.position) === 'DF') gp.pos = [48, 34];
      });
      expect(lineX(s, 0, 'DF')).toBe(48);
      return attackFrame(0, targetOf(s, 0, 0))[0];
    };
    expect(keeperX(sweeper)).toBeGreaterThan(keeperX(stopper));
    expect(keeperX(stopper)).toBeLessThanOrEqual(SHAPE_CONFIG.keeperMax.other);
    expect(keeperX(sweeper)).toBeLessThanOrEqual(SHAPE_CONFIG.keeperMax.sweeperKeeper);
  });
});

describe('the flank beside a back three (T399)', () => {
  it('a wing-back in a back three defends the channel beside his centre-back when the ball is on his flank, on the candidate model only', () => {
    const kit = gridKit(['balanced', 'possession'], 'flank-lab', DISABLED_RELEASE);
    const F = SHAPE_CONFIG.candidate.flank as { follow: number; channel: number };
    const kept = { follow: F.follow, channel: F.channel };
    // Side 0 plays balanced's 3-5-2 (slot 1 the left wing-back, slot 2 the left centre-back) and
    // defends; side 1 has the ball at `ball` (side 0's frame), every opponent far from the back line.
    const place = (candidate: boolean, ball: Point, follow: number, channel: number) => {
      Object.assign(F, { follow, channel });
      try {
        const st = createState(
          candidate ? { ...kit.setup, model: MATCH_MODEL_REVISION } : kit.setup,
        );
        st.possession = 1;
        st.owner = undefined;
        st.ball = [ball[0], ball[1]];
        for (const gp of st.players[1]) gp.pos = [100, 34];
        return [1, 2].map((i) => attackFrame(0, targetOf(st, 0, i)));
      } finally {
        Object.assign(F, kept);
      }
    };
    const flank: Point = [30, 6];
    const [wb0, cb0] = place(true, flank, 0, 0);
    const [wb, cb] = place(true, flank, 0.5, 5);
    // The wing-back closes half the way toward the ball's line, the wide centre-back steps out 5 m.
    expect(wb![1]).toBeCloseTo(wb0![1] + (flank[1] - wb0![1]) * 0.5, 9);
    expect(cb![1]).toBeCloseTo(cb0![1] - 5, 9);
    // The ball in the middle, or the pre-feature model: nothing moves.
    const middle: Point = [30, 34];
    expect(place(true, middle, 0.5, 5)).toEqual(place(true, middle, 0, 0));
    expect(place(false, flank, 0.5, 5)).toEqual(place(false, flank, 0, 0));
  });
});

describe('revision 4 corner numbers (T480, →MATCH-18)', () => {
  const N = SHAPE_CONFIG.setPiece.numbers;
  const [, , third] = MATCH_MODEL_REVISIONS;
  /** A corner for side 0 on `model`, `t` seconds into `period`, at `score`. */
  function corner(model: MatchModelRevision, score: [number, number], period: 1 | 2 = 1, t = 600) {
    const s = createState({ ...setPieceKit.setup, model });
    s.period = period;
    s.t = t;
    s.elapsed = (period - 1) * 2700 + t;
    s.score = score;
    return { s, taker: s.setup.takers[0].corner };
  }
  const parts = (scene: ReturnType<typeof setPieceTargets>) => ({
    rest: scene.rest!.filter(({ gp }) => gp.side === 0),
    outlets: scene.rest!.filter(({ gp }) => gp.side === 1),
  });

  it('revision 4 corners keep 2–3 back near halfway and 1–2 outlets', () => {
    const r = random('corner-numbers');
    const seen = { rest: new Set<number>(), outlets: new Set<number>() };
    for (let n = 0; n < 60; n++) {
      const { s, taker } = corner(MATCH_MODEL_REVISION, [0, 0]);
      const scene = setPieceTargets(s, 0, taker, r);
      const { rest, outlets } = parts(scene);
      seen.rest.add(rest.length);
      seen.outlets.add(outlets.length);
      // The rest defence in its own half near halfway, the outlets just inside theirs.
      for (const { to } of rest) {
        expect(attackFrame(0, to)[0]).toBeGreaterThanOrEqual(N.restCoverX);
        expect(attackFrame(0, to)[0]).toBeLessThan(PITCH.length / 2);
      }
      for (const { to } of outlets) expect(attackFrame(0, to)[0]).toBe(N.outletX);
      expect(N.outletX).toBeGreaterThan(PITCH.length / 2);
      // Each rest defender facing an outlet marks him.
      rest.slice(0, outlets.length).forEach((x, i) => expect(x.opponent).toBe(outlets[i]!.gp));
      // Everyone else goes up or defends the box: nine attackers besides the taker, ten defenders.
      expect(scene.up.length + rest.length).toBe(9);
      expect(scene.marks.length + outlets.length).toBe(10);
    }
    expect([...seen.rest].sort()).toEqual([...N.rest]);
    expect([...seen.outlets].sort()).toEqual([...N.outlets]);
  });

  it('from the 80th minute a side behind sends more up and a side ahead keeps everyone back', () => {
    const r = random('late-corners');
    for (let n = 0; n < 30; n++) {
      // 85′, the corner's side a goal behind: more go up, and the leading defenders all come back.
      const behind = corner(MATCH_MODEL_REVISION, [0, 1], 2, 40 * 60);
      const chase = parts(setPieceTargets(behind.s, 0, behind.taker, r));
      expect(chase.rest.length).toBeGreaterThanOrEqual(N.chasingRest[0]);
      expect(chase.rest.length).toBeLessThanOrEqual(N.chasingRest[1]);
      expect(chase.outlets.length).toBe(N.protectingOutlets[0]);
      // 85′, a goal ahead: more stay back, and the trailing defenders leave two up.
      const ahead = corner(MATCH_MODEL_REVISION, [1, 0], 2, 40 * 60);
      const keep = parts(setPieceTargets(ahead.s, 0, ahead.taker, r));
      expect(keep.rest.length).toBeGreaterThanOrEqual(N.protectingRest[0]);
      expect(keep.rest.length).toBeLessThanOrEqual(N.protectingRest[1]);
      expect(keep.outlets.length).toBe(N.chasingOutlets[0]);
      // Before the 80th minute the score changes nothing.
      const early = corner(MATCH_MODEL_REVISION, [0, 1], 1, 600);
      const usual = parts(setPieceTargets(early.s, 0, early.taker, r));
      expect(usual.rest.length).toBeGreaterThanOrEqual(N.rest[0]);
      expect(usual.outlets.length).toBeGreaterThanOrEqual(N.outlets[0]);
    }
  });

  it('the keeper goes up in added time one goal behind, not two', () => {
    const r = random('keeper-up');
    const keeperUp = (score: [number, number], t: number) => {
      const { s, taker } = corner(MATCH_MODEL_REVISION, score, 2, t);
      const scene = setPieceTargets(s, 0, taker, r);
      return scene.up.find(({ gp }) => gp.slot === 0);
    };
    const up = keeperUp([0, 1], 46 * 60);
    expect(up).toBeDefined();
    expect(attackFrame(0, up!.to)).toEqual([...N.keeperSpot]);
    expect(keeperUp([0, 2], 46 * 60)).toBeUndefined();
    expect(keeperUp([0, 1], 44 * 60)).toBeUndefined();
    expect(keeperUp([0, 0], 46 * 60)).toBeUndefined();
  });

  it("revision 3 corners keep today's scene", () => {
    const { s, taker } = corner(third, [0, 0]);
    let draws = 0;
    const scene = setPieceTargets(s, 0, taker, () => (draws++, 0.5));
    expect(draws).toBe(0);
    expect(scene).toEqual(setPieceTargets(s, 0, taker));
    expect(scene.rest).toBeUndefined();
    expect(scene.up).toHaveLength(SHAPE_CONFIG.setPiece.box.length + 1);
  });
});

describe('revision 6 spread and screen (T542, →MATCH-17, MATCH-32)', () => {
  const [, , , , fifth, sixth] = MATCH_MODEL_REVISIONS;
  const sense = (gp: GridPlayer, v: number) => {
    gp.player.attrs.decisions = v;
    gp.player.attrs.positioning = v;
    gp.base.fill(v);
  };

  it('revision 6: a sharper supporter keeps more space from a teammate', () => {
    const gap = (model: MatchModelRevision, v: number) => {
      const kit = gridKit(['balanced', 'balanced'], undefined, DISABLED_RELEASE);
      const s = kit.state;
      s.setup = { ...s.setup, model };
      s.possession = 0;
      s.owner = [0, 9];
      const me = s.players[0][7]!;
      me.intention = undefined;
      me.run = undefined;
      sense(me, v);
      const place = targetOf(s, 0, 7);
      // A teammate standing right on his target.
      const mate = s.players[0][6]!;
      mate.pos = [place[0] + 1, place[1]];
      const t = targetOf(s, 0, 7);
      return Math.hypot(t[0] - mate.pos[0], t[1] - mate.pos[1]);
    };
    expect(gap(sixth, 90)).toBeGreaterThan(gap(sixth, 50) + 1);
    expect(gap(sixth, 30)).toBeCloseTo(gap(fifth, 90), 9);
  });

  it('revision 6: a defender drops onto the ball–goal line when the ball is central in front of his box', () => {
    const offLine = (model: MatchModelRevision, ballX: number) => {
      const kit = gridKit(['balanced', 'balanced'], undefined, DISABLED_RELEASE);
      const s = kit.state;
      s.setup = { ...s.setup, model };
      // Side 0 attacks; side 1's left centre-back (slot 2) defends the goal at x = 105 of side 0's
      // frame.
      s.possession = 0;
      s.owner = [0, 9];
      s.ball = toEngine(0, [ballX, 34]);
      s.players[0][9]!.pos = [...s.ball];
      const d = s.players[1][2]!;
      d.intention = undefined;
      d.run = undefined;
      sense(d, 90);
      const t = attackFrame(0, targetOf(s, 1, 2));
      return Math.abs(t[1] - 34);
    };
    expect(offLine(fifth, 80)).toBeGreaterThan(1);
    expect(offLine(sixth, 80)).toBeLessThan(offLine(fifth, 80));
    // Far from goal the shape holds.
    expect(offLine(sixth, 50)).toBeCloseTo(offLine(fifth, 50), 9);
  });
});

describe('revision 7 keeper off his line (T548, →MATCH-35)', () => {
  const [, , , , , sixth, seventh] = MATCH_MODEL_REVISIONS;
  const K = SHAPE_CONFIG.candidate.keeperOut;
  /** Side 1's keeper's target in side 0's frame with side 0's striker carrying it at `ball`. */
  const keeper = (model: MatchModelRevision, ball: Point, owner = true) => {
    const kit = gridKit(['balanced', 'balanced'], undefined, DISABLED_RELEASE);
    const s = kit.state;
    s.setup = { ...s.setup, model };
    s.possession = 0;
    s.owner = owner ? [0, 9] : undefined;
    s.ball = toEngine(0, ball);
    s.players[0][9]!.pos = [...s.ball];
    return attackFrame(0, targetOf(s, 1, 0));
  };

  it('revision 7: the keeper comes off his line toward a carrier in his box, narrowing the angle', () => {
    // 15 m out, straight in front: the keeper stands `share` of the way out, on the line to the ball.
    const centre = keeper(seventh, [90, 34]);
    expect(PITCH.length - centre[0]).toBeCloseTo(15 * K.share, 9);
    expect(centre[1]).toBeCloseTo(34, 9);
    // From an angle he stays on the line from his goal's middle to the ball, never beyond `most`.
    const angled = keeper(seventh, [92, 22]);
    const out = Math.hypot(PITCH.length - angled[0], angled[1] - 34);
    expect(out).toBeLessThanOrEqual(K.most + 1e-9);
    expect((34 - angled[1]) / (PITCH.length - angled[0])).toBeCloseTo((34 - 22) / 13, 9);
    // On revision 6, outside his box or with the ball loose he keeps his place.
    for (const held of [
      keeper(sixth, [90, 34]),
      keeper(seventh, [80, 34]),
      keeper(seventh, [90, 34], false),
    ])
      expect(PITCH.length - held[0]).toBeLessThan(5);
  });
});
