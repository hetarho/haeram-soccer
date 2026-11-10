import { describe, expect, it } from 'vitest';
import { fakePlayback, frameOf, kickOffPlace } from '../check/playback.testkit.ts';
import { PROTO_CONFIG } from '../core/config.ts';
import { PITCH } from '../core/pitch.ts';
import type { Beat, StageEvent } from '../core/types.ts';
import {
  captionAt,
  clockLabel,
  fitPitch,
  flashesAt,
  sampleAt,
  scoreAt,
  toCanvas,
} from './model.ts';

const hz = PROTO_CONFIG.hz;
const event = (
  t: number,
  kind: StageEvent['kind'],
  extra: Partial<StageEvent> = {},
): StageEvent => ({
  t,
  beat: 0,
  kind,
  team: 0,
  actor: 9,
  at: [60, 30],
  ...extra,
});
/** Frames every tenth of a second from 0 to `seconds`. */
const still = (seconds: number) =>
  Array.from({ length: Math.round(seconds * hz) + 1 }, (_, i) => frameOf(i / hz));

describe('viewer model', () => {
  it('sampleAt interpolates between frames and clamps at both ends', () => {
    const playback = fakePlayback({
      frames: [
        frameOf(0, { ball: [10, 10, 0], owner: 3, players: { 5: [20, 20] } }),
        frameOf(0.1, { ball: [20, 30, 2], owner: -1, players: { 5: [22, 24] } }),
      ],
    });
    const mid = sampleAt(playback, 0.05);
    expect(mid.ball[0]).toBeCloseTo(15);
    expect(mid.ball[1]).toBeCloseTo(20);
    expect(mid.ball[2]).toBeCloseTo(1);
    expect(mid.players[5].x).toBeCloseTo(21);
    expect(mid.players[5].y).toBeCloseTo(22);
    expect(mid.owner).toBe(3);
    const before = sampleAt(playback, -4);
    expect(before.t).toBe(0);
    expect(before.ball).toEqual([10, 10, 0]);
    const after = sampleAt(playback, 9);
    expect(after.t).toBeCloseTo(0.1);
    expect(after.ball).toEqual([20, 30, 2]);
    expect(after.owner).toBe(-1);
  });

  it('facing follows movement and is kept while standing', () => {
    const [x, y] = kickOffPlace(3);
    const playback = fakePlayback({
      frames: [
        frameOf(0, { players: { 3: [x, y] } }),
        frameOf(0.1, { players: { 3: [x, y - 1] } }),
        frameOf(0.2, { players: { 3: [x, y - 1] } }),
        frameOf(0.3, { players: { 3: [x, y - 1] } }),
      ],
    });
    const moving = sampleAt(playback, 0);
    expect(moving.players[3].fx).toBeCloseTo(0);
    expect(moving.players[3].fy).toBeCloseTo(-1);
    const standing = sampleAt(playback, 0.25);
    expect(standing.players[3].fx).toBeCloseTo(0);
    expect(standing.players[3].fy).toBeCloseTo(-1);
    // Nobody else ever moved: each faces the goal his team attacks.
    expect(standing.players[2].fx).toBeGreaterThan(0);
    expect(standing.players[13].fx).toBeLessThan(0);
  });

  it('clockLabel formats mm:ss', () => {
    expect(clockLabel(0)).toBe('00:00');
    expect(clockLabel(599.9)).toBe('09:59');
    expect(clockLabel(600)).toBe('10:00');
  });

  it('fitPitch shows the whole pitch centred with the same scale on both axes', () => {
    const pad = 3;
    for (const [w, h] of [
      [1000, 500],
      [600, 600],
    ]) {
      const view = fitPitch(w, h, pad);
      const [x0, y0] = toCanvas(view, [0, 0]);
      const [x1, y1] = toCanvas(view, [PITCH.length, PITCH.width]);
      expect(x1 - x0).toBeCloseTo(PITCH.length * view.scale);
      expect(y1 - y0).toBeCloseTo(PITCH.width * view.scale);
      expect(x0).toBeCloseTo(w - x1);
      expect(y0).toBeCloseTo(h - y1);
      expect(x0).toBeGreaterThanOrEqual(pad * view.scale - 1e-9);
      expect(y0).toBeGreaterThanOrEqual(pad * view.scale - 1e-9);
      expect(Math.min(x0, y0)).toBeCloseTo(pad * view.scale);
    }
  });

  it('scoreAt counts goals up to the time', () => {
    const playback = fakePlayback({
      frames: still(4),
      events: [
        event(1, 'goal', { score: [1, 0] }),
        event(2, 'shot'),
        event(3, 'goal', { team: 1, actor: 20, score: [1, 1] }),
      ],
    });
    expect(scoreAt(playback, 0.5)).toEqual([0, 0]);
    expect(scoreAt(playback, 1)).toEqual([1, 0]);
    expect(scoreAt(playback, 2.9)).toEqual([1, 0]);
    expect(scoreAt(playback, 3)).toEqual([1, 1]);
  });

  it('captionAt names the beat by identifiers', () => {
    const beat: Beat = {
      index: 4,
      possession: 2,
      team: 0,
      phase: 'finalThird',
      move: 'throughBall',
      kind: 'pass',
      actor: 8,
      receiver: 10,
      opponent: 14,
      from: [70, 30],
      to: [92, 34],
      loft: false,
      through: true,
      header: false,
      outcome: 'offside',
      hold: 1,
    };
    const playback = fakePlayback({ frames: [frameOf(0, { beat: 4 })], beats: [beat] });
    const caption = captionAt(playback, 0);
    const label = (index: number): string => {
      const p = playback.fixture.players[index];
      return `${playback.fixture.teams[p.team].code}${p.number}`;
    };
    for (const id of ['#4', 'throughBall', 'pass', 'offside', label(8), label(10), label(14)]) {
      expect(caption).toContain(id);
    }
    expect(captionAt(fakePlayback({ frames: [frameOf(0, { beat: 9 })], beats: [beat] }), 0)).toBe(
      '',
    );
  });

  it('flashesAt returns recent goal and offside events with their age', () => {
    const playback = fakePlayback({
      frames: still(4),
      events: [
        event(0.5, 'save'),
        event(2, 'offside', { line: 70 }),
        event(2.5, 'goal', { score: [1, 0] }),
        event(2.6, 'receive'),
        event(3.5, 'tackle'),
      ],
    });
    const flashes = flashesAt(playback, 3);
    expect(flashes.map((f) => f.kind)).toEqual(['offside', 'goal']);
    expect(flashes[0].line).toBe(70);
    expect(flashes[0].age).toBeCloseTo(1);
    expect(flashes[1].age).toBeCloseTo(0.5);
  });
});
