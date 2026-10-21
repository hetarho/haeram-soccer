import type {
  MatchFrame,
  MatchMotionSample,
  PlayerMotion,
} from '../../../../packages/contracts/src/types';

export const WATCH_SPEEDS = [1, 2, 4, 8, 16] as const;
/** Real ms one match minute of running playback lasts at 1x (→WEB-32, MATCH-12). */
export const WATCH_MINUTE_MS = 4000;

/**
 * The presentation clock (→WEB-32): ms at 1x, uniform through build-up, dead balls, chances, added
 * time and extra time. Every frame is one match minute of running play, so frame `i` covers running
 * seconds 60·i to 60·(i + 1); the gap between periods and a seek are transitions, never running
 * play. Frame `pace` is not read, so no situation can slow the match down or speed it up.
 */
export function presentationLength(frames: number) {
  return Math.max(0, frames) * WATCH_MINUTE_MS;
}

/**
 * The 1x clock after `elapsedMs` of real time at `speed`, held between kick-off and `lengthMs`.
 * The multiplier applies to the clock's advance only, so changing it never moves the match time.
 */
export function presentationAdvance(
  clockMs: number,
  elapsedMs: number,
  speed: number,
  lengthMs: number,
) {
  return Math.min(lengthMs, Math.max(0, clockMs + elapsedMs * speed));
}

/** Running seconds `clockMs` into the 1x clock. */
export function runningSeconds(clockMs: number) {
  return (clockMs / WATCH_MINUTE_MS) * 60;
}

/** The 1x clock time of running seconds: the inverse of `runningSeconds`, used by seeking. */
export function clockAt(seconds: number) {
  return (seconds / 60) * WATCH_MINUTE_MS;
}

/**
 * Running seconds of a moment of frame `index`: its minute plus the match seconds into it. A timed
 * frame (`startSeconds`, →MATCH-12) places it at its elapsed match time; a legacy frame has only its
 * share of the minute (`within`, 0–1), decoded at equal intervals.
 */
export function runningTime(
  index: number,
  frame: Pick<MatchFrame, 'startSeconds'>,
  elapsedSeconds: number | undefined,
  within: number,
) {
  const into =
    frame.startSeconds !== undefined && elapsedSeconds !== undefined
      ? elapsedSeconds - frame.startSeconds
      : within * 60;
  return index * 60 + Math.min(60, Math.max(0, into));
}

/**
 * Where running time `t` falls among ordered, irregular sample times: the last sample at or before
 * it plus the share of the way to the next. Across a break (`broken(k)` between samples k and k + 1:
 * a period change) it holds sample k until the next begins instead of interpolating.
 */
export function locate(times: readonly number[], t: number, broken?: (k: number) => boolean) {
  const last = times.length - 1;
  if (last <= 0 || t <= times[0]!) return 0;
  if (t >= times[last]!) return last;
  let low = 0,
    high = last;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (times[mid]! <= t) low = mid;
    else high = mid - 1;
  }
  if (broken?.(low)) return low;
  const span = times[low + 1]! - times[low]!;
  return low + (span > 0 ? (t - times[low]!) / span : 0);
}

/** A drawn moment of the playback: a minute's player sample, or a legacy minute's end. */
export interface PresentationSample {
  frame: number;
  ball: [number, number];
  players?: [PlayerMotion[], PlayerMotion[]];
  phase?: MatchMotionSample['phase'];
  ownerId?: string;
  /** Sample position inside its minute, 0–1. */
  within: number;
  /** Running seconds on the presentation clock (`runningTime`). */
  time: number;
}

/**
 * The playback's samples on the presentation clock (→MATCH-12, WEB-32): each minute's player
 * samples and ball points at their running time — a timed frame's at its recorded match seconds,
 * a legacy frame's at equal shares of its minute. A frame without motion keeps one sample at its
 * minute's end and no ball track; nothing is invented between recorded points.
 */
export function presentationSamples(frames: MatchFrame[]) {
  const samples: PresentationSample[] = frames.flatMap((frame, i) =>
    frame.motion?.length
      ? frame.motion.map((motion, j) => {
          const share = (j + 1) / frame.motion!.length;
          const time = runningTime(i, frame, motion.elapsedSeconds, share);
          return {
            frame: i,
            ball: motion.ball,
            players: motion.players,
            phase: motion.phase,
            ownerId: motion.ownerId,
            within: (time - i * 60) / 60,
            time,
          };
        })
      : [{ frame: i, ball: frame.ball, players: frame.players, within: 1, time: i * 60 + 60 }],
  );
  const track: [number, number, number][] = [];
  const trackTimes: number[] = [];
  const trackFrames: number[] = [];
  frames.forEach((frame, i) => {
    const points = frame.ballTrack ?? [];
    points.forEach((point, j) => {
      track.push(point);
      trackTimes.push(
        runningTime(i, frame, frame.ballTimes?.[j], frame.ballTimes ? 0 : (j + 1) / points.length),
      );
      trackFrames.push(i);
    });
  });
  const times = samples.map((sample) => sample.time);
  // A period change between neighbours is a transition, never running play.
  const sampleBreak = (k: number) =>
    frames[samples[k]!.frame]?.period !== frames[samples[k + 1]!.frame]?.period;
  const trackBreak = (k: number) =>
    frames[trackFrames[k]!]?.period !== frames[trackFrames[k + 1]!]?.period;
  return { samples, times, sampleBreak, track, trackTimes, trackBreak };
}
