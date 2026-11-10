import { describe, expect, it } from 'vitest';
import { PROTO_CONFIG } from '../core/config.ts';
import { offsideLineX } from '../core/shape.ts';
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

  it('a far interceptor collects the ball himself: it never jumps to his feet', () => {
    // T800: away 12 stands far from this cross's path even with the lunge and the slowest ball; the
    // ball used to land on the path and jump 6 m to his feet in one frame (54.6 m/s).
    const far: BeatSpec = { ...A_CUT, to: [90, 60], loft: true, opponent: 12 };
    const p = stage([K, TO_6, far, { ...AWAY_ON, actor: 12 }]);
    const cut = one(p, 'intercept');
    expect(cut.other).toBe(12);
    expect(dist(posOf(frameAt(p, cut.t), 12), cut.at)).toBeLessThanOrEqual(
      PROTO_CONFIG.limits.contest,
    );
    for (let i = 1; i < p.frames.length; i++) {
      const [prev, cur] = [p.frames[i - 1], p.frames[i]];
      expect(dist([prev.ball[0], prev.ball[1]], [cur.ball[0], cur.ball[1]]), `frame ${i}`).toBe(
        Math.min(
          dist([prev.ball[0], prev.ball[1]], [cur.ball[0], cur.ball[1]]),
          PROTO_CONFIG.limits.ballSpeed * TICK,
        ),
      );
    }
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

  it('a pressed pass is pressed even where the counter side would not press', () => {
    // T800: the away side (counter) presses only from its own 62 m; a pressed pass deep in the home
    // half used to be kicked with nobody near after the longest extra hold.
    const back: BeatSpec = { kind: 'pass', actor: 5, receiver: 2, to: [25, 20] };
    const pressed: BeatSpec = {
      kind: 'pass',
      actor: 2,
      receiver: 3,
      to: [22, 44],
      reason: 'pressed',
      hold: 0.6,
    };
    const p = stage([K, back, pressed, { kind: 'pass', actor: 3, receiver: 4, to: [30, 60] }]);
    const kick = p.events.find((e) => e.kind === 'kick' && e.beat === 2);
    expect(kick).toBeDefined();
    if (!kick) return;
    const frame = frameAt(p, kick.t);
    const actor = posOf(frame, 2);
    const nearest = Math.min(
      ...Array.from({ length: 10 }, (_, k) => dist(posOf(frame, 12 + k), actor)),
    );
    expect(nearest).toBeLessThanOrEqual(STAGE.pressVisible + PROTO_CONFIG.limits.pressedSlack);
  });

  it('a shot blocked far out goes behind for a corner no faster than a deflection', () => {
    // T800 (demo): the block's deflection behind the line took the parry's fixed time, so a shot
    // blocked 25 m out crossed to the goal line at 56 m/s.
    const list: BeatSpec[] = [
      K,
      TO_6,
      { kind: 'pass', actor: 6, receiver: 9, to: [66, 32] },
      { kind: 'carry', actor: 9, to: [78, 34] },
      { kind: 'shot', actor: 9, to: [105, 36], outcome: 'blocked', opponent: 14 },
      { kind: 'corner', actor: 10, receiver: 9, to: [99, 36] },
    ];
    const p = performScript(scriptOf(fixture, list), { duration: 90 });
    expect(p.events.some((e) => e.kind === 'block')).toBe(true);
    for (let i = 1; i < p.frames.length; i++) {
      const [prev, cur] = [p.frames[i - 1], p.frames[i]];
      const step = dist([prev.ball[0], prev.ball[1]], [cur.ball[0], cur.ball[1]]);
      expect(step, `frame ${i}`).toBeLessThanOrEqual(PROTO_CONFIG.limits.ballSpeed * TICK);
    }
  });

  it('a restart pass is cut out by its scripted man without a lunge', () => {
    // T800 (demo2): the dead-ball scene left the goal kick's interceptor where he stood, so he had
    // to lunge (or a teammate took his place).
    const out: BeatSpec = { kind: 'pass', actor: 5, receiver: 9, to: [106.5, 30], outcome: 'out' };
    const goalKick: BeatSpec = {
      team: 1,
      kind: 'goalKick',
      actor: 11,
      receiver: 20,
      to: [75, 50],
      outcome: 'intercepted',
      opponent: 5,
      possession: 2,
      loft: true,
    };
    const on: BeatSpec = { kind: 'pass', actor: 5, receiver: 6, to: [60, 30], possession: 3 };
    const p = performScript(scriptOf(fixture, [K, { ...out, loft: true }, goalKick, on]), {
      duration: 80,
    });
    const cut = one(p, 'intercept');
    expect(cut.other).toBe(5);
    expect(cut.recast ?? false).toBe(false);
    expect(cut.stretch ?? false).toBe(false);
  });

  it('the back line holds for an offside runner who starts far behind it', () => {
    // T800 (demo2): after a turnover deep in the home half the away line dropped as fast as the
    // early runner ran, and the offside ball was kicked with him 8 m onside.
    const runner = 1;
    const list: BeatSpec[] = [
      K,
      TO_6,
      A_CUT,
      { team: 1, kind: 'carry', actor: 17, to: [30, 34], possession: 2 },
      {
        team: 1,
        kind: 'pass',
        actor: 17,
        receiver: 20,
        to: [22, 36],
        possession: 2,
        outcome: 'intercepted',
        opponent: 3,
      },
      {
        kind: 'pass',
        actor: 3,
        receiver: runner,
        to: [75, 30],
        outcome: 'offside',
        through: true,
        possession: 3,
        hold: 1.2,
      },
    ];
    const p = performScript(scriptOf(fixture, list), { duration: 90 });
    const kick = p.events.find((e) => e.kind === 'kick' && e.beat === 5);
    expect(kick).toBeDefined();
    if (!kick) return;
    const frame = frameAt(p, kick.t);
    const all = Array.from({ length: 22 }, (_, i) => posOf(frame, i));
    expect(posOf(frame, runner)[0] - offsideLineX(fixture, all, 0)).toBeGreaterThanOrEqual(
      STAGE.through.offsideGap - 0.05,
    );
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
