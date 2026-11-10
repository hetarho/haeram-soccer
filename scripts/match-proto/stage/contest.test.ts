import { describe, expect, it } from 'vitest';
import { PROTO_CONFIG } from '../core/config.ts';
import { demoFixture } from '../core/squads.ts';
import type { Vec } from '../core/types.ts';
import { dist, lerp } from '../core/vec.ts';
import { cueNext, jockeyPoint, planCut, resolveCut, shadowPoint } from './contest.ts';
import { paceSpeed, timeToReach } from './motion.ts';
import { beats, scriptOf } from './script.testkit.ts';
import { createStage, setPossession, type StageState } from './world.ts';

const fixture = demoFixture();
const STAGE = PROTO_CONFIG.stage;
const FROM: Vec = [40, 30];
const TO: Vec = [70, 30];
const FLIGHT = 2;
const RANGE = [STAGE.cutMin, STAGE.cutMax] as const;

/** A fresh stage with every away player parked far from the pass lane at y = 30. */
const parked = (): StageState => {
  const state = createStage(
    scriptOf(fixture, [{ kind: 'kickOff', actor: 9, receiver: 5, to: [45, 30] }]),
  );
  for (let i = 11; i < 22; i++) place(state, i, [10 + i * 4, 66]);
  return state;
};
const place = (state: StageState, index: number, pos: Vec): void => {
  state.bodies[index].pos = [pos[0], pos[1]];
  state.bodies[index].vel = [0, 0];
};

describe('contests', () => {
  it('planCut clamps the point to its range and reports the margin', () => {
    const state = parked();
    place(state, 17, [43, 34]);
    const early = planCut(state, 17, FROM, TO, FLIGHT, RANGE);
    expect(early.param).toBe(STAGE.cutMin);
    expect(early.point).toEqual(lerp(FROM, TO, STAGE.cutMin));
    expect(early.time).toBeCloseTo(STAGE.cutMin * FLIGHT, 9);
    const sprint = paceSpeed('sprint', fixture.players[17]);
    expect(early.margin).toBeCloseTo(
      timeToReach(state.bodies[17], early.point, sprint) - early.time,
      9,
    );
    place(state, 17, [69.5, 36]);
    const late = planCut(state, 17, FROM, TO, FLIGHT, RANGE);
    expect(late.param).toBe(STAGE.cutMax);
    expect(late.point).toEqual(lerp(FROM, TO, STAGE.cutMax));
    place(state, 17, [58, 31]);
    const mid = planCut(state, 17, FROM, TO, FLIGHT, RANGE, STAGE.lunge);
    expect(mid.param).toBeCloseTo(0.6, 9);
    expect(mid.margin).toBeCloseTo(
      timeToReach(state.bodies[17], mid.point, sprint + STAGE.lunge) - mid.time,
      9,
    );
  });

  it('resolveCut keeps a scripted opponent who makes it', () => {
    const state = parked();
    place(state, 17, [58, 31]);
    const r = resolveCut(state, 17, FROM, TO, FLIGHT);
    expect(r.plan.opponent).toBe(17);
    expect(r.recast).toBe(false);
    expect(r.stretch).toBe(false);
    expect(r.flight).toBe(FLIGHT);
    expect(r.plan.margin).toBeLessThanOrEqual(STAGE.cutSlack);
  });

  it('resolveCut recasts to a nearer defender', () => {
    const state = parked();
    place(state, 17, [20, 5]);
    place(state, 16, [60, 32]);
    const r = resolveCut(state, 17, FROM, TO, FLIGHT);
    expect(r.plan.opponent).toBe(16);
    expect(r.recast).toBe(true);
    expect(r.stretch).toBe(false);
    expect(r.flight).toBe(FLIGHT);
    expect(r.plan.margin).toBeLessThanOrEqual(STAGE.cutSlack);
  });

  it('resolveCut falls back to the lunge and lengthens the flight, never below ball.minSpeed', () => {
    const state = parked();
    place(state, 17, [58, 46]);
    const r = resolveCut(state, 17, FROM, TO, FLIGHT);
    expect(r.stretch).toBe(true);
    expect(r.plan.opponent).toBe(17);
    expect(r.recast).toBe(false);
    expect(r.flight).toBeGreaterThan(FLIGHT);
    expect(r.plan.time).toBeCloseTo(r.plan.param * r.flight, 9);
    expect(r.plan.margin).toBeCloseTo(STAGE.cutSlack, 9);
    // Nobody near the lane: the ball slows only to the slowest kick.
    const far = parked();
    place(far, 17, [55, 60]);
    const slow = resolveCut(far, 17, FROM, TO, FLIGHT);
    expect(slow.stretch).toBe(true);
    expect(dist(FROM, TO) / slow.flight).toBeGreaterThanOrEqual(PROTO_CONFIG.ball.minSpeed - 1e-9);
    expect(slow.flight).toBeCloseTo(dist(FROM, TO) / PROTO_CONFIG.ball.minSpeed, 9);
    expect(slow.plan.margin).toBeGreaterThan(STAGE.cutSlack);
  });

  it("cueNext cues the next beat's opponent and tightens the press for a pressed beat", () => {
    const state = parked();
    const [, b1, b2] = beats(fixture, [
      { kind: 'kickOff', actor: 9, receiver: 5, to: [45, 30] },
      { kind: 'pass', actor: 5, receiver: 6, to: [50, 24] },
      {
        kind: 'pass',
        actor: 6,
        receiver: 9,
        to: [62, 32],
        outcome: 'intercepted',
        opponent: 17,
        reason: 'pressed',
      },
    ]);
    const at: Vec = [50, 24];
    setPossession(state, b1);
    expect(state.tight).toBe(false);
    cueNext(state, { beat: b1, next: b2 }, at);
    expect(state.tight).toBe(true);
    expect(state.cues.get(17)?.target).toEqual(shadowPoint(1, at, [62, 32]));
    state.orders.clear();
    expect(state.cues.has(17)).toBe(true);
    setPossession(state, b2);
    expect(state.cues.size).toBe(0);
    // A tackle is jockeyed from goal-side of where the ball will be; another side's beat cues nobody.
    cueNext(state, { beat: b1, next: { ...b2, outcome: 'tackled' } }, at);
    expect(state.cues.get(17)?.target).toEqual(jockeyPoint(1, at));
    state.cues.clear();
    cueNext(state, { beat: b1, next: { ...b2, team: 1 } }, at);
    expect(state.cues.size).toBe(0);
  });
});
