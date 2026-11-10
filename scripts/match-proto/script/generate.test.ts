import { describe, expect, it } from 'vitest';
import { PROTO_CONFIG } from '../core/config.ts';
import { toAttack } from '../core/pitch.ts';
import type { Phase } from '../core/types.ts';
import { generateScript } from './generate.ts';
import { validateScript } from './validate.ts';

const PHASE_X = PROTO_CONFIG.grammar.phaseX;
const RANGES: Partial<Record<Phase, readonly [number, number]>> = {
  buildUp: [-Infinity, PHASE_X.progression],
  progression: [PHASE_X.progression, PHASE_X.finalThird],
  finalThird: [PHASE_X.finalThird, Infinity],
};

describe('generateScript', () => {
  it('the same seed gives the same script and another seed a different one', () => {
    const a = generateScript('same', { seconds: 300 });
    expect(generateScript('same', { seconds: 300 })).toEqual(a);
    expect(generateScript('other', { seconds: 300 }).beats).not.toEqual(a.beats);
  });

  it('starts with a kick-off and runs past the requested seconds', () => {
    const script = generateScript('start', { seconds: 200 });
    expect(script.beats[0].kind).toBe('kickOff');
    expect(script.nominalSeconds).toBeGreaterThanOrEqual(200);
    const full = generateScript('start');
    expect(full.nominalSeconds).toBeGreaterThanOrEqual(
      PROTO_CONFIG.duration * PROTO_CONFIG.grammar.nominalFactor,
    );
  });

  it('thirty seeds validate', () => {
    for (let i = 0; i < 30; i++) {
      const script = generateScript(`t${i}`);
      expect(validateScript(script), `seed t${i}`).toEqual([]);
    }
  });

  it('open-play phases follow the ball', () => {
    for (const seed of ['p0', 'p1', 'p2']) {
      for (const b of generateScript(seed).beats) {
        const range = RANGES[b.phase];
        if (range === undefined) continue;
        const x = toAttack(b.team, b.from)[0];
        expect(x >= range[0] && x < range[1], `${seed} beat ${b.index} ${b.phase} x ${x}`).toBe(
          true,
        );
      }
    }
  });

  it('times are non-decreasing and one per beat', () => {
    const script = generateScript('times');
    expect(script.times).toHaveLength(script.beats.length);
    script.times.forEach((t, i) => {
      if (i > 0) expect(t).toBeGreaterThanOrEqual(script.times[i - 1]);
    });
    expect(script.nominalSeconds).toBeGreaterThanOrEqual(script.times[script.times.length - 1]);
  });
});
