import { describe, expect, it } from 'vitest';
import { PROTO_CONFIG } from '../core/config.ts';
import { CENTRE } from '../core/pitch.ts';
import { demoFixture } from '../core/squads.ts';
import type { PlayerSpec, Vec } from '../core/types.ts';
import { lineOf } from '../core/types.ts';
import {
  followPlace,
  freeSpeed,
  placeLag,
  reactionDelay,
  remember,
  seenBy,
  type Mind,
} from './mind.ts';
import { scriptOf } from './script.testkit.ts';
import { createStage } from './world.ts';

const fixture = demoFixture();
const OWN = PROTO_CONFIG.motion.own;
const TICK = PROTO_CONFIG.tick;

const withDecisions = (spec: PlayerSpec, decisions: number): PlayerSpec => ({
  ...spec,
  attrs: { ...spec.attrs, decisions },
});
const cm = fixture.players.find((p) => p.position === 'CM');
if (!cm) throw new Error('no CM in the demo fixture');

describe('a free player’s mind', () => {
  it('reactionDelay grows with the distance to the ball and falls with decisions', () => {
    const mid = withDecisions(cm, 50);
    expect(reactionDelay(mid, 20)).toBeCloseTo(
      OWN.delay.base + OWN.delay.perIq * 0.5 + OWN.delay.perMetre * 20,
      12,
    );
    expect(reactionDelay(mid, 30)).toBeGreaterThan(reactionDelay(mid, 10));
    expect(reactionDelay(withDecisions(cm, 90), 20)).toBeLessThan(reactionDelay(mid, 20));
    // The distance counts up to own.farCap.
    expect(reactionDelay(mid, OWN.farCap + 30)).toBe(reactionDelay(mid, OWN.farCap));
    expect(reactionDelay(mid, OWN.farCap - 1)).toBeLessThan(reactionDelay(mid, OWN.farCap));
  });

  it('the back line shares one delay and one lag', () => {
    const line = fixture.players.filter((p) => lineOf(p.position) === 'DF');
    expect(line.map((p) => p.position).sort()).toEqual(
      ['CB', 'CB', 'CB', 'CB', 'LB', 'LB', 'RB', 'RB'].sort(),
    );
    for (const p of line) {
      for (const [decisions, metres] of [
        [20, 0],
        [95, 45],
        [60, 80],
      ] as const) {
        const spec = withDecisions(p, decisions);
        expect(reactionDelay(spec, metres)).toBe(OWN.delay.line);
        expect(placeLag(spec, metres)).toBe(OWN.lag.line);
      }
    }
  });

  it('placeLag grows with the distance to the ball', () => {
    expect(placeLag(cm, 0)).toBeCloseTo(OWN.lag.base, 12);
    expect(placeLag(cm, 30)).toBeGreaterThan(placeLag(cm, 10));
    expect(placeLag(cm, 25)).toBeCloseTo(OWN.lag.base + OWN.lag.perMetre * 25, 12);
    expect(placeLag(cm, OWN.farCap + 20)).toBe(placeLag(cm, OWN.farCap));
  });

  it('seenBy returns the inputs of his delay ago and the oldest kept when the memory is shorter', () => {
    const state = createStage(
      scriptOf(fixture, [{ kind: 'kickOff', actor: 9, receiver: 5, to: [45, 30] }]),
    );
    // createStage keeps the first entry.
    expect(state.seen).toHaveLength(1);
    expect(state.seen[0].ref).toEqual(state.ball.pos);
    const first = state.seen[0];
    const metres = 20;
    const back = Math.round(reactionDelay(fixture.players[cm.index], metres) / TICK);
    expect(back).toBeGreaterThan(0);
    // Fewer entries than his delay: the oldest.
    expect(seenBy(state, cm.index, metres)).toBe(first);
    // Enough entries: the one `back` ticks before the newest.
    const keep = Math.round(OWN.memory / TICK) + 1;
    const n = keep + 5;
    for (let k = 1; k <= n; k++) {
      state.ball.pos = [CENTRE[0] + k, CENTRE[1]];
      remember(state);
    }
    expect(state.seen).toHaveLength(keep);
    const newest = state.seen[state.seen.length - 1];
    expect(newest.ref).toEqual([CENTRE[0] + n, CENTRE[1]]);
    expect(seenBy(state, cm.index, metres).ref).toEqual([CENTRE[0] + n - back, CENTRE[1]]);
    // The back line's shared delay.
    const cb = fixture.players.find((p) => p.position === 'CB');
    if (!cb) throw new Error('no CB');
    const lineBack = Math.round(OWN.delay.line / TICK);
    expect(seenBy(state, cb.index, 3).ref).toEqual([CENTRE[0] + n - lineBack, CENTRE[1]]);
  });

  it('followPlace closes about 63% of the gap in one lag', () => {
    const mind: Mind = { place: [0, 0] };
    const want: Vec = [10, 0];
    for (let i = 0; i < 10; i++) followPlace(mind, want, 1);
    const left = want[0] - mind.place[0];
    expect(left).toBeGreaterThanOrEqual(3.4);
    expect(left).toBeLessThanOrEqual(4.0);
    expect(mind.place[1]).toBe(0);
  });

  /** Seconds from the first input showing a turnover of `counter` kind to the first at which seenBy(...).team is the new side, for each distance. */
  const believedAt = (counter: boolean, metres: readonly number[]): number[] => {
    const state = createStage(
      scriptOf(fixture, [{ kind: 'kickOff', actor: 9, receiver: 5, to: [45, 30] }]),
    );
    const tick = (): void => {
      state.tickCount += 1;
      state.t = Math.round(state.tickCount * TICK * 1000) / 1000;
      remember(state);
    };
    for (let k = 0; k < 40; k++) tick();
    state.team = 1;
    state.phase = counter ? 'counter' : 'buildUp';
    state.turn = { at: state.t, counter };
    const at = metres.map(() => NaN);
    for (let k = 0; k < 60; k++) {
      tick();
      metres.forEach((m, j) => {
        if (Number.isNaN(at[j]) && seenBy(state, cm.index, m).team === 1)
          // The new side is first remembered on the tick after the change.
          at[j] = state.t - (state.turn?.at ?? 0) - TICK;
      });
    }
    return at;
  };

  it('a far player believes a settled turnover later than a near one', () => {
    // One midfielder read at two distances: two midfielders of equal `decisions`.
    const [near, far] = believedAt(false, [5, 40]);
    const want = (OWN.delay.perMetre + PROTO_CONFIG.motion.turn.delayPerMetre) * 35;
    expect(Math.abs(far - near - want)).toBeLessThanOrEqual(2 * TICK + 1e-9);
    expect(far).toBeGreaterThan(near);
  });

  it('after a counter both believe it within their reaction delay', () => {
    const [near, far] = believedAt(true, [5, 40]);
    expect(near).toBeLessThanOrEqual(reactionDelay(cm, 5) + TICK + 1e-9);
    expect(far).toBeLessThanOrEqual(reactionDelay(cm, 40) + TICK + 1e-9);
  });

  it('the place follows slowly after a settled turnover and fast after a counter', () => {
    const TURN = PROTO_CONFIG.motion.turn;
    for (const metres of [0, 10, 30, 60]) {
      expect(placeLag(cm, metres, { counter: false })).toBeGreaterThanOrEqual(TURN.lag.settled);
      expect(placeLag(cm, metres, { counter: true })).toBeLessThanOrEqual(TURN.lag.counter);
      expect(placeLag(cm, metres)).toBe(
        OWN.lag.base + OWN.lag.perMetre * Math.min(metres, OWN.farCap),
      );
      // A man marking stays with him whatever the window says.
      expect(placeLag(cm, metres, { counter: false }, true)).toBeLessThanOrEqual(
        PROTO_CONFIG.shape.mark.lag,
      );
    }
    const cb = fixture.players.find((p) => p.position === 'CB');
    if (!cb) throw new Error('no CB');
    expect(placeLag(cb, 20, { counter: false })).toBe(OWN.lag.line);
    expect(placeLag(cb, 20, { counter: true })).toBe(OWN.lag.line);
  });

  it('freeSpeed runs in a counter', () => {
    const TURN = PROTO_CONFIG.motion.turn;
    const counter = { counter: true };
    for (const ballMetres of [0, 20, 60]) {
      expect(freeSpeed(TURN.runBeyond + 0.5, ballMetres, 6, counter)).toBe(6);
      expect(freeSpeed(TURN.sprintBeyond + 5, ballMetres, 8.2, counter)).toBe(8.2);
      // A nearer place is reached as in T816.
      expect(freeSpeed(TURN.runBeyond - 0.5, ballMetres, 6, counter)).toBe(
        freeSpeed(TURN.runBeyond - 0.5, ballMetres, 6),
      );
      // After a settled turnover and outside the window, T816's values.
      expect(freeSpeed(10, ballMetres, 6, { counter: false })).toBe(freeSpeed(10, ballMetres, 6));
    }
    expect(freeSpeed(10, 40, 6)).toBeLessThan(6);
  });

  it('freeSpeed stands inside own.hold, walks a small correction, runs a long one and is brisker near the ball', () => {
    expect(freeSpeed(0.5, 10, 6)).toBe(0);
    expect(freeSpeed(OWN.hold, 10, 6)).toBe(0);
    expect(freeSpeed(3, 40, 6)).toBeCloseTo(3 / OWN.arrive.far, 12);
    expect(freeSpeed(3, 0, 6)).toBeCloseTo(3 / OWN.arrive.near, 12);
    expect(freeSpeed(30, 20, 6)).toBe(6);
    expect(freeSpeed(1, 40, 6)).toBe(OWN.minSpeed);
    expect(freeSpeed(3, 0, 6)).toBeGreaterThan(freeSpeed(3, 20, 6));
  });
});
