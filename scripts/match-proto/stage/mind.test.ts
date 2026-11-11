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
    for (let k = 1; k <= 20; k++) {
      state.ball.pos = [CENTRE[0] + k, CENTRE[1]];
      remember(state);
    }
    const keep = Math.round(OWN.memory / TICK) + 1;
    expect(state.seen).toHaveLength(keep);
    const newest = state.seen[state.seen.length - 1];
    expect(newest.ref).toEqual([CENTRE[0] + 20, CENTRE[1]]);
    expect(seenBy(state, cm.index, metres).ref).toEqual([CENTRE[0] + 20 - back, CENTRE[1]]);
    // The back line's shared delay.
    const cb = fixture.players.find((p) => p.position === 'CB');
    if (!cb) throw new Error('no CB');
    const lineBack = Math.round(OWN.delay.line / TICK);
    expect(seenBy(state, cb.index, 3).ref).toEqual([CENTRE[0] + 20 - lineBack, CENTRE[1]]);
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
