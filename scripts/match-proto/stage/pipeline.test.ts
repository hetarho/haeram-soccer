import { describe, expect, it } from 'vitest';
import { PROTO_CONFIG } from '../core/config.ts';
import type { Playback } from '../core/types.ts';
import { dist } from '../core/vec.ts';
import { generateScript } from '../script/generate.ts';
import { HANDLERS, handlerKey, performScript } from './perform.ts';
import { producePlayback } from './pipeline.ts';
import { offsideKicks, posOf } from './script.testkit.ts';

const MOTION = PROTO_CONFIG.motion;
const TICK = PROTO_CONFIG.tick;
const STEP = (MOTION.sprintBase + MOTION.sprintPerPace + PROTO_CONFIG.stage.lunge) * TICK + 0.02;

const SEEDS = Array.from({ length: 10 }, (_, i) => `s${i}`);
const PLAYED: Playback[] = SEEDS.map((seed) =>
  performScript(generateScript(seed), { duration: 180 }),
);

describe('stage pipeline', () => {
  it('ten generated scripts stage for three minutes without throwing', () => {
    let kicks = 0;
    let offside = 0;
    for (const p of PLAYED) {
      for (const b of p.beats) expect(HANDLERS[handlerKey(b)]).toBeDefined();
      for (let f = 0; f < p.frames.length; f++) {
        const frame = p.frames[f];
        expect(frame.p).toHaveLength(44);
        expect(frame.p.every((v) => Number.isFinite(v))).toBe(true);
        if (f === 0) continue;
        const prev = p.frames[f - 1];
        expect(frame.t - prev.t).toBeCloseTo(TICK, 6);
        for (let i = 0; i < 22; i++) {
          expect(dist(posOf(prev, i), posOf(frame, i))).toBeLessThanOrEqual(STEP);
        }
      }
      const counted = offsideKicks(p);
      kicks += counted.kicks;
      offside += counted.offside;
    }
    // A forced kick after `stage.maxExtraHold` is the only way one is played to a man offside.
    expect(kicks).toBeGreaterThan(0);
    expect(offside / kicks).toBeLessThanOrEqual(0.02);
  });

  it('producePlayback without the showcase is deterministic', () => {
    const a = producePlayback('t1', { showcase: false, duration: 120 });
    const b = producePlayback('t1', { showcase: false, duration: 120 });
    expect(a).toEqual(b);
  });

  it('the score in the playback equals the goal events', () => {
    for (const p of PLAYED) {
      const score: [number, number] = [0, 0];
      for (const e of p.events) if (e.kind === 'goal') score[e.team] += 1;
      expect(p.score).toEqual(score);
    }
  });
});
