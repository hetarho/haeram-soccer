import { describe, expect, it } from 'vitest';
import { advance, createStaging, type StageFrame, type StageEvent } from './perform';
import { matchScript, scriptOf } from './script.testkit';
import { demoFixture } from './squads.testkit';

const fixture = demoFixture();
const hand = scriptOf(fixture, [
  { kind: 'kickOff', actor: 9, receiver: 5, to: [45, 30] },
  { kind: 'pass', actor: 5, receiver: 6, to: [60, 24] },
  { kind: 'carry', actor: 6, to: [70, 30], outcome: 'tackled', opponent: 13 },
  { kind: 'pass', team: 1, actor: 13, receiver: 15, to: [62, 40], possession: 2 },
  { kind: 'pass', team: 1, actor: 15, to: [70, 69], outcome: 'out', possession: 2 },
  { kind: 'throwIn', actor: 4, receiver: 8, to: [75, 54], possession: 3 },
  { kind: 'shot', actor: 8, to: [105, 34], outcome: 'goal', possession: 3 },
]);
const script = matchScript(hand);

function chunks(bounds: number[]) {
  const s = createStaging(script, fixture.sides);
  const frames: StageFrame[] = [],
    events: StageEvent[] = [];
  for (const bound of bounds) {
    const r = advance(s, bound);
    expect(r.frames.every((f) => f.t <= bound)).toBe(true);
    expect(r.events.every((e) => e.t <= bound)).toBe(true);
    frames.push(...r.frames);
    events.push(...r.events);
  }
  return { s, frames, events };
}

describe('bounded staging', () => {
  it('staging in steps equals staging at once', () => {
    const whole = chunks([Infinity]);
    const minute = chunks([60, 120, 180, 240, 300]);
    expect(minute.s.done).toBe(true);
    expect(minute.frames).toEqual(whole.frames);
    expect(minute.events).toEqual(whole.events);
    expect(whole.events.filter((e) => e.kind === 'performed').map((e) => e.beat)).toEqual(
      script.beats.map((b) => b.index),
    );
  });
  it('a step never runs past its bound, including sub-tick and repeated bounds', () => {
    const s = createStaging(script, fixture.sides);
    const first = advance(s, 0);
    expect(first.frames.map((f) => f.t)).toEqual([0]);
    const bounds = [0, 0.01, 0.09, 0.1, 0.11, 0.15, 0.2, 4.01, 4.01, 15.37, 60];
    for (const bound of bounds) {
      const r = advance(s, bound);
      expect(s.state.t).toBeLessThanOrEqual(bound);
      expect(r.frames.every((f) => f.t <= bound)).toBe(true);
      expect(r.events.every((e) => e.t <= bound)).toBe(true);
    }
  });
  it('the same script stages the same frames twice', () => {
    const a = chunks([Infinity]),
      b = chunks([Infinity]);
    expect(a.frames).toEqual(b.frames);
    expect(a.events).toEqual(b.events);
    expect(advance(a.s, Infinity)).toEqual({ frames: [], events: [], done: true });
  });
  it('IDs retain side and record line even when lines differ from slots and array offsets', () => {
    const sides = structuredClone(fixture.sides);
    sides.forEach((side) => side.players.forEach((p) => (p.line += 30)));
    const sparse = {
      ...script,
      beats: script.beats.map((b) => ({
        ...b,
        actor: b.actor + 30,
        ...(b.receiver === undefined ? {} : { receiver: b.receiver + 30 }),
        ...(b.opponent === undefined ? {} : { opponent: b.opponent + 30 }),
      })),
    };
    const result = advance(createStaging(sparse, sides), Infinity);
    expect(result.frames[0].owner).toEqual({ side: 0, line: 39 });
    expect(result.events.find((e) => e.kind === 'tackle')?.other).toEqual({ side: 1, line: 32 });
    expect(result.frames.flatMap((f) => f.p).every((p) => p.player.line >= 30)).toBe(true);
  });
});
