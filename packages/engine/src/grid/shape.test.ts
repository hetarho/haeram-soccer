import { describe, expect, it } from 'vitest';
import { MATCH_MODEL_REVISION } from '../../../contracts/src/match-model';
import type { Tactic } from '../../../contracts/src/types';
import { FORMATIONS, lineOf } from '../player';
import { random } from '../primitives';
import { attackFrame, inBox, toEngine, type Point } from './pitch';
import {
  lineX,
  moveAll,
  offsideLine,
  runContext,
  runPlan,
  setPieceShape,
  SHAPE_CONFIG,
  speedOf,
  startRuns,
  tacticShape,
  targetOf,
} from './shape';
import { onPitch } from './state';
import { ROLE_SHIFT, SPOTS } from './spots';
import { gridKit } from './testkit';

const TACTICS: Tactic[] = ['balanced', 'possession', 'counter', 'press'];
/** Side 0's targets in its own attack frame, which is the engine frame. */
const targets = (kit: ReturnType<typeof gridKit>, side: 0 | 1 = 0) =>
  kit.state.players[side]
    .slice(0, 11)
    .map((gp) => attackFrame(side, targetOf(kit.state, side, gp.idx)));
const outfieldMeanX = (kit: ReturnType<typeof gridKit>) => {
  const xs = targets(kit).slice(1);
  return xs.reduce((sum, p) => sum + p[0], 0) / xs.length;
};

describe('grid shape and movement', () => {
  it("holds each tactic's defensive line inside its bounds, dropping goal-side of a ball played behind it", () => {
    for (const tactic of TACTICS) {
      const kit = gridKit([tactic, 'balanced']);
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
    const kit = gridKit();
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

  it('pushes the possession and press shapes higher than counter', () => {
    const mean = (tactic: Tactic, inPossession: boolean) => {
      const kit = gridKit([tactic, 'balanced']);
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
      const kit = gridKit([tactic, 'balanced']);
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
      const kit = gridKit(['counter', 'balanced']);
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
      const kit = gridKit(['counter', 'balanced']);
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
      const kit = gridKit([tactic, 'balanced']);
      expect(tacticShape(kit.state, 0)).toBe(SHAPE_CONFIG.tactic[tactic]);
      kit.state.ball = [52.5, 34];
      kit.state.possession = 0;
      kit.state.owner = [0, 9];
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
    const kit = gridKit([tactic, 'balanced']);
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
    const kit = gridKit(['possession', 'balanced']);
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
        const kit = gridKit([tactic, 'balanced']);
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
    const kit = gridKit(['balanced', 'balanced']);
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
      const kit = gridKit(['possession', 'balanced'], 'run-seed');
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
    const kit = gridKit(['counter', 'balanced']);
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
    const kit = gridKit(['press', 'counter']);
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
    const fresh = gridKit(['press', 'counter']).state;
    expect(speedOf(s, s.players[0][4]!)).toBeLessThan(
      speedOf(fresh, fresh.players[0][4]!) * SHAPE_CONFIG.recoverySpeed,
    );
  });

  it('keeps a sweeper keeper higher than a shot stopper behind a high line', () => {
    const sweeper = TACTICS.find((t) => FORMATIONS[t].slots[0]!.role === 'sweeperKeeper')!;
    const stopper = TACTICS.find((t) => FORMATIONS[t].slots[0]!.role !== 'sweeperKeeper')!;
    const keeperX = (tactic: Tactic) => {
      const kit = gridKit([tactic, 'balanced']);
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
