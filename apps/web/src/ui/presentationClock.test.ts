import { describe, expect, it } from 'vitest';
import type {
  MatchEvent,
  MatchFrame,
  MatchMotionSample,
  MatchRecord,
} from '../../../../packages/contracts/src/types';
import { seekGoalFeedback } from './goalFeedback';
import {
  locate,
  presentationAdvance,
  presentationMs,
  presentationSamples,
  runningLength,
  runningRate,
  runningTime,
  SET_PIECE_PREPARATION_MS,
  setPiecePreparations,
  WATCH_DEFAULT_SPEED,
  WATCH_MINUTE_MS,
  WATCH_SPEEDS,
  type Preparation,
} from './presentationClock';
import { archivePlayback } from './replay';

/** A small timed minute: its start, its sample times and its ball knots (→MATCH-12). */
function timedFrame(
  minute: number,
  period: 1 | 2,
  start: number,
  samples: number[],
  ball: [number, number, number, number][],
  pace = 1,
): MatchFrame {
  return {
    minute,
    score: { home: 0, away: 0 },
    metrics: [[], []],
    ball: [50, 50],
    side: 0,
    player: 0,
    action: '패스',
    period,
    label: String(minute),
    pace,
    onPitch: [[], []],
    startSeconds: start,
    motion: samples.map((t) => ({ elapsedSeconds: t, ball: [50, 50], players: [[], []] })),
    ballTrack: ball.map(([, x, y, h]) => [x, y, h]),
    ballTimes: ball.map(([t]) => t),
  };
}

describe('presentation clock (→WEB-32)', () => {
  it('1x lasts 12 s a match minute', () => {
    expect(WATCH_MINUTE_MS).toBe(12000);
    expect(WATCH_SPEEDS).toEqual([1, 2, 4, 8, 16]);
    // Every minute lasts 12 s at 1x, so any 60 match seconds take 12 s and 15 take 3 s.
    expect(runningLength(95)).toBe(95 * 60);
    expect(presentationMs(0, runningLength(95), 1)).toBeCloseTo(95 * 12000, 6);
    expect(presentationMs(0, 60, 1)).toBeCloseTo(12000, 9);
    for (const from of [0, 600, 2700, 5400])
      expect(presentationMs(from, from + 15, 1)).toBeCloseTo(3000, 9);
    // At each speed a minute takes 12000 / speed real ms, whatever happens in it.
    const length = runningLength(2);
    for (const speed of WATCH_SPEEDS) {
      expect(runningRate(speed)).toBeCloseTo((speed * 60) / 12000, 12);
      expect(presentationAdvance(0, 12000 / speed, speed, length)).toBeCloseTo(60, 9);
    }
    // Every speed reaches the final whistle and stays there; real time never runs it backwards.
    expect(presentationAdvance(length - 1, 100, 16, length)).toBe(length);
    expect(presentationAdvance(0, -5, 1, length)).toBe(0);
    expect(presentationAdvance(30, -5, 1, length)).toBe(30);
  });

  it('matches open at 2x', () => {
    expect(WATCH_DEFAULT_SPEED).toBe(2);
    expect(WATCH_SPEEDS).toContain(WATCH_DEFAULT_SPEED);
    // At the opening speed a minute takes 6 real seconds: a 95-minute match about 9½ minutes.
    expect(presentationAdvance(0, 6000, WATCH_DEFAULT_SPEED, runningLength(95))).toBeCloseTo(60, 9);
  });

  it('changes speed without a time jump', () => {
    const length = runningLength(30);
    let seconds = presentationAdvance(0, 2500, 1, length);
    const before = seconds;
    // Switching speed reads the same clock: no frame of real time has passed, so nothing moves.
    for (const speed of WATCH_SPEEDS)
      expect(presentationAdvance(seconds, 0, speed, length)).toBe(seconds);
    seconds = presentationAdvance(seconds, 100, 16, length);
    // 100 ms at 16x are 8 match seconds after the switch, not a restart.
    expect(seconds - before).toBeCloseTo(100 * runningRate(16), 9);
    expect(seconds - before).toBeCloseTo(8, 9);
  });

  it('keeps dead-ball and open-play multipliers equal', () => {
    // Old weights (1.6 for a chance, 0.6 for build-up) are ignored: the clock reads no pace.
    const frames = [
      timedFrame(
        1,
        1,
        0,
        [10, 40, 60],
        [
          [5, 10, 50, 0],
          [60, 20, 50, 0],
        ],
        0.6,
      ),
      timedFrame(
        2,
        1,
        60,
        [70, 100, 120],
        [
          [75, 30, 50, 0],
          [120, 40, 50, 0],
        ],
        1.6,
      ),
    ];
    // Minute 1 holds a 30-second dead ball (10–40) without a set piece after it; minute 2 30
    // seconds of open play (70–100).
    const at = (i: number, t: number) => runningTime(i, frames[i]!, t, 0);
    const preparations = setPiecePreparations(frames);
    expect(preparations).toEqual([]);
    expect(presentationMs(at(0, 10), at(0, 40), 1, preparations)).toBeCloseTo(6000, 9);
    expect(presentationMs(at(1, 70), at(1, 100), 1, preparations)).toBeCloseTo(6000, 9);
    expect(presentationMs(at(0, 0), at(1, 60), 1, preparations)).toBeCloseTo(12000, 9);
    const { times } = presentationSamples(frames);
    expect(times).toEqual([10, 40, 60, 70, 100, 120]);
  });

  it('renders arrival before the next kick', () => {
    // A pass kicked at 12.0 s arrives at 13.5 s; the next kick is at 14.0 s (ball knots, →MATCH-12).
    const frame = timedFrame(
      1,
      1,
      0,
      [12, 13.5, 14, 60],
      [
        [12, 20, 50, 0],
        [12.75, 30, 50, 2],
        [13.5, 40, 50, 0],
        [14, 40, 50, 0],
        [60, 60, 50, 0],
      ],
    );
    const { track, trackTimes, trackBreak } = presentationSamples([frame]);
    const ballAt = (t: number) => {
      const g = locate(trackTimes, t, trackBreak);
      const a = track[Math.floor(g)]!,
        b = track[Math.ceil(g)]!,
        f = g - Math.floor(g);
      return a.map((v, i) => v * (1 - f) + b[i]! * f);
    };
    const expectAt = (t: number, point: number[]) =>
      ballAt(t).forEach((v, i) => expect(v, `${t}`).toBeCloseTo(point[i]!, 9));
    // The flight takes its full 1.5 s and is at the receiver on arrival, never shortened.
    expectAt(12, [20, 50, 0]);
    expectAt(12.75, [30, 50, 2]);
    expectAt(13.5, [40, 50, 0]);
    expectAt(13.8, [40, 50, 0]);
    expect(ballAt(13)[0]).toBeGreaterThan(30);
    expect(ballAt(13)[0]).toBeLessThan(40);
  });

  it('preserves minute-boundary continuity', () => {
    const frames = [
      timedFrame(
        45,
        1,
        2640,
        [2650, 2700],
        [
          [2650, 10, 50, 0],
          [2700, 30, 50, 0],
        ],
      ),
      timedFrame(
        45,
        1,
        2700,
        [2730, 2760],
        [
          [2730, 50, 50, 0],
          [2760, 60, 50, 0],
        ],
      ),
      // The second half starts later, at its own whistle: a transition, not running play.
      timedFrame(
        46,
        2,
        2790,
        [2800, 2820],
        [
          [2800, 50, 50, 0],
          [2820, 80, 50, 0],
        ],
      ),
    ];
    const { times, sampleBreak, trackTimes, trackBreak } = presentationSamples(frames);
    expect(times).toEqual([10, 60, 90, 120, 130, 150]);
    expect(trackTimes).toEqual(times);
    // Inside a period the minutes join: the ball moves on across the boundary without a jump.
    expect(locate(trackTimes, 60, trackBreak)).toBe(1);
    expect(locate(trackTimes, 75, trackBreak)).toBeCloseTo(1.5, 9);
    expect(locate(times, 75, sampleBreak)).toBeCloseTo(1.5, 9);
    // Across the change of ends nothing is interpolated: the first half's end holds until the
    // second half's opening is drawn.
    expect(locate(times, 125, sampleBreak)).toBe(3);
    expect(locate(times, 130, sampleBreak)).toBe(4);
    expect(locate(trackTimes, 125, trackBreak)).toBe(3);
    expect(locate(trackTimes, 140, trackBreak)).toBeCloseTo(4.5, 9);
  });

  it('reads legacy frames without inventing missing detail', () => {
    const record = {
      score: { home: 1, away: 0 },
      metrics: [Array(12).fill(0), Array(12).fill(0)],
      highlights: [{ minute: 30, side: 0, player: '김', action: '골' }],
    } as unknown as MatchRecord;
    const legacy = archivePlayback(record).frames;
    expect(legacy.every((f) => f.startSeconds === undefined && !f.ballTimes)).toBe(true);
    const { samples, times, track } = presentationSamples(legacy);
    // One recorded point per minute, at its end; no ball flight is made up between them.
    expect(samples).toHaveLength(90);
    expect(times).toEqual(legacy.map((_, i) => i * 60 + 60));
    expect(track).toEqual([]);
    expect(samples[29]!.ball).toEqual([95, 50]);
    // An older observed playback without explicit times decodes its samples at equal intervals.
    const observed: MatchFrame = {
      ...legacy[0]!,
      motion: [1, 2, 3, 4].map((n) => ({
        elapsedSeconds: n * 14,
        ball: [50, 50],
        players: [[], []],
      })),
      ballTrack: [
        [1, 1, 0],
        [2, 2, 0],
      ],
    };
    const decoded = presentationSamples([observed]);
    expect(decoded.times).toEqual([15, 30, 45, 60]);
    expect(decoded.trackTimes).toEqual([30, 60]);
    // Legacy frames carry no events, so the whole match runs at the selected speed.
    expect(setPiecePreparations(legacy)).toEqual([]);
    expect(presentationMs(0, runningLength(legacy.length), 1)).toBeCloseTo(90 * WATCH_MINUTE_MS, 6);
  });
});

/** A recorded event `t` seconds into its minute: only what the preparation reads is filled. */
const event = (
  t: number,
  kind: MatchEvent['kind'],
  actor: string,
  extra: Partial<MatchEvent> = {},
): MatchEvent => ({ t, kind, side: 0, actor, from: [50, 50], to: [50, 50], text: '', ...extra });

/** A timed minute with its events, holders and samples (`[t, phase]`, seconds into the minute). */
function eventFrame(
  index: number,
  events: MatchEvent[],
  holders: [number, string][] = [],
  samples: [number, MatchMotionSample['phase']][] = [[60, 'possession']],
  period: 1 | 2 = 1,
): MatchFrame {
  const start = index * 60;
  return {
    ...timedFrame(
      index + 1,
      period,
      start,
      samples.map(([t]) => start + t),
      samples.map(([t], k) => [start + t, k * 10, 50, 0]),
    ),
    events,
    holders,
    motion: samples.map(([t, phase]) => ({
      elapsedSeconds: start + t,
      ball: [50, 50],
      players: [[], []],
      phase,
    })),
  };
}

/**
 * Pre-feature corner (seed `probe-pace`, 51′): the ball goes out at 9.8 s, the trace holds the whole
 * preparation in the restart's step, the taker has the ball at 41.8 s, kicks at 43 s, and the
 * restart event is timed at the delivery's arrival, 45 s: a 32 s dead interval and a 3.2 s kick.
 */
const preFeatureCorner = () => [
  eventFrame(
    0,
    [
      event(6.1, 'pass', 'a8', { side: 1 }),
      event(9.8, 'pass', 'a14', { side: 1, ok: false, lost: true }),
      event(45, 'restart', 'h10', { restart: 'corner', receiver: 'h9' }),
      event(48, 'cross', 'h9'),
    ],
    [
      [0, ''],
      [6.1, 'a14'],
      [6.5, ''],
      [41.8, 'h10'],
      [43, ''],
      [45, 'h9'],
      [47.7, ''],
    ],
    [
      [6.06, 'possession'],
      [9.76, 'restart'],
      [16.51, 'restart'],
      [41.76, 'possession'],
      [42.98, 'restart'],
      [44.96, 'possession'],
      [60, 'restart'],
    ],
  ),
];

/**
 * Candidate corner (seed `set-piece-defence-2`, 4′–5′): a blocked shot goes out at 45.4 s of one
 * minute, the participants walk in and wait, the kick is recorded as its own restart sample 17.43 s
 * into the next minute, and the restart event is timed at the delivery's landing with the receiver,
 * 19.7 s: a 32.03 s dead interval across the minute boundary. The taker never appears as a holder.
 */
const candidateCorner = () => [
  eventFrame(
    0,
    [
      event(43.3, 'pass', 'a9', { side: 1, receiver: 'a7' }),
      event(45.4, 'shot', 'a7', { side: 1, outcome: 'block' }),
    ],
    [
      [43.3, 'a7'],
      [45.1, ''],
    ],
    [
      [43.29, 'possession'],
      [45.43, 'restart'],
      [53.58, 'restart'],
      [60, 'restart'],
    ],
  ),
  eventFrame(
    1,
    [
      event(19.7, 'restart', 'a8', { side: 1, restart: 'corner', receiver: 'a10' }),
      event(22.1, 'pass', 'a10', { side: 1, receiver: 'a5' }),
    ],
    [
      [0, ''],
      [19.7, 'a10'],
      [21, ''],
      [22.1, 'a5'],
    ],
    [
      [17.43, 'restart'],
      [19.73, 'possession'],
      [22.12, 'possession'],
      [60, 'possession'],
    ],
  ),
];

describe('set-piece preparation (→WEB-32, MATCH-12)', () => {
  it('reads where a corner preparation begins and ends on each model', () => {
    // Pre-feature: from the ball going out to the taker on the ball, before the restart's arrival.
    const pre = setPiecePreparations(preFeatureCorner());
    expect(pre).toHaveLength(1);
    expect(pre[0]!.from).toBeCloseTo(9.8, 9);
    expect(pre[0]!.to).toBeCloseTo(41.8, 9);
    // Candidate: from the blocked shot to the recorded kick sample, in the next minute.
    const candidate = setPiecePreparations(candidateCorner());
    expect(candidate).toHaveLength(1);
    expect(candidate[0]!.from).toBeCloseTo(45.4, 9);
    expect(candidate[0]!.to).toBeCloseTo(77.43, 9);
    // A taker who plays the ball to himself is a holder at the landing, not at the kick.
    const tapped = [
      eventFrame(
        0,
        [
          event(4, 'foul', 'a4', { side: 1, opponent: 'h5' }),
          event(30, 'restart', 'h5', { restart: 'freeKick', receiver: 'h5' }),
        ],
        [
          [3, 'h5'],
          [4, ''],
          [30, 'h5'],
        ],
        [
          [6, 'restart'],
          [27, 'restart'],
          [30, 'possession'],
        ],
      ),
    ];
    expect(setPiecePreparations(tapped)).toEqual([{ from: 4, to: 27 }]);
  });

  it('a 32 s corner preparation takes 1.5 real s at 1x and 2x', () => {
    const frames = preFeatureCorner();
    const preparations = setPiecePreparations(frames);
    const [{ from, to }] = preparations as [Preparation];
    const length = runningLength(frames.length);
    expect(SET_PIECE_PREPARATION_MS).toBe(1500);
    for (const speed of [1, 2]) {
      expect(presentationMs(from, to, speed, preparations)).toBeCloseTo(1500, 6);
      expect(presentationAdvance(from, 1500, speed, length, preparations)).toBeCloseTo(to, 6);
      // One factor for the whole interval: half the real time is half the walk-in.
      expect(presentationAdvance(from, 750, speed, length, preparations)).toBeCloseTo(
        (from + to) / 2,
        6,
      );
      // The kick and delivery (3.2 s to the arrival) and the play before it keep running speed.
      expect(presentationMs(to, 45, speed, preparations)).toBeCloseTo(3.2 / runningRate(speed), 6);
      expect(presentationMs(0, from, speed, preparations)).toBeCloseTo(
        from / runningRate(speed),
        6,
      );
    }
    // The same on the candidate's 32 s across a minute boundary, its delivery at running speed.
    const candidate = setPiecePreparations(candidateCorner());
    for (const speed of [1, 2]) {
      expect(presentationMs(45.4, 77.43, speed, candidate)).toBeCloseTo(1500, 6);
      expect(presentationMs(77.43, 79.7, speed, candidate)).toBeCloseTo(
        2.27 / runningRate(speed),
        6,
      );
    }
  });

  it('at 16x a preparation shorter at running speed keeps running speed', () => {
    const preparations = setPiecePreparations(preFeatureCorner());
    const [{ from, to }] = preparations as [Preparation];
    // 32 s at 16x take 400 ms of running play, already under 1.5 s.
    expect(presentationMs(from, to, 16, preparations)).toBeCloseTo(400, 6);
    expect(presentationMs(from, to, 16, preparations)).toBeCloseTo(presentationMs(from, to, 16), 9);
    // 4x and 8x of a 32 s preparation: 1.6 s is drawn in 1.5 s, 0.8 s stays 0.8 s.
    expect(presentationMs(from, to, 4, preparations)).toBeCloseTo(1500, 6);
    expect(presentationMs(from, to, 8, preparations)).toBeCloseTo(800, 6);
    // A preparation longer than 1.5 s at 16x (150 s) is still drawn in 1.5 s.
    const long = [{ from: 0, to: 150 }];
    expect(presentationMs(0, 150, 16, long)).toBeCloseTo(1500, 6);
  });

  it('throw-ins, kick-offs and penalties keep running speed', () => {
    const frames = [
      eventFrame(0, [
        event(10, 'shot', 'h9', { outcome: 'goal' }),
        event(40, 'restart', 'a10', { side: 1, restart: 'kickoff' }),
        event(45, 'pass', 'a10', { side: 1, ok: false, lost: true }),
        event(52, 'restart', 'h2', { restart: 'throwIn' }),
        event(55, 'foul', 'a4', { side: 1, opponent: 'h9' }),
        event(58, 'restart', 'h9', { restart: 'penalty' }),
      ]),
    ];
    expect(setPiecePreparations(frames)).toEqual([]);
    expect(presentationMs(0, 60, 1, setPiecePreparations(frames))).toBeCloseTo(12000, 9);
    // A card shown after a foul keeps running speed: the free kick's preparation starts after it.
    const booked = [
      eventFrame(
        0,
        [
          event(5, 'foul', 'a4', { side: 1, opponent: 'h5' }),
          event(8, 'card', 'a4', { side: 1, card: 'yellow' }),
          event(30, 'restart', 'h5', { restart: 'freeKick' }),
        ],
        [
          [4, 'h5'],
          [5, ''],
          [28, 'h5'],
        ],
      ),
    ];
    expect(setPiecePreparations(booked)).toEqual([{ from: 8, to: 28 }]);
    // A goal kick ends its preparation at its recorded kick sample; without a recorded kick (an
    // older playback) the restart keeps running speed.
    const goalKick = (samples?: [number, MatchMotionSample['phase']][]) => [
      eventFrame(
        0,
        [
          event(20, 'shot', 'a9', { side: 1, outcome: 'miss' }),
          event(46, 'restart', 'h1', { restart: 'goalKick' }),
        ],
        [],
        samples,
      ),
    ];
    expect(
      setPiecePreparations(
        goalKick([
          [22, 'restart'],
          [44, 'restart'],
          [46.5, 'possession'],
        ]),
      ),
    ).toEqual([{ from: 20, to: 44 }]);
    expect(setPiecePreparations(goalKick())).toEqual([]);
  });

  it('a speed change inside a preparation keeps the match second', () => {
    const frames = preFeatureCorner();
    const preparations = setPiecePreparations(frames);
    const [{ from, to }] = preparations as [Preparation];
    const length = runningLength(frames.length);
    const inside = presentationAdvance(from, 500, 1, length, preparations);
    expect(inside).toBeCloseTo(from + (to - from) / 3, 6);
    // No real time has passed, so a new speed leaves the presented second where it was.
    for (const speed of WATCH_SPEEDS)
      expect(presentationAdvance(inside, 0, speed, length, preparations)).toBe(inside);
    // 2x keeps the preparation's own rate; 16x runs on at its faster running rate.
    expect(presentationAdvance(inside, 500, 2, length, preparations)).toBeCloseTo(
      from + (2 * (to - from)) / 3,
      6,
    );
    expect(presentationAdvance(inside, 100, 16, length, preparations)).toBeCloseTo(inside + 8, 6);
    // Leaving the preparation mid-update continues at running speed for the rest of the real time.
    expect(presentationAdvance(inside, 1500, 1, length, preparations)).toBeCloseTo(
      to + 500 * runningRate(1),
      6,
    );
  });

  it('seeking into a preparation lands on that match second', () => {
    const frames = preFeatureCorner();
    const preparations = setPiecePreparations(frames);
    const [{ from, to }] = preparations as [Preparation];
    const { samples } = presentationSamples(frames);
    // The walk-in sample at 16.51 s lies inside the preparation; a seek goes to its match second.
    const walk = samples.find((sample) => sample.time > from && sample.time < to)!;
    expect(walk.time).toBeCloseTo(16.51, 9);
    const sought = seekGoalFeedback([], walk.time);
    expect(sought.seconds).toBe(walk.time);
    // Playback resumes from there at the preparation's rate, reaching the kick in its share of 1.5 s.
    const left = ((to - walk.time) / (to - from)) * SET_PIECE_PREPARATION_MS;
    expect(presentationMs(sought.seconds, to, 1, preparations)).toBeCloseTo(left, 6);
    expect(
      presentationAdvance(sought.seconds, left, 1, runningLength(frames.length), preparations),
    ).toBeCloseTo(to, 6);
  });

  it('frames, samples and ball times are read, never changed', () => {
    for (const frames of [preFeatureCorner(), candidateCorner()]) {
      const before = JSON.stringify(frames);
      const timed = presentationSamples(frames);
      const preparations = setPiecePreparations(frames);
      const length = runningLength(frames.length);
      for (let seconds = 0; seconds < length;)
        seconds = presentationAdvance(seconds, 16, 1, length, preparations);
      presentationMs(0, length, 2, preparations);
      expect(JSON.stringify(frames)).toBe(before);
      // Samples and ball knots keep their recorded match seconds; only the real time drawn changes.
      const recorded = (times: number[], i: number, frame: MatchFrame) =>
        times.map((t) => i * 60 + t - frame.startSeconds!);
      const samples = frames.flatMap((f, i) =>
        recorded(
          f.motion!.map((m) => m.elapsedSeconds),
          i,
          f,
        ),
      );
      const knots = frames.flatMap((f, i) => recorded(f.ballTimes!, i, f));
      expect(timed.times).toHaveLength(samples.length);
      timed.times.forEach((t, k) => expect(t).toBeCloseTo(samples[k]!, 9));
      expect(timed.trackTimes).toHaveLength(knots.length);
      timed.trackTimes.forEach((t, k) => expect(t).toBeCloseTo(knots[k]!, 9));
    }
  });
});
