import { describe, expect, it } from 'vitest';
import { PROTO_CONFIG } from '../core/config.ts';
import { demoFixture } from '../core/squads.ts';
import type { Frame, Playback, StageEvent, Vec } from '../core/types.ts';
import { dist } from '../core/vec.ts';
import { performScript } from './perform.ts';
import { posOf, scriptOf, type BeatSpec } from './script.testkit.ts';

// Fixed scripts A–E of T796 (home = slot, away = 11 + slot); every one opens with the kick-off K.
const fixture = demoFixture();
const STAGE = PROTO_CONFIG.stage;
const MOTION = PROTO_CONFIG.motion;
const TICK = PROTO_CONFIG.tick;

const K: BeatSpec = { kind: 'kickOff', actor: 9, receiver: 5, to: [45, 30] };
const TO_6: BeatSpec = { kind: 'pass', actor: 5, receiver: 6, to: [50, 24] };
const A_CUT: BeatSpec = {
  kind: 'pass',
  actor: 6,
  receiver: 9,
  to: [62, 32],
  outcome: 'intercepted',
  opponent: 17,
};
const AWAY_ON: BeatSpec = {
  team: 1,
  kind: 'pass',
  actor: 17,
  receiver: 18,
  to: [58, 40],
  possession: 2,
};

const SCRIPTS = {
  A: [K, TO_6, A_CUT, AWAY_ON],
  B: [
    K,
    TO_6,
    { kind: 'carry', actor: 6, to: [60, 26], outcome: 'tackled', opponent: 17 },
    AWAY_ON,
  ],
  C: [
    K,
    TO_6,
    { kind: 'carry', actor: 6, to: [60, 26], outcome: 'foul', opponent: 17 },
    { kind: 'freeKick', actor: 6, receiver: 5, to: [50, 32], possession: 2 },
  ],
  D: [
    K,
    { kind: 'pass', actor: 5, receiver: 4, to: [40, 60] },
    { kind: 'pass', actor: 4, receiver: 10, to: [55, 68], outcome: 'out' },
    { team: 1, kind: 'throwIn', actor: 12, receiver: 16, to: [57, 62], possession: 2 },
  ],
  E: [
    K,
    { kind: 'pass', actor: 5, receiver: 10, to: [60, 58], loft: true },
    { kind: 'takeOn', actor: 10, to: [69, 58], opponent: 12 },
  ],
} satisfies Record<string, BeatSpec[]>;

const stage = (list: readonly BeatSpec[]): Playback =>
  performScript(scriptOf(fixture, list), { duration: 60 });
const PLAYED = Object.fromEntries(
  Object.entries(SCRIPTS).map(([name, list]) => [name, stage(list)]),
) as Record<keyof typeof SCRIPTS, Playback>;

const one = (playback: Playback, kind: StageEvent['kind']): StageEvent => {
  const found = playback.events.filter((e) => e.kind === kind);
  expect(found).toHaveLength(1);
  return found[0];
};
const frameAt = (playback: Playback, t: number): Frame => {
  const frame = playback.frames.find((f) => Math.abs(f.t - t) < 1e-9);
  if (!frame) throw new Error('no frame at ' + t);
  return frame;
};
const isAwayOutfield = (index: number): boolean => index >= 12 && index <= 21;

/** The event's `other` is an away outfielder within reach of the ball at the event, and has it next. */
const wonAtTheBall = (playback: Playback, event: StageEvent): void => {
  const other = event.other;
  expect(other).toBeDefined();
  if (other === undefined) return;
  expect(isAwayOutfield(other)).toBe(true);
  const frame = frameAt(playback, event.t);
  expect(dist(posOf(frame, other), event.at)).toBeLessThanOrEqual(STAGE.controlRange + 0.6);
  const next = playback.frames[playback.frames.indexOf(frame) + 1];
  expect(next.owner).toBe(other);
};

describe('stage contests and dead balls', () => {
  it('A: the interceptor is on the ball’s path when he wins it', () => {
    wonAtTheBall(PLAYED.A, one(PLAYED.A, 'intercept'));
  });

  it('B: the tackler reaches the carrier', () => {
    wonAtTheBall(PLAYED.B, one(PLAYED.B, 'tackle'));
  });

  it('C: a foul stops play until the free kick', () => {
    const p = PLAYED.C;
    const foul = one(p, 'foul');
    const restart = one(p, 'restart');
    expect(restart.t).toBeGreaterThan(foul.t);
    for (const f of p.frames) if (f.t > foul.t && f.t <= restart.t) expect(f.live).toBe(false);
    expect(dist(restart.at, foul.at)).toBeLessThanOrEqual(1);
    const after = p.frames.filter((f) => f.t > restart.t);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((f) => f.live)).toBe(true);
    expect(restart.t - foul.t).toBeGreaterThanOrEqual(STAGE.restart.delay.freeKick - 1e-9);
  });

  it('D: a ball out is thrown in from where it left', () => {
    const p = PLAYED.D;
    const out = one(p, 'out');
    expect([0, 68]).toContain(out.at[1]);
    const bound = PROTO_CONFIG.ball.retrieval * TICK + 0.02;
    let dead = 0;
    for (let i = 1; i < p.frames.length; i++) {
      const [prev, cur] = [p.frames[i - 1], p.frames[i]];
      if (cur.live) continue;
      dead += 1;
      expect(dist([prev.ball[0], prev.ball[1]], [cur.ball[0], cur.ball[1]])).toBeLessThanOrEqual(
        bound,
      );
    }
    expect(dead).toBeGreaterThan(0);
    const restart = one(p, 'restart');
    expect(dist(posOf(frameAt(p, restart.t), restart.actor), restart.at)).toBeLessThanOrEqual(1.5);
    expect(restart.t - out.t).toBeGreaterThanOrEqual(STAGE.restart.delay.throwIn - 1e-9);
  });

  it('E: a take-on ends past the defender', () => {
    const p = PLAYED.E;
    const last = p.frames[p.frames.length - 1];
    const to: Vec = [69, 58];
    const actor = posOf(last, 10);
    expect(dist(actor, to)).toBeLessThanOrEqual(STAGE.arrive + 0.5);
    expect(dist(posOf(last, 12), to)).toBeGreaterThan(dist(actor, to));
  });

  it('a pressed pass waits for its presser', () => {
    const pressed: BeatSpec = { ...A_CUT, reason: 'pressed', hold: 0.6 };
    const p = stage([K, TO_6, pressed, AWAY_ON]);
    const kick = p.events.find((e) => e.kind === 'kick' && e.beat === 2);
    expect(kick).toBeDefined();
    if (!kick) return;
    const frame = frameAt(p, kick.t);
    const actor = posOf(frame, 6);
    const nearest = Math.min(
      ...Array.from({ length: 10 }, (_, k) => dist(posOf(frame, 12 + k), actor)),
    );
    expect(nearest).toBeLessThanOrEqual(STAGE.pressVisible + 0.5);
  });

  it('no player exceeds a sprint plus the lunge', () => {
    const bound = (MOTION.sprintBase + MOTION.sprintPerPace + STAGE.lunge) * TICK + 0.02;
    for (const p of Object.values(PLAYED)) {
      for (let f = 1; f < p.frames.length; f++) {
        for (let i = 0; i < 22; i++) {
          expect(dist(posOf(p.frames[f - 1], i), posOf(p.frames[f], i))).toBeLessThan(bound);
        }
      }
    }
  });
});
