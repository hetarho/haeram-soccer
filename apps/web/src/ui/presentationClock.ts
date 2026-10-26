import type {
  FrameStoppage,
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
 * The dead-ball beat (→WEB-32, MATCH-12), the only place its numbers live, reviewed by the owner in
 * play: real ms at 1x, divided by the speed. The rush — the ball fetched and the players to their
 * places — runs at least `rushFactor` times the running rate and lasts at most `rushMaxMs`; then
 * the players stand still for their kind's beat, or the incident beat when a card, injury or
 * substitution falls in the stoppage, and never slower than running speed.
 */
export const DEAD_BALL_CONFIG = {
  rushFactor: 2,
  rushMaxMs: 1500,
  beatMs: {
    throwIn: 400,
    goalKick: 600,
    kickoff: 800,
    corner: 1000,
    freeKick: 1000,
    dropBall: 1000,
    penalty: 1500,
    incident: 2000,
  },
} as const;
/** The events a dead-ball beat names in its caption (→WEB-32). */
const INCIDENTS: readonly MatchEvent['kind'][] = ['card', 'injury', 'sub'];

/**
 * The presentation clock (→WEB-32) runs on running match seconds, uniform through build-up, chances,
 * every restart's kick and delivery, added time and extra time. Every frame is one match minute of
 * running play, so frame `i` covers running seconds 60·i to 60·(i + 1); the gap between periods and
 * a seek are transitions, never running play. Frame `pace` is not read, so no situation in running
 * play slows the match down or speeds it up; only a dead-ball beat is drawn at its own rate.
 */
export function runningLength(frames: number) {
  return Math.max(0, frames) * 60;
}

/** Running seconds per real ms at `speed`: 1x plays 60 match seconds in `WATCH_MINUTE_MS`. */
export function runningRate(speed: number) {
  return (speed * 60) / WATCH_MINUTE_MS;
}

/**
 * A dead-ball beat's segment (→WEB-32) on the presentation clock: running seconds `from` to `to`,
 * drawn at least `factor` times the running rate and in at most `ms` real ms at 1x (less at higher
 * speeds). A still beat names its stoppage's kind and the cards, injuries and substitutions in it.
 */
export interface Preparation {
  from: number;
  to: number;
  factor: number;
  ms: number;
  beat?: { kind: FrameStoppage['kind']; incidents: MatchEvent[] };
}

/**
 * The dead-ball beats of a playback (→WEB-32, MATCH-12): each stoppage a frame lists (T477) as a
 * rush from the ball going dead to everyone standing on his place and a still beat from there to
 * the kick, in running seconds of the frame that lists it. The beat carries the cards, injuries and
 * substitutions recorded from the ball going dead to the kick. Frames without stoppages (older
 * playback, the pre-feature model) keep running speed throughout. Frames are read only.
 */
export function deadBallBeats(frames: readonly MatchFrame[]) {
  const C = DEAD_BALL_CONFIG;
  const beats: Preparation[] = [];
  frames.forEach((frame, i) => {
    for (const stoppage of frame.stoppages ?? []) {
      const kick = i * 60 + Math.min(60, stoppage.kick);
      const settled = Math.min(kick, i * 60 + stoppage.settled);
      const dead = Math.min(settled, i * 60 + stoppage.dead);
      // A stoppage inside the last one (never recorded) keeps running speed.
      if (dead < (beats.at(-1)?.to ?? 0)) continue;
      const incidents: MatchEvent[] = [];
      for (let j = Math.max(0, Math.floor(dead / 60)); j <= i; j++)
        for (const event of frames[j]?.events ?? []) {
          const at = j * 60 + event.t;
          if (INCIDENTS.includes(event.kind) && at >= dead && at <= kick) incidents.push(event);
        }
      if (settled > dead)
        beats.push({ from: dead, to: settled, factor: C.rushFactor, ms: C.rushMaxMs });
      if (kick > settled)
        beats.push({
          from: settled,
          to: kick,
          factor: 1,
          ms: incidents.length ? C.beatMs.incident : C.beatMs[stoppage.kind],
          beat: { kind: stoppage.kind, incidents },
        });
    }
  });
  return beats;
}

/** The still beat under way at running second `seconds`, if any (→WEB-32's caption). */
export function beatAt(beats: readonly Preparation[], seconds: number) {
  const beat = beats[preparationAfter(beats, seconds)];
  return beat?.beat && beat.from <= seconds ? beat : undefined;
}

/** One caption line: a locale key and the names it shows. */
export interface Caption {
  key: string;
  params: Record<string, string>;
}

/**
 * A still beat's caption lines (→WEB-32): one per card, injury or substitution in its stoppage, in
 * order, as locale keys with the players' names (`name` resolves an ID).
 */
export function beatCaptions(
  beat: Preparation | undefined,
  name: (id: string) => string,
): Caption[] {
  return (beat?.beat?.incidents ?? []).map((event): Caption =>
    event.kind === 'sub'
      ? {
          key: 'match.stoppage.sub',
          params: { out: name(event.actor), in: name(event.receiver ?? '') },
        }
      : {
          key:
            event.kind === 'injury'
              ? 'match.stoppage.injury'
              : event.card === 'red'
                ? 'match.stoppage.red'
                : 'match.stoppage.yellow',
          params: { player: name(event.actor) },
        },
  );
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

/** The clock's rate inside `preparation` at `speed`: its least multiple of running, its span in its time at most. */
const preparationRate = (preparation: Preparation, speed: number) =>
  Math.max(
    preparation.factor * runningRate(speed),
    ((preparation.to - preparation.from) * speed) / preparation.ms,
  );

/**
 * The running seconds after `elapsedMs` of real time at `speed` from `seconds`, held between
 * kick-off and `length`. Running play advances at `runningRate(speed)`; inside a dead-ball segment
 * the clock runs at its own rate (`preparationRate`), so every route in it is scaled by one factor. The multiplier applies to the clock's advance only, so
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
