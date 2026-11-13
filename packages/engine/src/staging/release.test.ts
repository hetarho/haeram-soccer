// Under pressure the ball goes (stage/release.ts): a man an opponent reaches plays it at once,
// a press-resistant one shields it a little first, a man he has gone past does not count; and a
// pass the other side wins was still played toward a teammate (`winOnPath`).
import { describe, expect, it } from 'vitest';
import { escapeOf, holdOver, pressedOff, RELEASE } from './release';
import { demoFixture } from './squads.testkit';
import { formationSides, formedStage } from './tactics.testkit';
import { performScript, posOf, scriptOf, type BeatSpec } from './script.testkit';
import type { StageState } from './world';
import { dist } from './vec';

const TICK = 0.1;
const CARRIER = 9;

/** A settled stage with every opponent far off but one, `presser`, at `gap` metres from the carrier. */
function reached(gap: number, escape?: number): { state: StageState; presser: number } {
  const sides = formationSides('balanced', 'balanced');
  if (escape !== undefined) sides[0].players[CARRIER] = { ...sides[0].players[CARRIER]!, escape };
  const state = formedStage(sides, [60, 34], 0, 'progression');
  const at = state.bodies[CARRIER].pos;
  const away = state.fixture.teams[1].players.filter((p) => p.slot !== 0);
  away.forEach((p, k) => (state.bodies[p.index].pos = [5, 4 + k * 6]));
  const presser = away[5]!.index;
  state.bodies[presser].pos = [at[0] + gap, at[1]];
  return { state, presser };
}

/** Seconds of ticks until `watch` is true (Infinity when not within `limit`). */
function secondsUntil(state: StageState, watch: () => boolean, limit = 10): number {
  const start = state.t;
  while (state.t - start <= limit) {
    if (watch()) return Math.round((state.t - start) * 1000) / 1000;
    state.t = Math.round((state.t + TICK) * 1000) / 1000;
  }
  return Infinity;
}

describe('pressure release', () => {
  it('reads press resistance from 드리블 (twice), 침착성 and 힘', () => {
    expect(escapeOf({ dribbling: 80, composure: 60, strength: 70 })).toBe(73);
    expect(escapeOf({ dribbling: 60, composure: 80, strength: 70 })).toBe(68);
  });

  it('a man an opponent reaches plays it after his reaction, not at the end of his hold', () => {
    const { state } = reached(1.5);
    expect(secondsUntil(state, pressedOff(state, CARRIER))).toBeCloseTo(RELEASE.react, 6);
    const other = reached(1.5).state;
    expect(secondsUntil(other, holdOver(other, CARRIER, other.t, 8))).toBeLessThan(1);
  });

  it('an opponent outside the reach does not end the hold before its time', () => {
    const { state } = reached(RELEASE.reach + 1);
    expect(secondsUntil(state, pressedOff(state, CARRIER))).toBe(Infinity);
    const start = state.t;
    expect(secondsUntil(state, holdOver(state, CARRIER, start, 3))).toBeCloseTo(3, 6);
  });

  it('a press-resistant man shields it first; a man he has gone past does not count', () => {
    const strong = reached(1.5, RELEASE.escape);
    expect(secondsUntil(strong.state, pressedOff(strong.state, CARRIER))).toBeCloseTo(
      RELEASE.shield,
      6,
    );
    const past = reached(1.5);
    past.state.beaten.set(past.presser, Infinity);
    expect(secondsUntil(past.state, pressedOff(past.state, CARRIER))).toBe(Infinity);
  });
});

describe('a pass the other side wins', () => {
  it('is cut out near the teammate it was meant for, though the record names none', () => {
    const fixture = demoFixture();
    const script: BeatSpec[] = [
      { kind: 'kickOff', actor: 9, receiver: 5, to: [45, 30] },
      { kind: 'pass', actor: 5, receiver: 6, to: [50, 24] },
      { kind: 'pass', actor: 6, to: [64, 40], outcome: 'intercepted', opponent: 17 },
      { team: 1, kind: 'pass', actor: 17, receiver: 18, to: [58, 40], possession: 2 },
    ];
    const p = performScript(scriptOf(fixture, script));
    const cut = p.events.find((e) => e.kind === 'intercept')!;
    expect(cut).toBeDefined();
    const frame = p.frames.find((f) => Math.abs(f.t - cut.t) < 1e-6)!;
    const mates = fixture.teams[0].players.filter((m) => m.index !== 6 && m.slot !== 0);
    const nearest = Math.min(...mates.map((m) => dist(posOf(frame, m.index), cut.at)));
    expect(nearest).toBeLessThan(6);
  });
});
