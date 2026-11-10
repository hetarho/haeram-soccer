import { describe, expect, it } from 'vitest';
import { fakePlayback, frameOf } from '../check/playback.testkit.ts';
import { PROTO_CONFIG } from '../core/config.ts';
import { PITCH } from '../core/pitch.ts';
import { recordingContext } from './context.testkit.ts';
import { drawScene, type DrawOptions } from './draw.ts';
import { clockLabel, fitPitch, sampleAt, toCanvas } from './model.ts';

const OPTIONS: DrawOptions = {
  offsideLines: true,
  roles: true,
  trail: true,
  width: 900,
  height: 600,
};
const frames = Array.from({ length: 21 }, (_, i) =>
  frameOf(i / PROTO_CONFIG.hz, { ball: [40 + i, 30, i / 10], owner: i < 10 ? 9 : -1 }),
);

describe('viewer drawing', () => {
  it('drawScene draws 22 players and the ball without throwing', () => {
    const playback = fakePlayback({ frames });
    const { ctx, calls } = recordingContext();
    const view = fitPitch(OPTIONS.width, OPTIONS.height, PROTO_CONFIG.viewer.pad);
    const sample = sampleAt(playback, 0.75);
    expect(() =>
      drawScene(ctx, view, playback, sample, OPTIONS, [
        [40, 30],
        [41, 30],
        [42, 30],
      ]),
    ).not.toThrow();
    expect(calls.filter((c) => c.name === 'arc').length).toBeGreaterThanOrEqual(23);
    const texts = calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
    expect(texts).toContain(clockLabel(0.75));
  });

  it('an offside flash draws its line', () => {
    const playback = fakePlayback({
      frames,
      events: [{ t: 1, beat: 0, kind: 'offside', team: 0, actor: 9, at: [72, 30], line: 70 }],
    });
    const { ctx, calls, sets } = recordingContext();
    const view = fitPitch(OPTIONS.width, OPTIONS.height, PROTO_CONFIG.viewer.pad);
    const options = { ...OPTIONS, offsideLines: false, trail: false };
    drawScene(ctx, view, playback, sampleAt(playback, 1.2), options);
    const [x, top] = toCanvas(view, [70, 0]);
    const [, bottom] = toCanvas(view, [70, PITCH.width]);
    const at = (name: string, px: number, py: number) =>
      calls.some((c) => c.name === name && c.args[0] === px && c.args[1] === py);
    expect(at('moveTo', x, top)).toBe(true);
    expect(at('lineTo', x, bottom)).toBe(true);
    expect(sets).toContainEqual({
      name: 'strokeStyle',
      value: PROTO_CONFIG.viewer.colours.offside,
    });
    // Without the event, nothing is drawn on that line.
    const plain = recordingContext();
    drawScene(plain.ctx, view, fakePlayback({ frames }), sampleAt(playback, 1.2), options);
    expect(plain.calls.some((c) => c.name === 'moveTo' && c.args[0] === x)).toBe(false);
  });
});
