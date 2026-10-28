import { describe, expect, it } from 'vitest';
import type { PlayerMotion } from '../../../../packages/contracts/src/types';
import { PITCH_METRES } from './figureActions';
import { FIGURE_POSE_CONFIG, gaitDistances, poseAt } from './figurePose';
import { FIXED_SHAPE, figureInputs, type FigureFrame } from './pitchFigures';
import type { PresentationSample } from './presentationClock';

const motion = (
  id: string,
  position: [number, number],
  velocity: [number, number] = [0, 0],
): PlayerMotion => ({ id, position, velocity, state: 'shape', intent: position });

/** A sample at running second `time` with its home and away players. */
const sample = (
  time: number,
  home: PlayerMotion[],
  away: PlayerMotion[] = [],
): PresentationSample => ({
  frame: Math.floor(time / 60),
  ball: [50, 50],
  players: [home, away],
  within: (time % 60) / 60,
  time,
});

/** A 220 × 120 px canvas: 10 px of pad around a 200 × 100 px field. */
const MAPPING = { pad: 10, fw: 200, fh: 100 };

/** The frame of `samples` at sample `index`, `time` running seconds. */
function frame(
  samples: PresentationSample[],
  index: number,
  time: number,
  overrides: Partial<FigureFrame> = {},
): FigureFrame {
  return {
    time,
    index,
    timeline: { samples, times: samples.map((s) => s.time), sampleBreak: () => false },
    distances: gaitDistances(samples),
    mapping: MAPPING,
    ball: [50, 50],
    ballHeight: 0,
    keepers: [undefined, undefined],
    numbers: new Map(),
    ...overrides,
  };
}

describe('pitch figures (→MATCH-12/37, WEB-95)', () => {
  it('velocity converts to screen space', () => {
    const samples = [
      sample(10, [motion('h1', [40, 50], [4, -2])]),
      sample(11, [motion('h1', [44, 48], [4, -2])]),
    ];
    const [figure] = figureInputs(samples[0]!, samples[1]!, 0.5, frame(samples, 0, 10.5));
    // 2 px per unit across, 1 px per unit down the screen.
    expect(figure!.input.velocity).toEqual([8, -2]);
    expect(figure!.input.speed).toBeCloseTo(Math.hypot(4 * PITCH_METRES[0], -2 * PITCH_METRES[1]));
    expect(figure!.input.position).toEqual([42, 49]);
    expect([figure!.x, figure!.y]).toEqual([10 + 84, 10 + 49]);
    // The ball at the centre spot lies 16 px to his right and 1 px down the screen.
    expect(figure!.input.toBall).toEqual([16, 1]);
  });

  it('the body faces where the figure is drawn going, whatever the recorded velocity says', () => {
    // Recorded as running down the screen, drawn moving right: he faces right at once.
    const samples = [
      sample(10, [motion('h1', [40, 50], [0, 4])]),
      sample(11, [motion('h1', [44, 50], [4, 0])]),
    ];
    const time = 10 + FIGURE_POSE_CONFIG.hipLag + 0.5;
    const [figure] = figureInputs(samples[0]!, samples[1]!, 0.66, frame(samples, 0, time));
    expect(figure!.input.velocity[0]).toBeCloseTo(8);
    expect(figure!.input.velocity[1]).toBeCloseTo(0);
    expect(figure!.input.velocityBefore[0]).toBeCloseTo(8);
    expect(figure!.input.velocityBefore[1]).toBeCloseTo(0);
  });

  it('where his path bends he turns within `turn` seconds, the hips hipLag behind', () => {
    const { turn, hipLag } = FIGURE_POSE_CONFIG;
    const samples = [
      sample(10, [motion('h1', [40, 50])]),
      sample(11, [motion('h1', [44, 50])]),
      sample(12, [motion('h1', [44, 54])]),
    ];
    const at = (t: number) =>
      figureInputs(samples[1]!, samples[2]!, t - 11, frame(samples, 1, t))[0]!.input;
    // Half way through the turn: between right ([8, 0] px/s) and down ([0, 4] px/s).
    const half = at(11 + turn / 2);
    expect(half.velocity[0]).toBeCloseTo(4);
    expect(half.velocity[1]).toBeCloseTo(2);
    // Turned: he faces down; his hips are read hipLag earlier, still part way round.
    const turned = at(11 + turn + 0.05);
    expect(turned.velocity[0]).toBeCloseTo(0);
    expect(turned.velocity[1]).toBeCloseTo(4);
    const hips = (turn + 0.05 - hipLag) / turn;
    expect(turned.velocityBefore[0]).toBeCloseTo(8 * (1 - hips));
    expect(turned.velocityBefore[1]).toBeCloseTo(4 * hips);
  });

  it('distance interpolates between samples', () => {
    const samples = [
      sample(10, [motion('h1', [10, 50])]),
      sample(12, [motion('h1', [20, 50])]),
      sample(14, [motion('h1', [20, 60])]),
    ];
    const at = (index: number, mix: number) =>
      figureInputs(
        samples[index]!,
        samples[index + 1]!,
        mix,
        frame(samples, index, samples[index]!.time + mix * 2),
      )[0]!.input.distance;
    expect(at(0, 0)).toBe(0);
    expect(at(0, 0.25)).toBeCloseTo(10 * PITCH_METRES[0] * 0.25);
    expect(at(1, 0.5)).toBeCloseTo(10 * PITCH_METRES[0] + 10 * PITCH_METRES[1] * 0.5);
  });

  it('carrier follows the possession cue', () => {
    const samples = [sample(10, [motion('h1', [40, 50]), motion('h2', [45, 50])])];
    const carriers = (carrierId?: string) =>
      figureInputs(samples[0]!, samples[0]!, 0, frame(samples, 0, 10, { carrierId })).map(
        ({ input }) => input.carrier,
      );
    expect(carriers('h2')).toEqual([false, true]);
    // A ball in flight or a contested one has no carrier, whoever stands nearest.
    expect(carriers(undefined)).toEqual([false, false]);
    expect(carriers('a9')).toEqual([false, false]);
  });

  it('missing next sample holds position', () => {
    const samples = [
      sample(10, [motion('h1', [30, 40], [3, 0]), motion('h2', [60, 40], [1, 1])]),
      sample(12, [motion('h2', [62, 42], [1, 1])]),
    ];
    const [left, stays] = figureInputs(samples[0]!, samples[1]!, 0.5, frame(samples, 0, 11));
    expect(left!.input.position).toEqual([30, 40]);
    expect([left!.x, left!.y]).toEqual([10 + 60, 10 + 40]);
    expect(left!.input.velocity).toEqual([6, 0]);
    expect(left!.input.distance).toBe(0);
    expect(stays!.input.position).toEqual([61, 41]);
  });

  it('numbers keepers by their sample and players by their roster place', () => {
    const samples = [sample(10, [motion('h1', [5, 50])], [motion('a1', [95, 50])])];
    const figures = figureInputs(
      samples[0]!,
      samples[0]!,
      0,
      frame(samples, 0, 10, {
        keepers: ['h1', undefined],
        numbers: new Map([
          ['h1', 0],
          ['a1', 13],
        ]),
      }),
    );
    expect(figures.map((f) => [f.side, f.number, f.input.keeper])).toEqual([
      [0, 1, true],
      [1, 14, false],
    ]);
  });

  it('the same instant gives the same inputs', () => {
    const samples = [
      sample(10, [motion('h1', [40, 50], [2, 1])], [motion('a1', [60, 50], [-1, 0])]),
      sample(11, [motion('h1', [42, 51], [2, 1])], [motion('a1', [59, 50], [-1, 0])]),
    ];
    const read = () =>
      figureInputs(samples[0]!, samples[1]!, 0.3, frame(samples, 0, 10.3, { carrierId: 'h1' }));
    expect(read()).toEqual(read());
  });

  it('an archived match without motion stands in the fixed shape facing the opponents', () => {
    const legacy: PresentationSample = { frame: 3, ball: [50, 50], within: 1, time: 240 };
    const figures = figureInputs(legacy, legacy, 0, frame([legacy], 0, 240));
    expect(figures).toHaveLength(FIXED_SHAPE.length * 2);
    expect(figures.filter((f) => f.input.keeper).map((f) => f.input.position)).toEqual([
      [5, 50],
      [95, 50],
    ]);
    for (const { side, input } of figures) {
      expect(input.carrier).toBe(false);
      const facing = poseAt(input, undefined, { reducedMotion: false }).facing;
      expect(Math.cos(facing)).toBeCloseTo(side ? -1 : 1);
    }
  });
});
