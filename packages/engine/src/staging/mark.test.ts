import { describe, expect, it } from 'vitest';
import { STAGING_CONFIG } from './config';
import { ownGoal, toAttack } from './pitch';
import { nominalSpot } from './places';
import { demoFixture } from './squads.testkit';
import type { TeamId, Vec } from './types';
import { add, dist, lerp, norm, scale, sub } from './vec';
import { assignMarks, markSpot } from './mark';
import { shapeRef } from './mind';
import { scriptOf } from './script.testkit';
import {
  createStage,
  defaultTarget,
  isPressRole,
  positionsOf,
  step,
  type StageState,
} from './world';

const fixture = demoFixture();
const MARK = STAGING_CONFIG.shape.mark;
const UNMARK = STAGING_CONFIG.shape.unmark;

/** A stage with `team` in possession (as every remembered input says) of a loose ball at `ball`. */
const stageWith = (team: TeamId, ball: Vec): StageState => {
  const actor = team * 11 + 9;
  const state = createStage(
    scriptOf(fixture, [{ kind: 'kickOff', actor, receiver: team * 11 + 6, to: ball, team }]),
  );
  state.ball.mode = 'loose';
  state.ball.owner = -1;
  state.ball.pos = [ball[0], ball[1]];
  return state;
};
const place = (state: StageState, index: number, pos: Vec): void => {
  state.bodies[index].pos = [pos[0], pos[1]];
};
/** Every outfield player of `team` far away near world x = `x`. */
const sendAway = (state: StageState, team: TeamId, x: number): void => {
  for (let slot = 1; slot <= 10; slot++) place(state, team * 11 + slot, [x, 5 + slot * 5]);
};

describe('marking (T817)', () => {
  it('markers are matched one to one, nearest first', () => {
    const state = stageWith(0, [60, 34]);
    sendAway(state, 0, 100);
    const zones = new Map<number, Vec>([
      [16, [30, 30]],
      [17, [30, 36]],
    ]);
    const zoneOf = (i: number): Vec => zones.get(i) ?? [0, 0];
    const canMark = (i: number): boolean => zones.has(i);
    // Both zones lie within the radius of attacker 9; 16's is nearer. Attacker 8 is 17's alone.
    place(state, 9, [30, 31]);
    place(state, 8, [30, 44]);
    expect(dist(zoneOf(17), [30, 31])).toBeLessThanOrEqual(MARK.radius);
    expect(dist(zoneOf(16), [30, 44])).toBeGreaterThan(MARK.radius);
    let marks = assignMarks(state, positionsOf(state), zoneOf, canMark);
    expect([...marks]).toEqual([
      [16, 9],
      [17, 8],
    ]);
    expect(state.marks).toBe(marks);
    // With 8 gone, 17 finds nobody: 9 stays 16's.
    place(state, 8, [100, 60]);
    marks = assignMarks(state, positionsOf(state), zoneOf, canMark);
    expect([...marks]).toEqual([[16, 9]]);
    // A fresh assignment does the same.
    state.marks = new Map();
    marks = assignMarks(state, positionsOf(state), zoneOf, canMark);
    expect([...marks]).toEqual([[16, 9]]);
  });

  it('a marker keeps his man up to shape.mark.keep beyond the radius and loses him past it', () => {
    const state = stageWith(0, [60, 34]);
    sendAway(state, 0, 100);
    const zone: Vec = [30, 30];
    const zoneOf = (): Vec => zone;
    const canMark = (i: number): boolean => i === 16;
    // Not taken beyond the radius.
    place(state, 9, [30, 30 + MARK.radius + 0.5]);
    expect(assignMarks(state, positionsOf(state), zoneOf, canMark).size).toBe(0);
    // Taken inside it, kept as he moves up to `keep` beyond it.
    place(state, 9, [30, 30 + MARK.radius - 0.5]);
    expect(assignMarks(state, positionsOf(state), zoneOf, canMark).get(16)).toBe(9);
    place(state, 9, [30, 30 + MARK.radius + MARK.keep - 0.1]);
    expect(assignMarks(state, positionsOf(state), zoneOf, canMark).get(16)).toBe(9);
    // Lost past it.
    place(state, 9, [30, 30 + MARK.radius + MARK.keep + 0.1]);
    expect(assignMarks(state, positionsOf(state), zoneOf, canMark).size).toBe(0);
  });

  it('the presser, the cover and players under an order or cue mark nobody', () => {
    // Team 1 has the ball in team 0's half; team 0 (possession) presses everywhere.
    const state = stageWith(1, [40, 34]);
    const ref = shapeRef(state);
    // Every team-0 outfielder has a team-1 outfielder standing a metre from his zone place.
    for (let slot = 1; slot <= 10; slot++) {
      const zone = nominalSpot({ fixture, ball: ref, team: 1, phase: 'buildUp' }, slot);
      place(state, 11 + slot, [zone[0] + 1, zone[1]]);
    }
    const snapshot = positionsOf(state);
    const roles = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((i) => isPressRole(state, 0, i, snapshot));
    expect(roles).toHaveLength(2);
    const busy = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((i) => !roles.includes(i)).slice(0, 2);
    state.orders.set(busy[0], { target: [20, 20], pace: 'jog' });
    state.cues.set(busy[1], { target: [20, 40], pace: 'jog' });
    step(state);
    for (const i of [...roles, ...busy]) expect(state.marks.has(i), String(i)).toBe(false);
    // The others do mark.
    expect(state.marks.size).toBeGreaterThan(0);
    // While the ball is dead nobody does.
    state.live = false;
    step(state);
    expect(state.marks.size).toBe(0);
  });

  it('nobody marks the man on the ball', () => {
    const state = stageWith(0, [30, 31]);
    sendAway(state, 0, 100);
    const zoneOf = (): Vec => [30, 30];
    const canMark = (i: number): boolean => i === 16;
    place(state, 9, [30, 31]);
    state.ball.mode = 'held';
    state.ball.owner = 9;
    expect(assignMarks(state, positionsOf(state), zoneOf, canMark).size).toBe(0);
    state.ball.owner = -1;
    expect(assignMarks(state, positionsOf(state), zoneOf, canMark).get(16)).toBe(9);
  });

  it('a midfield marker stands goal-side of his man by the blend and a back-line marker only shifts across', () => {
    const team: TeamId = 1;
    const goal = ownGoal(team);
    const zone: Vec = [70, 30];
    const man: Vec = [66, 36];
    const m = add(man, scale(norm(sub(goal, man)), MARK.goalSide));
    expect(dist(m, goal)).toBeLessThan(dist(man, goal));
    const mf = markSpot(team, 'MF', zone, man);
    const want = lerp(zone, m, MARK.blend.MF);
    expect(mf[0]).toBeCloseTo(want[0], 10);
    expect(mf[1]).toBeCloseTo(want[1], 10);
    const fw = markSpot(team, 'FW', zone, man);
    expect(dist(fw, lerp(zone, m, MARK.blend.FW))).toBeLessThan(1e-9);
    const df = markSpot(team, 'DF', zone, man);
    expect(toAttack(team, df)[0]).toBe(toAttack(team, zone)[0]);
    expect(df[1]).toBeCloseTo(zone[1] + (m[1] - zone[1]) * MARK.blend.DF, 10);
    // In defaultTarget: a marked defender's target is his spot from his zone place.
    const state = stageWith(0, [40, 34]);
    sendAway(state, 0, 100);
    const snapshot0 = positionsOf(state);
    const base = nominalSpot(
      { fixture, ball: state.ball.pos, team: 0, phase: 'buildUp', positions: snapshot0 },
      17,
    );
    place(state, 8, [base[0] - 3, base[1] + 2]);
    state.marks = new Map([[17, 8]]);
    const snapshot = positionsOf(state);
    const t = defaultTarget(state, 17, snapshot).target;
    expect(dist(t, markSpot(1, 'MF', base, snapshot[8]))).toBeLessThan(1e-9);
  });

  it('a free attacker steps across from a marker inside shape.unmark.radius and keeps his depth', () => {
    const state = stageWith(0, [40, 34]);
    sendAway(state, 1, 104);
    const cm = 6;
    const base0 = nominalSpot(
      { fixture, ball: state.ball.pos, team: 0, phase: 'buildUp', positions: positionsOf(state) },
      cm,
    );
    place(state, 17, [base0[0] + 0.5, base0[1] + 1.5]);
    const snapshot = positionsOf(state);
    const base = nominalSpot(
      { fixture, ball: state.ball.pos, team: 0, phase: 'buildUp', positions: snapshot },
      cm,
    );
    const o = snapshot[17];
    const d = dist(o, base);
    expect(d).toBeLessThan(UNMARK.radius);
    const t = defaultTarget(state, cm, snapshot).target;
    expect(toAttack(0, t)[0]).toBe(toAttack(0, base)[0]);
    expect(Math.abs(t[1] - o[1])).toBeCloseTo(
      Math.abs(base[1] - o[1]) + UNMARK.step * (1 - d / UNMARK.radius),
      10,
    );
    // Away from him: he stood above, so the attacker goes below.
    expect(t[1]).toBeLessThan(base[1]);
    // Beyond the radius he keeps his place.
    place(state, 17, [base0[0], base0[1] + UNMARK.radius + 1]);
    const far = positionsOf(state);
    const baseFar = nominalSpot(
      { fixture, ball: state.ball.pos, team: 0, phase: 'buildUp', positions: far },
      cm,
    );
    expect(defaultTarget(state, cm, far).target).toEqual(baseFar);
  });
});
