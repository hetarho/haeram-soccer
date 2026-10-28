import type { PlayerMotion } from '../../../../packages/contracts/src/types';
import { PITCH_METRES } from './figureActions';
import { FIGURE_POSE_CONFIG, type FigureInput } from './figurePose';
import { locate, type PresentationSample } from './presentationClock';

/**
 * MATCH-12/36/37, WEB-95: what each player figure of the presented instant is drawn from
 * (spec/ssot/MATCH.md). Every player stands where the recorded samples put him, and his
 * `FigureInput` is read from the same recorded facts at the same instant, so a pose never moves him
 * off his path and the same instant always gives the same input. Pure: no React, DOM or drawing.
 */

/**
 * An archived match without motion stands each side in this fixed shape: an illustration of its
 * kits, not of any recorded player, with the keeper on his line.
 */
export const FIXED_SHAPE: readonly { at: readonly [number, number]; keeper?: true }[] =
  Object.freeze([
    { at: [5, 50], keeper: true },
    { at: [22, 15] },
    { at: [20, 38] },
    { at: [20, 62] },
    { at: [22, 85] },
    { at: [46, 25] },
    { at: [43, 50] },
    { at: [46, 75] },
    { at: [72, 20] },
    { at: [76, 50] },
    { at: [72, 80] },
  ]);

/** How the canvas draws the pitch: playback units 0–100 across `fw` × `fh` px from `pad`. */
export interface PitchMapping {
  pad: number;
  fw: number;
  fh: number;
}

/** The playback's samples on the presentation clock, as `presentationSamples` returns them. */
export interface FigureTimeline {
  samples: readonly PresentationSample[];
  times: readonly number[];
  sampleBreak: (k: number) => boolean;
}

/** The presented instant every figure is read at. */
export interface FigureFrame {
  /** Running seconds of the presentation clock. */
  time: number;
  /** The index of the presented sample in `timeline.samples`. */
  index: number;
  timeline: FigureTimeline;
  /** Each player's metres travelled by every sample (`gaitDistances`). */
  distances: ReadonlyMap<string, Float64Array>;
  mapping: PitchMapping;
  /** The drawn ball, playback units, and its height in the ball track's units. */
  ball: readonly [number, number];
  ballHeight: number;
  /** The recorded carrier of the possession cue (→WEB-95); nobody else holds the ball. */
  carrierId?: string;
  /** Who is in goal for each side in this sample (`keepersBySample`). */
  keepers: readonly [string | undefined, string | undefined];
  /** Each player's place in his matchday roster, from 0; his number is one more. */
  numbers: ReadonlyMap<string, number>;
}

/** One player figure to draw: his side, number and screen position, and what he is posed from. */
export interface PitchFigure {
  side: 0 | 1;
  /** The recorded motion; absent in the fixed shape. */
  motion?: PlayerMotion;
  number: number;
  /** His centre on the canvas, CSS px. */
  x: number;
  y: number;
  input: FigureInput;
}

const motionIn = (sample: PresentationSample | undefined, side: 0 | 1, id: string) =>
  sample?.players?.[side].find((motion) => motion.id === id);

/** A velocity in playback units per second, interpolated `mix` of the way to `to` when he has one. */
const blend = (
  from: readonly [number, number],
  to: readonly [number, number] | undefined,
  mix: number,
): [number, number] => [
  from[0] + ((to ?? from)[0] - from[0]) * mix,
  from[1] + ((to ?? from)[1] - from[1]) * mix,
];

/**
 * Every player's figure between `sample` and `next`, `mix` of the way (→MATCH-12/37), in side
 * order and the sample's own player order:
 * - position and velocity interpolate between his two samples; a player the next sample leaves
 *   out holds his position, velocity and distance;
 * - velocities reach the pose on screen, playback units scaled by the canvas mapping, and his
 *   speed in m/s; `velocityBefore` is his interpolated velocity `FIGURE_POSE_CONFIG.hipLag`
 *   seconds earlier on the same clock, his current one where no earlier sample has him;
 * - `distance` interpolates his `gaitDistances` row; `toBall` runs to the drawn ball on screen;
 *   only the possession cue's recorded carrier holds the ball;
 * - a sample without players stands both sides in `FIXED_SHAPE`, home facing +x and away −x.
 */
export function figureInputs(
  sample: PresentationSample,
  next: PresentationSample,
  mix: number,
  frame: FigureFrame,
): PitchFigure[] {
  const { pad, fw, fh } = frame.mapping;
  const sx = fw / 100,
    sy = fh / 100;
  const figures: PitchFigure[] = [];
  if (!sample.players) {
    for (const side of [0, 1] as const)
      FIXED_SHAPE.forEach((base, i) => {
        const position: [number, number] = [side ? 100 - base.at[0] : base.at[0], base.at[1]];
        figures.push({
          side,
          number: i + 1,
          x: pad + position[0] * sx,
          y: pad + position[1] * sy,
          input: {
            id: `shape:${side}:${i}`,
            keeper: !!base.keeper,
            time: frame.time,
            position,
            speed: 0,
            velocity: [0, 0],
            velocityBefore: [0, 0],
            // Nothing recorded to look at: each side faces the opponents' goal.
            toBall: [side ? -sx : sx, 0],
            ballHeight: 0,
            carrier: false,
            distance: NaN,
          },
        });
      });
    return figures;
  }
  const { samples, times, sampleBreak } = frame.timeline;
  // The samples around the instant `hipLag` earlier, for the way the hips still face.
  const earlier = locate(times, frame.time - FIGURE_POSE_CONFIG.hipLag, sampleBreak);
  const k = Math.floor(earlier);
  const before = samples[k],
    beforeNext = samples[Math.min(samples.length - 1, k + 1)],
    beforeMix = earlier - k;
  const nextIndex = next === sample ? frame.index : frame.index + 1;
  for (const side of [0, 1] as const)
    for (const motion of sample.players[side]) {
      const { id } = motion;
      const target = motionIn(next, side, id);
      const position = blend(motion.position, target?.position, mix);
      const velocity = blend(motion.velocity, target?.velocity, mix);
      const then = motionIn(before, side, id);
      const velocityThen = then
        ? blend(then.velocity, motionIn(beforeNext, side, id)?.velocity, beforeMix)
        : velocity;
      const row = frame.distances.get(id);
      const from = row?.[frame.index] ?? NaN,
        to = row?.[nextIndex] ?? NaN;
      figures.push({
        side,
        motion,
        number: (frame.numbers.get(id) ?? 0) + 1,
        x: pad + position[0] * sx,
        y: pad + position[1] * sy,
        input: {
          id,
          keeper: id === frame.keepers[side],
          time: frame.time,
          position,
          speed: Math.hypot(velocity[0] * PITCH_METRES[0], velocity[1] * PITCH_METRES[1]),
          velocity: [velocity[0] * sx, velocity[1] * sy],
          velocityBefore: [velocityThen[0] * sx, velocityThen[1] * sy],
          toBall: [(frame.ball[0] - position[0]) * sx, (frame.ball[1] - position[1]) * sy],
          ballHeight: frame.ballHeight,
          carrier: id === frame.carrierId,
          distance: Number.isNaN(to) ? from : from + (to - from) * mix,
        },
      });
    }
  return figures;
}
