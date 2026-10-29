import { describe, expect, it, vi } from 'vitest';
import {
  createGroundPainter,
  DEFAULT_PITCH_SKIN,
  paintPitchBall,
  paintPitchGround,
  resolvePitchSkin,
} from './pitchPainting';

function recordingContext() {
  let state: Record<string, unknown> = { fillStyle: '#000', globalAlpha: 1, lineWidth: 1 };
  const stack: (typeof state)[] = [];
  const calls: { op: string; args: unknown[]; state: typeof state }[] = [];
  const ctx = new Proxy(
    {},
    {
      get: (_, key: string) =>
        key in state
          ? state[key]
          : (...args: unknown[]) => {
              calls.push({ op: key, args, state: { ...state } });
              if (key === 'save') stack.push({ ...state });
              if (key === 'restore') state = stack.pop()!;
              if (key === 'createPattern') return {};
            },
      set: (_, key: string, value: unknown) => ((state[key] = value), true),
    },
  ) as CanvasRenderingContext2D;
  return { ctx, calls, state: () => state, depth: () => stack.length };
}

describe('presentation-only pitch materials', () => {
  it('uses readable legacy defaults and rejects missing, nonfinite and out-of-range dimensions', () => {
    const values: Record<string, string> = {
      '--pitch-ground': '#e7d9ad',
      '--pitch-line-width': 'Infinity',
      '--pitch-marker-width': '-3',
      '--pitch-texture-opacity': '2',
      '--pitch-pixel-size': '2',
      '--pitch-texture-size': '0',
    };
    const skin = resolvePitchSkin({ getPropertyValue: (key) => values[key] ?? '' });
    expect(skin).toEqual({ ...DEFAULT_PITCH_SKIN, ground: '#e7d9ad', pixelSize: 2 });
    expect(Object.isFrozen(skin)).toBe(true);
    expect(resolvePitchSkin({ getPropertyValue: () => '' })).toEqual(DEFAULT_PITCH_SKIN);
  });

  it('keeps the existing field projection and goals when only materials/line treatment change', () => {
    const draws = [
      DEFAULT_PITCH_SKIN,
      { ...DEFAULT_PITCH_SKIN, ground: '#e7d9ad', line: '#403d31', lineWidth: 2 },
      { ...DEFAULT_PITCH_SKIN, pixelSize: 2 },
    ].map((skin) => {
      const { ctx, calls, depth } = recordingContext();
      paintPitchGround(ctx, 1000, 1000 / 1.9, skin);
      expect(depth()).toBe(0);
      expect(calls.find((c) => c.op === 'fillRect')!.state.fillStyle).toBe(skin.ground);
      return calls
        .filter((c) => ['strokeRect', 'ellipse', 'moveTo', 'lineTo'].includes(c.op))
        .map(({ op, args }) => ({ op, args }));
    });
    expect(draws[0][0]).toEqual({ op: 'strokeRect', args: [65, 65, 870, 1000 / 1.9 - 130] });
    expect(draws[1]).toEqual(draws[0]);
    expect(draws[2]).toEqual(draws[0]);
  });

  it.each([320, 760, 1200])('draws a round centre circle at width %i', (width) => {
    const { ctx, calls } = recordingContext();
    paintPitchGround(ctx, width, width / 1.9, DEFAULT_PITCH_SKIN);
    const circle = calls.find((call) => call.op === 'ellipse')!;
    expect(circle.args[2]).toBeGreaterThan(0);
    expect(circle.args[2]).toBe(circle.args[3]);
  });

  it('repaints one bounded ground surface only on size, density or skin changes', () => {
    const ground = recordingContext();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ground.ctx,
    } as unknown as HTMLCanvasElement;
    const make = vi.fn(() => canvas);
    const painter = createGroundPainter(make);
    const target = recordingContext();
    const draw = (width = 390, dpr = 2, skin = DEFAULT_PITCH_SKIN) =>
      painter.draw(target.ctx, width, width / 1.9, dpr, skin);
    draw();
    const work = ground.calls.length;
    for (let frame = 0; frame < 60; frame++) draw();
    expect(ground.calls).toHaveLength(work);
    expect(target.calls.filter((c) => c.op === 'drawImage')).toHaveLength(61);
    draw(800);
    expect(ground.calls.length).toBeGreaterThan(work);
    draw(800, 1);
    const pixel = { ...DEFAULT_PITCH_SKIN, pixelSize: 2 };
    draw(800, 2, pixel);
    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(Math.ceil(800 / 1.9 / 2));
    expect(make).toHaveBeenCalledOnce();
    expect(target.depth()).toBe(0);
    expect(ground.depth()).toBe(0);
  });

  it('uses the selected static texture behind markings without leaking opacity or paint state', () => {
    const { ctx, calls, state, depth } = recordingContext();
    const texture = { naturalWidth: 512, naturalHeight: 512 } as HTMLImageElement;
    paintPitchGround(ctx, 390, 390 / 1.9, {
      ...DEFAULT_PITCH_SKIN,
      texture,
      textureOpacity: 0.4,
      textureSize: 320,
    });
    expect(calls.find((c) => c.op === 'createPattern')!.args).toEqual([texture, 'repeat']);
    expect(calls.some((c) => c.op === 'fillRect' && c.state.globalAlpha === 0.4)).toBe(true);
    expect(calls.find((c) => c.op === 'strokeRect')!.state.globalAlpha).toBe(1);
    expect(state()).toEqual({ fillStyle: '#000', globalAlpha: 1, lineWidth: 1 });
    expect(depth()).toBe(0);
  });

  it('keeps a painted fallback when an offscreen context is unavailable', () => {
    const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
    const { ctx, calls } = recordingContext();
    createGroundPainter(() => canvas).draw(ctx, 390, 390 / 1.9, 2, DEFAULT_PITCH_SKIN);
    expect(calls.some((c) => c.op === 'fillRect')).toBe(true);
    expect(calls.some((c) => c.op === 'strokeRect')).toBe(true);
    expect(calls.some((c) => c.op === 'drawImage')).toBe(false);
  });

  it('changes a ball contour while preserving its given centre and bounds', () => {
    const normal = recordingContext();
    paintPitchBall(normal.ctx, 41.25, 57.75, 4, DEFAULT_PITCH_SKIN);
    expect(normal.calls.find((c) => c.op === 'arc')!.args.slice(0, 3)).toEqual([41.25, 57.75, 4]);
    const pixel = recordingContext();
    paintPitchBall(pixel.ctx, 41.25, 57.75, 4, { ...DEFAULT_PITCH_SKIN, pixelSize: 2 });
    const points = pixel.calls
      .filter((c) => ['moveTo', 'lineTo'].includes(c.op))
      .map((c) => c.args as number[]);
    expect(Math.min(...points.map(([x]) => x!))).toBe(37.25);
    expect(Math.max(...points.map(([x]) => x!))).toBe(45.25);
    expect(Math.min(...points.map(([, y]) => y!))).toBe(53.75);
    expect(Math.max(...points.map(([, y]) => y!))).toBe(61.75);
    expect(pixel.depth()).toBe(0);
  });
});
