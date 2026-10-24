import { describe, expect, it } from 'vitest';
import type {
  MatchEvent,
  MatchFrame,
  MatchMotionSample,
  PlayerMotion,
} from '../../../../packages/contracts/src/types';
import { advanceGoalFeedback, goalInstants } from './goalFeedback';
import { possessionKey, resolvePossessionCue } from './possessionCue';
import {
  locate,
  presentationLength,
  presentationSamples,
  runningSeconds,
  WATCH_MINUTE_MS,
  type PresentationSample,
} from './presentationClock';
import type { MatchRecord } from '../../../../packages/contracts/src/types';

const player = (id: string, position: [number, number]) =>
  ({ id, position, intent: position, state: 'shape' }) as PlayerMotion;
const players: [PlayerMotion[], PlayerMotion[]] = [
  [player('h-keeper', [5, 50]), player('h9', [60, 50])],
  [player('a-keeper', [95, 50]), player('a4', [62, 52])],
];
const sample = (extra: Partial<PresentationSample> = {}): PresentationSample => ({
  frame: 0,
  ball: [50, 50],
  players,
  within: 0.5,
  time: 30,
  ...extra,
});
const event = (t: number, kind: MatchEvent['kind'], side: 0 | 1, extra = {}): MatchEvent => ({
  t,
  kind,
  side,
  actor: side === 0 ? 'h9' : 'a4',
  from: [50, 50],
  to: [70, 50],
  text: '',
  ...extra,
});
function frame(events: MatchEvent[], extra: Partial<MatchFrame> = {}): MatchFrame {
  return {
    minute: 1,
    score: { home: 0, away: 0 },
    metrics: [[], []],
    ball: [50, 50],
    side: 0,
    player: 0,
    action: '패스',
    period: 1,
    label: '1',
    pace: 1,
    onPitch: [[], []],
    events,
    ...extra,
  };
}

describe('possession cue', () => {
  it('home carrier', () => {
    expect(resolvePossessionCue(sample(), frame([event(35, 'carry', 0)]), 30)).toEqual({
      state: 'carrier',
      side: 0,
      carrierId: 'h9',
    });
  });

  it('away carrier', () => {
    expect(resolvePossessionCue(sample(), frame([event(34, 'takeOn', 1)]), 30)).toEqual({
      state: 'carrier',
      side: 1,
      carrierId: 'a4',
    });
  });

  it('keeper ownership', () => {
    const keeperRun = event(36, 'carry', 1, { actor: 'a-keeper' });
    expect(resolvePossessionCue(sample(), frame([keeperRun]), 30)).toEqual({
      state: 'carrier',
      side: 1,
      carrierId: 'a-keeper',
    });
    // A minute without events falls back to the sample's recorded owner.
    expect(resolvePossessionCue(sample({ ownerId: 'h-keeper' }), frame([]), 30)).toEqual({
      state: 'carrier',
      side: 0,
      carrierId: 'h-keeper',
    });
  });

  it('recorded flight side without a carrier', () => {
    // A pass's time is when the ball arrives, so until then it is the pass under way.
    const minute = frame([event(10, 'carry', 1), event(33, 'pass', 0, { receiver: 'h-keeper' })]);
    expect(resolvePossessionCue(sample({ ownerId: 'a4' }), minute, 30)).toEqual({
      state: 'flight',
      side: 0,
    });
    expect(resolvePossessionCue(sample(), frame([event(31, 'restart', 1)]), 30)).toEqual({
      state: 'flight',
      side: 1,
    });
  });

  it('contested ball clears ownership', () => {
    expect(resolvePossessionCue(sample(), frame([event(32, 'clearance', 1)]), 30)).toEqual({
      state: 'contested',
    });
    expect(resolvePossessionCue(sample({ phase: 'transition' }), frame([]), 30)).toEqual({
      state: 'contested',
    });
  });

  it('unknown history stays neutral', () => {
    // A sparse archived minute has no players: no side, no marker, whatever its leading side.
    const sparse = sample({ players: undefined, ownerId: 'h9' });
    expect(resolvePossessionCue(sparse, frame([], { side: 1 }), 60)).toEqual({ state: 'unknown' });
    expect(resolvePossessionCue(undefined, undefined, 0)).toEqual({ state: 'unknown' });
    // A stoppage, or an owner the presented players do not include, is not guessed either.
    expect(resolvePossessionCue(sample(), frame([event(31, 'foul', 1)]), 30)).toEqual({
      state: 'unknown',
    });
    expect(resolvePossessionCue(sample({ ownerId: 'stranger' }), frame([]), 30)).toEqual({
      state: 'unknown',
    });
  });

  it('turnover changes both cues', () => {
    const minute = frame([event(25, 'carry', 0), event(31, 'carry', 1)]);
    const before = resolvePossessionCue(sample(), minute, 20);
    const after = resolvePossessionCue(sample(), minute, 27);
    expect([before.side, before.carrierId]).toEqual([0, 'h9']);
    expect([after.side, after.carrierId]).toEqual([1, 'a4']);
    expect(possessionKey(after)).not.toBe(possessionKey(before));
  });

  it('seek and goal hold use presented facts', () => {
    // Minute 1: home carries, then scores at 30 s, away kicks off; minute 2: away carries.
    const motion = (elapsedSeconds: number): MatchMotionSample => ({
      elapsedSeconds,
      ball: [50, 50],
      players,
    });
    const frames = [
      frame(
        [event(20, 'carry', 0), event(30, 'shot', 0, { outcome: 'goal' }), event(45, 'kickoff', 1)],
        {
          score: { home: 1, away: 0 },
          startSeconds: 0,
          motion: [motion(10), motion(29), motion(31), motion(50)],
        },
      ),
      frame([event(10, 'carry', 1)], {
        minute: 2,
        label: '2',
        score: { home: 1, away: 0 },
        startSeconds: 60,
        motion: [motion(65), motion(90)],
      }),
    ];
    const { samples, times, sampleBreak } = presentationSamples(frames);
    const record = { highlights: [{ minute: 1, side: 0, player: 'H9', action: '골' }] };
    const goals = goalInstants(record as unknown as MatchRecord, frames, [10, 65]);
    const held = advanceGoalFeedback({ clockMs: 0, next: 0 }, goals, {
      elapsedMs: 10_000,
      speed: 16,
      lengthMs: presentationLength(2),
      running: true,
    });
    expect(held.cue).toBeDefined();
    const at = (clockMs: number) => {
      const now = runningSeconds(clockMs);
      const shown = samples[Math.floor(locate(times, now, sampleBreak) + 1e-6)];
      return resolvePossessionCue(shown, frames[shown!.frame], now - shown!.frame * 60);
    };
    // Held at the goal: the scoring shot is the presented action, not the kick-off after it; 15 s
    // earlier home still carries.
    expect(at(held.clockMs)).toEqual({ state: 'flight', side: 0 });
    expect(at(held.clockMs - WATCH_MINUTE_MS / 4)).toEqual({
      state: 'carrier',
      side: 0,
      carrierId: 'h9',
    });
    // A seek 6 s into the next minute reads that instant's action.
    expect(at(presentationLength(1) + WATCH_MINUTE_MS / 10)).toEqual({
      state: 'carrier',
      side: 1,
      carrierId: 'a4',
    });
  });

  it('minute leader is not current possession', () => {
    // The minute is led by the away side, but the action under way is a home player's.
    const minute = frame([event(35, 'carry', 0)], { side: 1 });
    expect(resolvePossessionCue(sample(), minute, 30).side).toBe(0);
    expect(
      resolvePossessionCue(sample({ phase: 'possession' }), frame([], { side: 1 }), 30),
    ).toEqual({ state: 'unknown' });
  });
  it('recorded holders mark a receiver on the ball before his pass is played', () => {
    // h9 receives at 20 s, holds it until his kick at 22.5 s; the pass lands at 24 s.
    const minute = frame([event(20, 'pass', 1, { actor: 'a4' }), event(24, 'pass', 0)], {
      holders: [
        [0, ''],
        [20, 'h9'],
        [22.5, ''],
        [24, 'a4'],
      ],
    });
    expect(resolvePossessionCue(sample(), minute, 21)).toEqual({
      state: 'carrier',
      side: 0,
      carrierId: 'h9',
    });
    // In flight: the sending side, no carrier.
    expect(resolvePossessionCue(sample(), minute, 23)).toEqual({ state: 'flight', side: 0 });
    expect(resolvePossessionCue(sample(), minute, 30).carrierId).toBe('a4');
  });

  it('a carry that lost the ball is contested while nobody holds it', () => {
    const minute = frame([event(26, 'carry', 0)], {
      holders: [
        [0, 'h9'],
        [24, ''],
      ],
    });
    expect(resolvePossessionCue(sample(), minute, 20).carrierId).toBe('h9');
    expect(resolvePossessionCue(sample(), minute, 25)).toEqual({ state: 'contested' });
  });

  it('a stale sample owner is ignored once holders are recorded', () => {
    const minute = frame([], { holders: [[0, '']] });
    expect(resolvePossessionCue(sample({ ownerId: 'h9' }), minute, 30)).toEqual({
      state: 'unknown',
    });
  });
});
