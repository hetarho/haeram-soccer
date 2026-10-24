import { describe, expect, it } from 'vitest';
import type { MatchFrame, MatchRecord } from '../../../../packages/contracts/src/types';
import {
  clockAt,
  locate,
  presentationAdvance,
  presentationLength,
  presentationSamples,
  runningSeconds,
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
    expect(presentationLength(95)).toBe(95 * 12000);
    expect(clockAt(60)).toBe(12000);
    for (const [from, to] of [
      [0, 15],
      [600, 615],
      [2700, 2715],
      [5400, 5415],
    ] as const)
      expect(clockAt(to) - clockAt(from)).toBeCloseTo(3000, 9);
    expect(runningSeconds(clockAt(1234.5))).toBeCloseTo(1234.5, 9);
    // At each speed a minute takes 12000 / speed real ms, whatever happens in it.
    const length = presentationLength(2);
    for (const speed of WATCH_SPEEDS)
      expect(presentationAdvance(0, 12000 / speed, speed, length)).toBeCloseTo(12000, 9);
    // Every speed reaches the final whistle and stays there.
    expect(presentationAdvance(length - 10, 100, 16, length)).toBe(length);
    expect(presentationAdvance(0, -5, 1, length)).toBe(0);
  });

  it('matches open at 2x', () => {
    expect(WATCH_DEFAULT_SPEED).toBe(2);
    expect(WATCH_SPEEDS).toContain(WATCH_DEFAULT_SPEED);
    // At the opening speed a minute takes 6 real seconds: a 95-minute match about 9½ minutes.
    expect(presentationAdvance(0, 6000, WATCH_DEFAULT_SPEED, presentationLength(95))).toBe(
      clockAt(60),
    );
  });

  it('changes speed without a time jump', () => {
    let clock = presentationAdvance(0, 2500, 1, 360000);
    const before = runningSeconds(clock);
    // Switching speed reads the same clock: no frame of real time has passed, so nothing moves.
    for (const speed of WATCH_SPEEDS)
      expect(presentationAdvance(clock, 0, speed, 360000)).toBe(clock);
    clock = presentationAdvance(clock, 100, 16, 360000);
    // 100 ms at 16x are 1.6 s of the 1x clock: 8 match seconds after the switch, not a restart.
    expect(runningSeconds(clock) - before).toBeCloseTo((1600 / WATCH_MINUTE_MS) * 60, 9);
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
    // Minute 1 holds a 30-second dead ball (10–40); minute 2 30 seconds of open play (70–100).
    const at = (i: number, t: number) => clockAt(runningTime(i, frames[i]!, t, 0));
    expect(at(0, 40) - at(0, 10)).toBeCloseTo(WATCH_MINUTE_MS / 2, 9);
    expect(at(1, 100) - at(1, 70)).toBeCloseTo(WATCH_MINUTE_MS / 2, 9);
    expect(at(1, 60) - at(0, 0)).toBeCloseTo(WATCH_MINUTE_MS, 9);
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
    expect(presentationLength(legacy.length)).toBe(90 * WATCH_MINUTE_MS);
  });
});
