import { describe, expect, it } from 'vitest';
import { STAGING_CONFIG } from './config';
import { CENTRE, HALFWAY } from './pitch';
import { demoFixture } from './squads.testkit';
import { dist } from './vec';
import { handlerKey } from './perform';
import { performScript } from './script.testkit';
import { posOf, type BeatSpec, scriptOf as buildScript } from './script.testkit';

const fixture = demoFixture();
const MOTION = STAGING_CONFIG.motion;
const TICK = STAGING_CONFIG.tick;

/** A hand-written home script: each beat starts where the previous one aimed. */
const scriptOf = (specs: readonly BeatSpec[]) => buildScript(fixture, specs);

const HAND = scriptOf([
  { kind: 'kickOff', actor: 9, receiver: 5, to: [45, 30] },
  { kind: 'pass', actor: 5, receiver: 2, to: [26, 22] },
  { kind: 'carry', actor: 2, to: [34, 22] },
  { kind: 'pass', actor: 2, receiver: 1, to: [40, 26] },
  { kind: 'pass', actor: 1, receiver: 10, to: [62, 60], loft: true },
]);
const playback = performScript(HAND, { duration: 40 });

describe('stage performance', () => {
  it('performs every beat of the hand-written script', () => {
    expect(playback.beats.map((b) => handlerKey(b))).toEqual([
      'pass:complete',
      'pass:complete',
      'carry:complete',
      'pass:complete',
      'pass:complete',
    ]);
  });

  it('no player ever moves faster than a sprint', () => {
    const bound = (MOTION.sprintBase + MOTION.sprintPerPace) * TICK + 0.02;
    for (let f = 1; f < playback.frames.length; f++) {
      for (let i = 0; i < 22; i++) {
        expect(dist(posOf(playback.frames[f - 1], i), posOf(playback.frames[f], i))).toBeLessThan(
          bound,
        );
      }
    }
  });

  it('the receiver is at the reception point when the ball arrives', () => {
    const receives = playback.events.filter((e) => e.kind === 'receive');
    expect(receives).toHaveLength(4);
    for (const e of receives) {
      const frame = playback.frames.find((f) => f.t === e.t);
      expect(frame).toBeDefined();
      if (!frame || e.other === undefined) continue;
      expect(dist(posOf(frame, e.other), e.at)).toBeLessThanOrEqual(
        STAGING_CONFIG.stage.controlRange + 0.6,
      );
    }
  });

  it("a held ball stays at its owner's feet", () => {
    const held = playback.frames.filter((f) => f.mode === 'held');
    expect(held.length).toBeGreaterThan(0);
    for (const f of held) {
      expect(dist(posOf(f, f.owner), [f.ball[0], f.ball[1]])).toBeLessThanOrEqual(
        STAGING_CONFIG.ball.carryOffset + 0.05,
      );
    }
  });

  it('a lofted ball rises and comes down', () => {
    const flight = playback.frames.filter((f) => f.beat === 4 && f.mode === 'flight');
    expect(flight.length).toBeGreaterThan(3);
    const zs = flight.map((f) => f.ball[2]);
    const top = Math.max(...zs);
    expect(top).toBeGreaterThanOrEqual(STAGING_CONFIG.ball.loftMin);
    const peak = zs.indexOf(top);
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThan(zs.length - 1);
    expect(zs[0]).toBeLessThan(top);
    expect(zs[zs.length - 1]).toBeLessThan(0.05);
    // Ground passes stay on the grass.
    const ground = playback.frames.filter((f) => f.beat === 1 && f.mode === 'flight');
    expect(ground.every((f) => f.ball[2] === 0)).toBe(true);
  });

  it('frames tick evenly from zero and stop at the duration', () => {
    const frames = playback.frames;
    expect(frames[0].t).toBe(0);
    frames.forEach((f, i) => expect(f.t).toBeCloseTo(i * TICK, 9));
    expect(frames[frames.length - 1].t).toBeLessThanOrEqual(40);
    expect(playback.duration).toBe(frames[frames.length - 1].t);
    const short = performScript(HAND, { duration: 5 });
    expect(short.frames[short.frames.length - 1].t).toBe(5);
    expect(short.duration).toBe(5);
    expect(short.events.every((e) => e.t <= 5)).toBe(true);
    const whistle = short.events[short.events.length - 1];
    expect(whistle.kind).toBe('whistle');
    expect(whistle.t).toBe(5);
  });

  it('kick-off puts both sides in their own halves and the defenders outside the centre circle', () => {
    const first = playback.frames[0];
    for (let i = 0; i < 22; i++) {
      const [x] = posOf(first, i);
      if (i < 11) expect(x).toBeLessThanOrEqual(HALFWAY);
      else {
        expect(x).toBeGreaterThanOrEqual(HALFWAY);
        expect(dist(posOf(first, i), CENTRE)).toBeGreaterThanOrEqual(
          STAGING_CONFIG.stage.kickOff.circle - 0.01,
        );
      }
    }
    expect(first.owner).toBe(9);
    expect(first.mode).toBe('held');
  });

  it('the same script stages identically', () => {
    expect(JSON.stringify(performScript(HAND, { duration: 40 }))).toBe(JSON.stringify(playback));
  });

  it('an unknown beat throws', () => {
    const bad = scriptOf([
      { kind: 'kickOff', actor: 9, receiver: 5, to: [45, 30] },
      { kind: 'carry', actor: 5, to: [50, 30], outcome: 'goal' },
    ]);
    expect(() => performScript(bad, { duration: 40 })).toThrow();
  });
});
