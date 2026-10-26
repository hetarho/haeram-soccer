import { describe, expect, it } from 'vitest';
import type {
  FrameStoppage,
  MatchEvent,
  MatchFrame,
  MatchRecord,
} from '../../../../packages/contracts/src/types';
import { seekGoalFeedback } from './goalFeedback';
import {
  beatAt,
  beatCaptions,
  DEAD_BALL_CONFIG,
  deadBallBeats,
  locate,
  presentationAdvance,
  presentationMs,
  presentationSamples,
  runningLength,
  runningRate,
  runningTime,
  WATCH_DEFAULT_SPEED,
  WATCH_MINUTE_MS,
  WATCH_SPEEDS,
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
    const preparations = deadBallBeats(frames);
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
    expect(deadBallBeats(legacy)).toEqual([]);
    expect(presentationMs(0, runningLength(legacy.length), 1)).toBeCloseTo(90 * WATCH_MINUTE_MS, 6);
  });
});

/** A recorded event `t` seconds into its minute: only what the beat reads is filled. */
const event = (
  t: number,
  kind: MatchEvent['kind'],
  actor: string,
  extra: Partial<MatchEvent> = {},
): MatchEvent => ({ t, kind, side: 0, actor, from: [50, 50], to: [50, 50], text: '', ...extra });

/** Timed minutes `0…count - 1` (samples every 10 s); `stoppages` and `events` go to the minute they name. */
function stoppageFrames(
  count: number,
  stoppages: [number, FrameStoppage][] = [],
  events: [number, MatchEvent][] = [],
): MatchFrame[] {
  return Array.from({ length: count }, (_, i) => {
    const start = i * 60;
    const mine = stoppages.filter(([at]) => at === i).map(([, st]) => st);
    return {
      ...timedFrame(
        i + 1,
        1,
        start,
        [10, 20, 30, 40, 50, 60].map((t) => start + t),
        [[start + 60, 50, 50, 0]],
      ),
      events: events.filter(([at]) => at === i).map(([, e]) => e),
      ...(mine.length ? { stoppages: mine } : {}),
    };
  });
}
const stop = (
  kind: FrameStoppage['kind'],
  dead: number,
  settled: number,
  kick: number,
): FrameStoppage => ({ kind, dead, settled, kick });

describe('dead-ball beat (→WEB-32, MATCH-12)', () => {
  const C = DEAD_BALL_CONFIG;
  it('a throw-in rushes at twice running speed then holds its beat', () => {
    const frames = stoppageFrames(1, [[0, stop('throwIn', 10, 14, 26)]]);
    const beats = deadBallBeats(frames);
    expect(beats).toEqual([
      { from: 10, to: 14, factor: C.rushFactor, ms: C.rushMaxMs },
      {
        from: 14,
        to: 26,
        factor: 1,
        ms: C.beatMs.throwIn,
        beat: { kind: 'throwIn', incidents: [] },
      },
    ]);
    // The rush: 4 s at twice the running rate; the beat: 12 s of standing in 0.4 s.
    expect(presentationMs(10, 14, 1, beats)).toBeCloseTo(4 / (2 * runningRate(1)), 6);
    expect(presentationMs(14, 26, 1, beats)).toBeCloseTo(C.beatMs.throwIn, 6);
    // Running play around it keeps its speed.
    expect(presentationMs(0, 10, 1, beats)).toBeCloseTo(10 / runningRate(1), 6);
    expect(presentationMs(26, 60, 1, beats)).toBeCloseTo(34 / runningRate(1), 6);
  });

  it('the rush is capped at 1.5 s at 1x and halves at 2x', () => {
    // The ball went dead 20 s before this minute; everyone stood 40 s later.
    const frames = stoppageFrames(2, [[1, stop('corner', -20, 20, 32)]]);
    const beats = deadBallBeats(frames);
    expect(beats[0]).toMatchObject({ from: 40, to: 80 });
    expect(C.rushMaxMs).toBe(1500);
    expect(presentationMs(40, 80, 1, beats)).toBeCloseTo(1500, 6);
    expect(presentationMs(40, 80, 2, beats)).toBeCloseTo(750, 6);
    expect(presentationAdvance(40, 1500, 1, runningLength(frames.length), beats)).toBeCloseTo(
      80,
      6,
    );
  });

  it('beats by kind at 1x and 2x', () => {
    const kinds = Object.keys(C.beatMs).filter((k) => k !== 'incident') as FrameStoppage['kind'][];
    for (const kind of kinds) {
      const beats = deadBallBeats(stoppageFrames(1, [[0, stop(kind, 5, 10, 40)]]));
      expect(beats[1]!.beat!.kind).toBe(kind);
      for (const speed of [1, 2])
        expect(presentationMs(10, 40, speed, beats)).toBeCloseTo(C.beatMs[kind] / speed, 6);
    }
  });

  it('a stoppage shorter than its beat plays at running speed', () => {
    const beats = deadBallBeats(stoppageFrames(1, [[0, stop('throwIn', 10, 10.5, 11)]]));
    // Half a second of standing is 100 ms at running speed, under the 400 ms beat.
    expect(presentationMs(10.5, 11, 1, beats)).toBeCloseTo(0.5 / runningRate(1), 6);
    for (const speed of WATCH_SPEEDS)
      expect(presentationMs(10, 11, speed, beats)).toBeLessThanOrEqual(
        presentationMs(10, 11, speed) + 1e-6,
      );
  });

  it('an injury in a stoppage takes the incident beat and its caption', () => {
    const frames = stoppageFrames(
      1,
      [[0, stop('dropBall', 10, 15, 40)]],
      [
        [0, event(10, 'card', 'a4', { card: 'yellow' })],
        [0, event(12, 'injury', 'h7')],
        [0, event(12, 'sub', 'h7', { receiver: 'h15' })],
        [0, event(50, 'card', 'a5', { card: 'red' })],
      ],
    );
    const beats = deadBallBeats(frames);
    const [, beat] = beats;
    expect(beat!.ms).toBe(C.beatMs.incident);
    expect(beat!.beat!.incidents.map((e) => e.kind)).toEqual(['card', 'injury', 'sub']);
    expect(presentationMs(15, 40, 1, beats)).toBeCloseTo(C.beatMs.incident, 6);
    // The caption shows through the beat, not during the rush.
    expect(beatAt(beats, 12)).toBeUndefined();
    expect(beatAt(beats, 20)).toBe(beat);
    expect(beatAt(beats, 40)).toBeUndefined();
    const names = new Map([
      ['a4', '김수비'],
      ['h7', '이공격'],
      ['h15', '박교체'],
    ]);
    expect(beatCaptions(beat, (id) => names.get(id) ?? '')).toEqual([
      { key: 'match.stoppage.yellow', params: { player: '김수비' } },
      { key: 'match.stoppage.injury', params: { player: '이공격' } },
      { key: 'match.stoppage.sub', params: { out: '이공격', in: '박교체' } },
    ]);
  });

  it('frames without stoppages run at running speed', () => {
    const frames = stoppageFrames(2);
    expect(deadBallBeats(frames)).toEqual([]);
    expect(presentationMs(0, 120, 1, deadBallBeats(frames))).toBeCloseTo(2 * WATCH_MINUTE_MS, 6);
  });

  it('a speed change inside a beat keeps the match second', () => {
    const frames = stoppageFrames(1, [[0, stop('corner', 5, 10, 40)]]);
    const beats = deadBallBeats(frames);
    const length = runningLength(frames.length);
    const inside = presentationAdvance(10, 500, 1, length, beats);
    expect(inside).toBeCloseTo(10 + (30 * 500) / C.beatMs.corner, 6);
    for (const speed of WATCH_SPEEDS)
      expect(presentationAdvance(inside, 0, speed, length, beats)).toBe(inside);
    // At 2x the rest of the beat takes half its real time.
    const rest = presentationMs(inside, 40, 2, beats);
    expect(rest).toBeCloseTo((C.beatMs.corner - 500) / 2, 6);
  });

  it('seeking into a beat lands on that match second', () => {
    const frames = stoppageFrames(1, [[0, stop('freeKick', 5, 12, 36)]]);
    const beats = deadBallBeats(frames);
    const sought = seekGoalFeedback([], 20);
    expect(sought.seconds).toBe(20);
    const left = ((36 - 20) / (36 - 12)) * C.beatMs.freeKick;
    expect(presentationMs(sought.seconds, 36, 1, beats)).toBeCloseTo(left, 6);
    expect(
      presentationAdvance(sought.seconds, left, 1, runningLength(frames.length), beats),
    ).toBeCloseTo(36, 6);
  });

  it('frames, samples and ball times are read, never changed', () => {
    const frames = stoppageFrames(
      2,
      [
        [0, stop('goalKick', 5, 9, 20)],
        [1, stop('kickoff', -10, 5, 15)],
      ],
      [[0, event(30, 'sub', 'h2', { receiver: 'h14' })]],
    );
    const before = JSON.stringify(frames);
    const beats = deadBallBeats(frames);
    const length = runningLength(frames.length);
    for (let seconds = 0; seconds < length;)
      seconds = presentationAdvance(seconds, 16, 1, length, beats);
    presentationMs(0, length, 2, beats);
    presentationSamples(frames);
    expect(JSON.stringify(frames)).toBe(before);
  });
});
