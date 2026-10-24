import type {
  MatchEvent,
  MatchFrame,
  MatchMotionSample,
  PlayerMotion,
} from '../../../../packages/contracts/src/types';

export const WATCH_SPEEDS = [1, 2, 4, 8, 16] as const;
/** The speed every match presentation opens at, live or archived (→WEB-32). */
export const WATCH_DEFAULT_SPEED = 2;
/** Real ms one match minute of running playback lasts at 1x (→WEB-32, MATCH-12). */
export const WATCH_MINUTE_MS = 12000;
/**
 * Real ms a set-piece preparation is drawn in at every speed, unless running speed is quicker
 * (→WEB-32, MATCH-12); the only number for the preparation, reviewed by the owner in play.
 */
export const SET_PIECE_PREPARATION_MS = 1500;
/** The restarts whose dead interval before the kick is a set-piece preparation (→WEB-32). */
const PREPARED_RESTARTS: readonly MatchEvent['restart'][] = ['corner', 'freeKick', 'goalKick'];

/**
 * The presentation clock (→WEB-32) runs on running match seconds, uniform through build-up, chances,
 * every restart's kick and delivery, added time and extra time. Every frame is one match minute of
 * running play, so frame `i` covers running seconds 60·i to 60·(i + 1); the gap between periods and
 * a seek are transitions, never running play. Frame `pace` is not read, so no situation in running
 * play slows the match down or speeds it up; only a set-piece preparation is drawn faster.
 */
export function runningLength(frames: number) {
  return Math.max(0, frames) * 60;
}

/** Running seconds per real ms at `speed`: 1x plays 60 match seconds in `WATCH_MINUTE_MS`. */
export function runningRate(speed: number) {
  return (speed * 60) / WATCH_MINUTE_MS;
}

/** A set-piece preparation (→WEB-32) on the presentation clock: running seconds `from` to `to`. */
export interface Preparation {
  from: number;
  to: number;
}

/** A moment `t` seconds into frame `index` (an event's or a holder change's time) in running seconds. */
const minuteTime = (index: number, t: number) => index * 60 + Math.min(60, Math.max(0, t));

/** An event's time is recorded to a tenth of a second: a take or sample that close is its landing. */
const EVENT_TIME_STEP = 0.1;
/** How far (pitch units) a drawn ball may lie from a restart's spot and still be on it. */
const SPOT_REACH = 0.5;

/**
 * The set-piece preparations of a playback (→WEB-32, MATCH-12): before the kick of each corner, free
 * kick or goal kick, the dead interval from the end of the last event before it — the ball going
 * dead — to the kick, where the restart is played and the players stand on their places. Every
 * entry carrying such a `restart` counts, including a free kick or goal kick whose delivery the
 * engine records as the foul or offside it ended in. The entry is timed where its delivery lands, so
 * the kick is read from what precedes it: on the pre-feature trace, which holds the interval in the
 * restart's step, the taker (the actor of a `kind: 'restart'` entry) taking the ball by the recorded
 * holders; on the candidate, which walks the participants in and records the kick as its own
 * sample, the last restart-phase sample with the ball still on the restart's spot (`from`) — the
 * delivery flies in the same phase, and a minute's end can sample it in the air. A restart without
 * either keeps running speed, as do throw-ins, kick-offs and penalties, and cards, injuries and
 * substitutions recorded after the ball went dead. Frames are read only.
 */
export function setPiecePreparations(frames: readonly MatchFrame[]) {
  const preparations: Preparation[] = [];
  let dead: { at: number; frame: number } | undefined;
  frames.forEach((frame, i) => {
    for (const event of frame.events ?? []) {
      const at = minuteTime(i, event.t);
      if (
        PREPARED_RESTARTS.includes(event.restart) &&
        dead &&
        frames[dead.frame]!.period === frame.period
      ) {
        const kick = restartKick(frames, dead, i, at, event);
        if (kick !== undefined && dead.at >= (preparations.at(-1)?.to ?? 0))
          preparations.push({ from: dead.at, to: kick });
      }
      dead = { at, frame: i };
    }
  });
  return preparations;
}

/**
 * The kick of `restart`, whose delivery lands at `landing` (frame `index`), after the ball went dead
 * at `dead`: its taker's last recorded take of the ball, else the last restart-phase sample with the
 * ball on its spot, either clear of the landing (a taker can play the ball to himself).
 */
function restartKick(
  frames: readonly MatchFrame[],
  dead: { at: number; frame: number },
  index: number,
  landing: number,
  restart: MatchEvent,
) {
  const before = (time: number) => time > dead.at && time < landing - EVENT_TIME_STEP;
  // Only a restart entry's actor is its taker; a foul or offside names who ended the delivery.
  const taker = restart.kind === 'restart' ? restart.actor : undefined;
  let held: number | undefined;
  let snapshot: number | undefined;
  for (let j = dead.frame; j <= index; j++) {
    const frame = frames[j]!;
    for (const [t, holder] of frame.holders ?? []) {
      const time = minuteTime(j, t);
      if (taker && holder === taker && before(time)) held = time;
    }
    frame.motion?.forEach((motion, k) => {
      const time = runningTime(j, frame, motion.elapsedSeconds, (k + 1) / frame.motion!.length);
      const onSpot =
        Math.hypot(motion.ball[0] - restart.from[0], motion.ball[1] - restart.from[1]) <=
        SPOT_REACH;
      if (motion.phase === 'restart' && onSpot && before(time)) snapshot = time;
    });
  }
  return held ?? snapshot;
}

/** The first preparation that has not ended by running second `seconds`. */
function preparationAfter(preparations: readonly Preparation[], seconds: number) {
  let low = 0,
    high = preparations.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (preparations[mid]!.to <= seconds) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** The clock's rate inside `preparation` at `speed`: its whole span in the set time at most. */
const preparationRate = (preparation: Preparation, speed: number) =>
  Math.max(runningRate(speed), (preparation.to - preparation.from) / SET_PIECE_PREPARATION_MS);

/**
 * The running seconds after `elapsedMs` of real time at `speed` from `seconds`, held between
 * kick-off and `length`. Running play advances at `runningRate(speed)`; inside a preparation the
 * clock runs at the larger of that and the preparation's span over `SET_PIECE_PREPARATION_MS`, so
 * every route in it is scaled by one factor. The multiplier applies to the clock's advance only, so
 * changing it never moves the match time, and real time never runs it backwards.
 */
export function presentationAdvance(
  seconds: number,
  elapsedMs: number,
  speed: number,
  length: number,
  preparations: readonly Preparation[] = [],
) {
  let at = Math.min(length, Math.max(0, seconds));
  let real = Math.max(0, elapsedMs);
  let k = preparationAfter(preparations, at);
  while (real > 0 && at < length) {
    const preparation = preparations[k];
    const inside = !!preparation && preparation.from <= at;
    const rate = inside ? preparationRate(preparation, speed) : runningRate(speed);
    const end = Math.min(length, inside ? preparation.to : (preparation?.from ?? length));
    const reach = (end - at) / rate;
    if (real < reach) return at + real * rate;
    at = end;
    real -= reach;
    if (inside) k++;
  }
  return at;
}

/** Real ms the clock takes from running second `from` to `to` at `speed`: the inverse of advancing. */
export function presentationMs(
  from: number,
  to: number,
  speed: number,
  preparations: readonly Preparation[] = [],
) {
  let ms = 0;
  for (let at = from, k = preparationAfter(preparations, from); at < to;) {
    const preparation = preparations[k];
    const inside = !!preparation && preparation.from <= at;
    const end = Math.min(to, inside ? preparation.to : (preparation?.from ?? to));
    ms += (end - at) / (inside ? preparationRate(preparation, speed) : runningRate(speed));
    at = end;
    if (inside) k++;
  }
  return ms;
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
