import { describe, expect, it } from 'vitest';
import { STAGING_CONFIG } from './config';
import { HANDLERS, handlerKey } from './perform';
import { demoFixture } from './squads.testkit';
import { offsideKicks, performScript, posOf, scriptOf } from './script.testkit';
import { dist } from './vec';

// The prototype's pipeline invariants on small bound inputs. Grammar/showcase selection is absent.
const fixture = demoFixture();
const scripts = Array.from({ length: 10 }, (_, i) =>
  scriptOf(fixture, [
    { kind: 'kickOff', actor: 9, receiver: 5, to: [45, 30] },
    { kind: 'pass', actor: 5, receiver: 6, to: [50 + i, 24], hold: 0.5 + i / 10 },
    { kind: 'carry', actor: 6, to: [65 + i, 30] },
    { kind: 'pass', actor: 6, receiver: 9, to: [80, 30] },
    { kind: 'shot', actor: 9, to: [105, 34], outcome: i % 2 ? 'wide' : 'goal' },
  ]),
);
const played = scripts.map((script) => performScript(script, { duration: 180 }));
const { tick, motion, stage } = STAGING_CONFIG;
const maxStep = (motion.sprintBase + motion.sprintPerPace + stage.lunge) * tick + 0.02;

describe('bound stage pipeline', () => {
  it('ten small scripts stage within three minutes with finite, movement-bounded pictures', () => {
    let kicks = 0,
      offside = 0;
    for (const p of played) {
      for (const b of p.beats) expect(HANDLERS[handlerKey(b)]).toBeDefined();
      for (let f = 0; f < p.frames.length; f++) {
        const frame = p.frames[f];
        expect(frame.p).toHaveLength(44);
        expect(frame.p.every(Number.isFinite)).toBe(true);
        if (f === 0) continue;
        const prev = p.frames[f - 1];
        expect(frame.t - prev.t).toBeCloseTo(tick, 6);
        for (let i = 0; i < 22; i++)
          expect(dist(posOf(prev, i), posOf(frame, i))).toBeLessThanOrEqual(maxStep);
      }
      const counted = offsideKicks(p);
      kicks += counted.kicks;
      offside += counted.offside;
    }
    expect(kicks).toBeGreaterThan(0);
    expect(offside / kicks).toBeLessThanOrEqual(0.02);
  });
  it('the score in the playback equals the goal events', () => {
    for (const p of played) {
      const score: [number, number] = [0, 0];
      for (const e of p.events) if (e.kind === 'goal') score[e.team]++;
      expect(p.score).toEqual(score);
    }
  });
});
