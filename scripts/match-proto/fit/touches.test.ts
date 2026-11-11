import { describe, expect, it } from 'vitest';
import { SH, type Settled } from '../core/settled.ts';
import { smallSettled } from './fit.testkit.ts';
import { FLOATING, buildTouches, dealFixed, dealMinutes, minuteIndex } from './touches.ts';

/** The small match with only the rows given. */
const make = (events: number[][], shots: number[][] = [], fouls: number[][] = []): Settled => ({
  ...smallSettled(),
  events,
  shots,
  fouls,
  cards: [],
});
const flat = (s: Settled, minute: number) => ({
  events: s.events.map(() => minute),
  fouls: s.fouls.map(() => minute),
});

describe('match-proto fitted touches (T820)', () => {
  it("a player's carries are joined to his own releases", () => {
    const s = make([
      [0, 0, 0, 0, 17, 22, 5, 0, 0, -1],
      [0, 0, 5, 0, 12, 17, 5, 0, 0, -1],
      [0, 0, 0, 0, 30, 31, 5, 0, 0, -1],
      [0, 0, 5, 0, 7, 12, 6, 0, 0, -1],
      [0, 0, 0, 0, 12, 17, 6, 0, 0, -1],
    ]);
    const touches = buildTouches(s, flat(s, 10));
    const of = (event: number) =>
      touches.find(
        (t) => t.release !== undefined && 'event' in t.release && t.release.event === event,
      )!;
    expect(of(0).carries).toEqual([1]);
    expect(of(2).carries).toEqual([]);
    expect(of(4).carries).toEqual([3]);
    expect(touches).toHaveLength(3);
  });

  it('a failed carry ends its touch', () => {
    const s = make([
      [0, 0, 0, 0, 17, 22, 5, 0, 0, -1],
      [0, 0, 5, 0, 12, 17, 5, 8, 0, 14],
      [0, 0, 6, 0, 12, 17, 5, 8, 0, 15],
    ]);
    const touches = buildTouches(s, flat(s, 10));
    expect(touches.filter((t) => t.release === undefined).map((t) => t.carries)).toEqual([
      [1],
      [2],
    ]);
    expect(touches[0]!.carries).toEqual([]);
  });

  it('a shot follows its source pass as the next touch and shares a touch with its source carry', () => {
    const s = make(
      [
        [0, 0, 1, 0, 17, 32, 6, 0, 0, -1],
        [0, 1, 5, 0, 27, 32, 9, 0, 0, -1],
      ],
      [
        [0, 20, 32, 0, 0, 10, 1, 0, 10, 6, 0, 11],
        [0, 30, 32, 0, 0, 10, 1, 0, 9, -1, 1, 11],
      ],
    );
    const minutes = dealMinutes(s, 'fit');
    expect(minutes.events).toEqual([19, 29]);
    const touches = buildTouches(s, minutes);
    const shot = (id: number) =>
      touches.findIndex(
        (t) => t.release !== undefined && 'shot' in t.release && t.release.shot === id,
      );
    expect(touches[0]!.next).toBe(shot(0));
    expect(touches[shot(0)]!).toMatchObject({ actor: 10, minute: 19, carries: [] });
    expect(touches[shot(1)]!).toMatchObject({ actor: 9, minute: 29, carries: [1] });
    expect(touches).toHaveLength(3);
  });

  it('dealFixed keeps the minutes the record states and floats every other row (T822)', () => {
    const s = smallSettled();
    const minutes = dealFixed(s);
    expect(minutes.fouls).toEqual([39, FLOATING, FLOATING]);
    s.shots.forEach((shot) => {
      const source = shot[SH.source]!;
      if (source >= 0) expect(minutes.events[source]).toBe(minuteIndex(shot[SH.minute]!));
    });
    const sources = new Set(s.shots.map((shot) => shot[SH.source]!));
    s.events.forEach((_, id) => {
      if (!sources.has(id)) expect(minutes.events[id]).toBe(FLOATING);
    });
  });

  it('a floating carry runs into the release of his whose start it meets (T822)', () => {
    const s = make([
      [0, 0, 0, 0, 22, 27, 5, 0, 0, -1],
      [0, 0, 0, 0, 12, 17, 5, 0, 0, -1],
      [0, 0, 5, 0, 7, 12, 5, 0, 0, -1],
      [0, 0, 5, 0, 17, 22, 5, 0, 0, -1],
    ]);
    const touches = buildTouches(s, dealFixed(s));
    const of = (event: number) =>
      touches.find(
        (t) => t.release !== undefined && 'event' in t.release && t.release.event === event,
      )!;
    // Each carry ends where one of his passes starts, and joins that one, floating with it.
    expect(of(0).carries).toEqual([3]);
    expect(of(1).carries).toEqual([2]);
    expect(touches.every((t) => t.minute === FLOATING)).toBe(true);
    expect(touches).toHaveLength(2);
  });

  it("a booked foul keeps its card's minute and a shot its own", () => {
    const s = smallSettled();
    const minutes = dealMinutes(s, 'fit');
    expect(minutes.fouls[0]).toBe(39);
    for (const shot of s.shots) {
      const source = shot[SH.source]!;
      if (source >= 0) expect(minutes.events[source]).toBe(minuteIndex(shot[SH.minute]!));
    }
    const touches = buildTouches(s, minutes);
    s.shots.forEach((shot, id) => {
      const t = touches.find(
        (x) => x.release !== undefined && 'shot' in x.release && x.release.shot === id,
      );
      expect(t!.minute).toBe(minuteIndex(shot[SH.minute]!));
    });
    const booked = touches.find(
      (t) => t.release !== undefined && 'foul' in t.release && t.release.foul === 0,
    );
    expect(booked!.minute).toBe(39);
    // Every other minute lies in 0-89 and every row is dealt.
    expect([...minutes.events, ...minutes.fouls].every((m) => m >= 0 && m <= 89)).toBe(true);
  });
});
