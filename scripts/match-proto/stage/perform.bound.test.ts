import { describe, expect, it } from 'vitest';
import { PROTO_CONFIG } from '../core/config.ts';
import { HALFWAY } from '../core/pitch.ts';
import { demoFixture } from '../core/squads.ts';
import type { Playback, Script } from '../core/types.ts';
import { loadSettled } from '../fit/fit.testkit.ts';
import { writeFitted } from '../fit/write.ts';
import { performScript } from './perform.ts';
import { posOf, scriptOf, type BeatSpec } from './script.testkit.ts';

// Hand-written bound scripts (synthetic, ARCH-21): home = slot, away = 11 + slot. A bound script
// is one written from a settled result, so nobody it names may be replaced (T821).
const fixture = demoFixture();
const K: BeatSpec = { kind: 'kickOff', actor: 9, receiver: 5, to: [45, 30] };

/** A bound script of `list`, beat `i` starting at match second `clocks[i]` (5 s apart by default). */
const bound = (list: readonly BeatSpec[], clocks?: readonly number[]): Script => {
  const script = scriptOf(fixture, list);
  script.beats.forEach((b, i) => (b.clock = clocks?.[i] ?? i * 5));
  return { ...script, bound: true };
};
const contested = (p: Playback) =>
  p.events.filter((e) => ['intercept', 'tackle', 'foul', 'loose'].includes(e.kind));

describe('bound scripts (T821)', () => {
  it('a bound interception is won by the scripted man however far he is', () => {
    const p = performScript(
      bound([
        K,
        { kind: 'pass', actor: 5, receiver: 4, to: [40, 60], outcome: 'intercepted', opponent: 13 },
        { team: 1, kind: 'pass', actor: 13, receiver: 14, to: [50, 50], possession: 2 },
      ]),
    );
    const cut = p.events.filter((e) => e.kind === 'intercept');
    expect(cut).toHaveLength(1);
    expect(cut[0].other).toBe(13);
    expect(cut[0].recast).not.toBe(true);
  });

  it('an intercepted through ball without a runner is cut out by the scripted man', () => {
    // T822: s08's fitted script stopped here ('through ball without runner').
    const p = performScript(
      bound([
        K,
        {
          kind: 'pass',
          actor: 5,
          to: [70, 30],
          outcome: 'intercepted',
          opponent: 13,
          through: true,
        },
        { team: 1, kind: 'pass', actor: 13, receiver: 14, to: [55, 45], possession: 2 },
      ]),
    );
    expect(p.beats).toHaveLength(3);
    const cut = p.events.filter((e) => e.kind === 'intercept');
    expect(cut).toHaveLength(1);
    expect(cut[0].other).toBe(13);
  });

  it('a bound tackle is won by the scripted man', () => {
    const p = performScript(
      bound([
        K,
        { kind: 'pass', actor: 5, receiver: 6, to: [50, 24] },
        { kind: 'carry', actor: 6, to: [60, 26], outcome: 'tackled', opponent: 13 },
        { team: 1, kind: 'pass', actor: 13, receiver: 14, to: [62, 40], possession: 2 },
      ]),
    );
    const tackle = p.events.filter((e) => e.kind === 'tackle');
    expect(tackle).toHaveLength(1);
    expect(tackle[0].other).toBe(13);
    expect(tackle[0].recast).not.toBe(true);
  });

  it('a heavy touch runs to the named opponent', () => {
    const script = bound([
      K,
      { kind: 'pass', actor: 5, receiver: 6, to: [50, 24] },
      { kind: 'carry', actor: 6, to: [52, 24], outcome: 'loose', opponent: 17 },
      { team: 1, kind: 'pass', actor: 17, receiver: 18, to: [58, 40], possession: 2 },
    ]);
    const p = performScript(script);
    const loose = p.events.filter((e) => e.kind === 'loose');
    expect(loose).toHaveLength(1);
    expect(loose[0].actor).toBe(6);
    expect(loose[0].other).toBe(17);
    expect(p.events.some((e) => e.kind === 'tackle' || e.kind === 'intercept')).toBe(false);
    const during = p.frames.filter((f) => f.beat === 2 && f.t > loose[0].t);
    expect(during.filter((f) => f.mode === 'loose').length).toBeGreaterThanOrEqual(2);
    expect(during.every((f) => f.owner === -1 || f.owner === 17)).toBe(true);
    const next = p.frames.find((f) => f.beat === 3);
    expect(next?.owner).toBe(17);
  });

  it('every beat of a bound script is performed', () => {
    const settled = loadSettled('s01');
    const full = writeFitted(settled, 'fit');
    const cut: Script = { ...full, beats: full.beats.filter((b) => b.clock! < 300) };
    const p = performScript(cut);
    expect(p.beats.map((b) => b.index)).toEqual(cut.beats.map((b) => b.index));
    expect(contested(p).some((e) => e.recast === true)).toBe(false);
  }, 60_000);

  it("the half ends with a dead ball and the sides line up for the other side's kick-off", () => {
    const p = performScript(
      bound(
        [
          K,
          { kind: 'pass', actor: 5, receiver: 6, to: [50, 24] },
          { team: 1, kind: 'kickOff', actor: 20, receiver: 16, to: [60, 34], possession: 2 },
          { team: 1, kind: 'pass', actor: 16, receiver: 17, to: [62, 40], possession: 2 },
        ],
        [0, 5, 2700, 2705],
      ),
    );
    const whistles = p.events.filter((e) => e.kind === 'whistle');
    expect(whistles).toHaveLength(2);
    const half = whistles[0];
    const restart = p.events.find((e) => e.kind === 'restart' && e.beat === 2);
    expect(restart).toBeDefined();
    if (!restart) return;
    const hold = PROTO_CONFIG.stage.restart.delay.kickOff;
    const dead = p.frames.filter((f) => f.t > half.t && f.t < half.t + hold);
    expect(dead.length).toBeGreaterThan(0);
    expect(dead.every((f) => !f.live && f.mode === 'dead')).toBe(true);
    const at = p.frames.find((f) => Math.abs(f.t - restart.t) < 1e-9)!;
    for (const player of fixture.players) {
      const x = posOf(at, player.index)[0];
      if (player.team === 0) expect(x).toBeLessThanOrEqual(HALFWAY + 1.5);
      else expect(x).toBeGreaterThanOrEqual(HALFWAY - 1.5);
    }
    expect(p.duration).toBe(p.frames[p.frames.length - 1].t);
  });

  it('frames carry the match clock and it never runs backward', () => {
    const settled = loadSettled('s01');
    const full = writeFitted(settled, 'fit');
    const cut: Script = { ...full, beats: full.beats.filter((b) => b.clock! < 300) };
    const p = performScript(cut, { duration: 120 });
    expect(p.frames.every((f) => f.clock !== undefined)).toBe(true);
    for (let i = 1; i < p.frames.length; i++) {
      expect(p.frames[i].clock!).toBeGreaterThanOrEqual(p.frames[i - 1].clock!);
    }
    // A beat's frames never show a clock past the next beat's start.
    const start = new Map(cut.beats.map((b, i) => [b.index, cut.beats[i + 1]?.clock ?? Infinity]));
    expect(p.frames.every((f) => f.clock! <= start.get(f.beat)! + 1e-9)).toBe(true);
    // An unbound script's frames carry none.
    const loose = performScript({ ...cut, bound: undefined }, { duration: 30 });
    expect(loose.frames.some((f) => f.clock !== undefined)).toBe(false);
  }, 60_000);
});
