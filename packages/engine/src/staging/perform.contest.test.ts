import { describe, expect, it } from 'vitest';
import { STAGING_CONFIG } from './config';
import { offsideLineX } from './places';
import { HALFWAY } from './pitch';
import { demoFixture } from './squads.testkit';
import type { BeatOutcome, Frame, Playback, StageEvent, Vec } from './types';
import { dist } from './vec';
import { performScript } from './script.testkit';
import { posOf, scriptOf, type BeatSpec } from './script.testkit';
import { createStage } from './world';
import { performPass } from './pass';
import { giveBall } from './ball';
import { RELEASE } from './release';
import { freezeOthers } from './tactics.testkit';

/** One legal receiver and an optional opponent continuously tracking the carrier at 1.5 m. */
function pressureRelease(escape: number, impossible = false) {
  const isolated = demoFixture();
  isolated.players[5].escape = escape;
  const script = scriptOf(isolated, [
    {
      kind: 'pass',
      actor: 5,
      receiver: 8,
      to: [55, 30],
      hold: impossible ? 0.6 : 8,
      reason: 'pressed',
    },
  ]);
  const state = createStage(script);
  for (const p of isolated.players) {
    state.bodies[p.index].pos = p.team === 0 ? [15, 3 + p.slot * 6] : [90, 3 + p.slot * 6];
    state.bodies[p.index].vel = [0, 0];
  }
  state.bodies[11].pos = [104, 34];
  state.bodies[5].pos = [45, 30];
  state.bodies[8].pos = [55, 30];
  if (!impossible) state.bodies[17].pos = [46.5, 30];
  giveBall(state, 5);
  freezeOthers(state, impossible ? [5, 8] : [5, 8, 17]);
  if (!impossible)
    state.orders.set(17, {
      target: () => [state.bodies[5].pos[0] + 1.5, state.bodies[5].pos[1]],
      pace: 'run',
    });
  const program = performPass(state, { beat: script.beats[0] });
  for (let tick = 0; tick < 300; tick++) {
    const next = program.next();
    const kick = state.events.find((e) => e.kind === 'kick');
    if (kick) return { state, kick };
    if (next.done) break;
  }
  throw new Error('pressed pass never kicked');
}

// Fixed scripts A–E of T796 (home = slot, away = 11 + slot); every one opens with the kick-off K.
const fixture = demoFixture();
const STAGE = STAGING_CONFIG.stage;
const MOTION = STAGING_CONFIG.motion;
const TICK = STAGING_CONFIG.tick;

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
    const whistle = p.events.find((e) => e.kind === 'whistle')!;
    const after = p.frames.filter((f) => f.t > restart.t && f.t <= whistle.t);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((f) => f.live)).toBe(true);
    expect(restart.t - foul.t).toBeGreaterThanOrEqual(STAGE.restart.delay.freeKick - 1e-9);
  });

  it('D: a ball out is thrown in from where it left', () => {
    const p = PLAYED.D;
    const out = one(p, 'out');
    expect([0, 68]).toContain(out.at[1]);
    const bound = STAGING_CONFIG.ball.retrieval * TICK + 0.02;
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
    const completed = p.events.find(
      (e) => e.kind === 'performed' && e.beat === p.beats.at(-1)!.index,
    )!;
    const last = frameAt(p, completed.t);
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
      STAGING_CONFIG.limits.contest,
    );
    for (let i = 1; i < p.frames.length; i++) {
      const [prev, cur] = [p.frames[i - 1], p.frames[i]];
      expect(dist([prev.ball[0], prev.ball[1]], [cur.ball[0], cur.ball[1]]), `frame ${i}`).toBe(
        Math.min(
          dist([prev.ball[0], prev.ball[1]], [cur.ball[0], cur.ball[1]]),
          STAGING_CONFIG.limits.ballSpeed * TICK,
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
    expect(nearest).toBeLessThanOrEqual(STAGE.pressVisible + STAGING_CONFIG.limits.pressedSlack);
  });

  it.each(['complete', 'out', 'intercepted', 'loose'] as const)(
    'prepares visible pressure and a legal receiver for an ordinary %s pass',
    (outcome: BeatOutcome) => {
      const p = stage([
        K,
        { kind: 'pass', actor: 5, receiver: 2, to: [25, 20] },
        {
          kind: 'pass',
          actor: 2,
          receiver: 3,
          to: [22, 44],
          reason: 'pressed',
          hold: 0.6,
          outcome,
          ...(outcome === 'intercepted' || outcome === 'loose' ? { opponent: 17 } : {}),
        },
      ]);
      const kick = p.events.find((e) => e.kind === 'kick' && e.beat === 2);
      expect(kick).toBeDefined();
      if (!kick) return;
      const frame = frameAt(p, kick.t);
      const actor = posOf(frame, 2);
      const nearest = Math.min(
        ...fixture.teams[1].players
          .filter((q) => q.slot !== 0)
          .map((q) => dist(posOf(frame, q.index), actor)),
      );
      expect(nearest).toBeLessThanOrEqual(STAGE.pressVisible + STAGING_CONFIG.limits.pressedSlack);
      const receiver = posOf(frame, 3);
      const positions = fixture.players.map((q) => posOf(frame, q.index));
      expect(receiver[0]).toBeLessThanOrEqual(
        Math.max(HALFWAY, actor[0], offsideLineX(fixture, positions, 0)),
      );
    },
  );

  it.each([
    [0, RELEASE.react],
    [RELEASE.escape, RELEASE.shield],
  ] as const)('escape %s retains the ordinary %s s pressure deadline', (escape, deadline) => {
    const { state, kick } = pressureRelease(escape);
    expect(kick.t).toBeCloseTo(deadline, 6);
    expect(state.bodies[8].pos[0]).toBeLessThan(
      offsideLineX(
        state.fixture,
        state.bodies.map((b) => b.pos),
        0,
      ),
    );
  });

  it('ends impossible visible-pressure preparation within its finite allowance', () => {
    const { kick } = pressureRelease(0, true);
    expect(kick.t).toBeCloseTo(0.6 + STAGE.maxExtraHold + STAGE.through.maxWait, 6);
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
      expect(step, `frame ${i}`).toBeLessThanOrEqual(STAGING_CONFIG.limits.ballSpeed * TICK);
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
