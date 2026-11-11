import { describe, expect, it } from 'vitest';
import { PROTO_CONFIG } from '../core/config.ts';
import { demoFixture } from '../core/squads.ts';
import type { Playback, Vec } from '../core/types.ts';
import { dist } from '../core/vec.ts';
import { performScript } from './perform.ts';
import { posOf, scriptOf, type BeatSpec } from './script.testkit.ts';

// T817: three hand-written scripts (home = slot, away = 11 + slot) share a build-up and an
// interception in midfield; S goes on settled, C as a counter, S2 is S with its phase a counter.
const fixture = demoFixture();
const TICK = PROTO_CONFIG.tick;
const TURN = PROTO_CONFIG.limits.turn;
const JOG = PROTO_CONFIG.motion.jog;

// Settled circulation across midfield, then a pass inside cut out in the centre circle's edge. The
// passes are played almost at once (hold 0.3 s): the man on the ball carries it while he holds
// (`stage.holdMove`), and longer carries would set the players moving before the turnover.
const BUILD_UP: BeatSpec[] = [
  { kind: 'kickOff', actor: 9, receiver: 5, to: [45, 30] },
  { kind: 'pass', actor: 5, receiver: 6, to: [52, 22], hold: 0.3 },
  { kind: 'pass', actor: 6, receiver: 7, to: [54, 42], hold: 0.3 },
  {
    kind: 'pass',
    actor: 7,
    receiver: 9,
    to: [56, 34],
    outcome: 'intercepted',
    opponent: 17,
    hold: 0.3,
  },
];
const S: BeatSpec[] = [
  ...BUILD_UP,
  // A 10 m pass after a hold of 1.5 s, then another.
  {
    team: 1,
    kind: 'pass',
    actor: 17,
    receiver: 18,
    to: [46.5, 37],
    hold: 1.5,
    phase: 'progression',
    possession: 2,
  },
  {
    team: 1,
    kind: 'pass',
    actor: 18,
    receiver: 16,
    to: [40, 48],
    hold: 1.5,
    phase: 'progression',
    possession: 2,
  },
];
const C: BeatSpec[] = [
  ...BUILD_UP,
  // A forward pass of 25 m or more after a hold of 0.5 s, then a carry of 18 m.
  {
    team: 1,
    kind: 'pass',
    actor: 17,
    receiver: 21,
    to: [30, 26],
    hold: 0.5,
    phase: 'counter',
    possession: 2,
  },
  { team: 1, kind: 'carry', actor: 21, to: [12, 30], phase: 'counter', possession: 2 },
];
const S2: BeatSpec[] = S.map((b) => (b.team === 1 ? { ...b, phase: 'counter' } : b));

const stage = (list: readonly BeatSpec[]): Playback =>
  performScript(scriptOf(fixture, list), { duration: 40 });
const PLAYED = { S: stage(S), C: stage(C), S2: stage(S2) };

const outfield = fixture.players.filter((p) => p.slot !== 0).map((p) => p.index);
/** The first frame on which the side in possession changes. */
const turnFrame = (p: Playback): number => {
  const f = p.frames.findIndex((frame, k) => k > 0 && frame.team !== p.frames[k - 1].team);
  expect(f).toBeGreaterThan(0);
  return f;
};
const velocity = (p: Playback, f: number, i: number): Vec => {
  const a = posOf(p.frames[f - 1], i);
  const b = posOf(p.frames[f], i);
  return [(b[0] - a[0]) / TICK, (b[1] - a[1]) / TICK];
};
const speed = (p: Playback, f: number, i: number): number => Math.hypot(...velocity(p, f, i));
/** The share of the outfield players faster than `limits.turn.runSpeed` `limits.turn.runAt` s after the turnover. */
const runShare = (p: Playback): number => {
  const f = turnFrame(p) + Math.round(TURN.runAt / TICK);
  return outfield.filter((i) => speed(p, f, i) > TURN.runSpeed).length / outfield.length;
};

describe('turnovers in performance (T817)', () => {
  it('the scripts are what they say', () => {
    expect(PLAYED.S.frames[turnFrame(PLAYED.S)].phase).toBe('progression');
    expect(PLAYED.C.frames[turnFrame(PLAYED.C)].phase).toBe('counter');
    expect(PLAYED.S2.frames[turnFrame(PLAYED.S2)].phase).toBe('counter');
    expect(dist(C[4].to, BUILD_UP[3].to)).toBeGreaterThanOrEqual(25);
    expect(dist(C[5].to, C[4].to)).toBeGreaterThanOrEqual(18);
    expect(dist(S[4].to, BUILD_UP[3].to)).toBeCloseTo(10, 0);
  });

  it('a settled turnover leaves most players below a run', () => {
    expect(runShare(PLAYED.S)).toBeLessThanOrEqual(TURN.runShare);
  });

  it('a counter sets most players running', () => {
    expect(runShare(PLAYED.C)).toBeGreaterThanOrEqual(TURN.counterRunShare);
  });

  it('the script’s counter alone makes more players run', () => {
    expect(runShare(PLAYED.S2)).toBeGreaterThan(runShare(PLAYED.S));
  });

  it('after a settled turnover the players turn at different moments', () => {
    const p = PLAYED.S;
    const f = turnFrame(p);
    const before = Math.round(TURN.before / TICK);
    const within = Math.round(TURN.within / TICK);
    let movers = 0;
    let turned = 0;
    for (const i of outfield) {
      let sum = 0;
      for (let g = f - before; g < f; g++) sum += velocity(p, g, i)[0];
      const v = sum / before;
      if (Math.abs(v) < TURN.moving) continue;
      movers += 1;
      for (let g = f; g <= f + within; g++) {
        const x = velocity(p, g, i)[0];
        if (x * v < 0 && Math.abs(x) >= TURN.moving) {
          turned += 1;
          break;
        }
      }
    }
    expect(movers).toBeGreaterThan(0);
    expect(turned / movers).toBeLessThanOrEqual(TURN.reverseShare);
  });

  it('the nearest free defender still presses at once', () => {
    const p = PLAYED.S;
    const f = turnFrame(p);
    const losers = fixture.teams[0].players.filter((pl) => pl.slot !== 0).map((pl) => pl.index);
    let pressed = false;
    for (let g = f; g <= f + Math.round(1 / TICK) && !pressed; g++) {
      const ball: Vec = [p.frames[g].ball[0], p.frames[g].ball[1]];
      for (const i of losers) {
        const v = velocity(p, g, i);
        const at = posOf(p.frames[g], i);
        const toBall: Vec = [ball[0] - at[0], ball[1] - at[1]];
        if (speed(p, g, i) > JOG && v[0] * toBall[0] + v[1] * toBall[1] > 0) pressed = true;
      }
    }
    expect(pressed).toBe(true);
  });
});
