import { describe, expect, it } from 'vitest';
import { SH, type MatchDetail } from './detail';
import { smallDetail, withRows } from './script.testkit';
import { FLOATING, buildTouches, dealFixed, minuteIndex } from './touches';

// The prototype's fit/touches.test.ts cases (T820, T822) on engine details; rows are written in the
// prototype's players (`side * 11 + slot`), so its touches name side 0's lines 0–10 and side 1's.
const make = (events: number[][], shots: number[][] = [], fouls: number[][] = []): MatchDetail =>
  withRows(smallDetail(), events, shots, fouls);
const flat = (d: MatchDetail, minute: number) => ({
  events: d.events.map(() => minute),
  fouls: d.fouls.map(() => minute),
});
const releasing = (touches: ReturnType<typeof buildTouches>, event: number) =>
  touches.find(
    (t) => t.release !== undefined && 'event' in t.release && t.release.event === event,
  )!;

describe('script touches (T820)', () => {
  it("a player's carries are joined to his own releases", () => {
    const d = make([
      [0, 0, 0, 0, 17, 22, 5, 0, 0, -1],
      [0, 0, 5, 0, 12, 17, 5, 0, 0, -1],
      [0, 0, 0, 0, 30, 31, 5, 0, 0, -1],
      [0, 0, 5, 0, 7, 12, 6, 0, 0, -1],
      [0, 0, 0, 0, 12, 17, 6, 0, 0, -1],
    ]);
    const touches = buildTouches(d, flat(d, 10));
    expect(releasing(touches, 0).carries).toEqual([1]);
    expect(releasing(touches, 2).carries).toEqual([]);
    expect(releasing(touches, 4).carries).toEqual([3]);
    expect(touches).toHaveLength(3);
  });

  it('a carry joins only a release of his own side', () => {
    // Side 1's line 5 (the prototype's player 16) is not side 0's line 5.
    const d = make([
      [0, 0, 0, 0, 17, 22, 5, 0, 0, -1],
      [1, 0, 5, 0, 12, 17, 16, 0, 0, -1],
    ]);
    const touches = buildTouches(d, flat(d, 10));
    expect(releasing(touches, 0).carries).toEqual([]);
    expect(touches).toHaveLength(2);
  });

  it('a failed carry ends its touch', () => {
    const d = make([
      [0, 0, 0, 0, 17, 22, 5, 0, 0, -1],
      [0, 0, 5, 0, 12, 17, 5, 8, 0, 14],
      [0, 0, 6, 0, 12, 17, 5, 8, 0, 15],
    ]);
    const touches = buildTouches(d, flat(d, 10));
    expect(touches.filter((t) => t.release === undefined).map((t) => t.carries)).toEqual([
      [1],
      [2],
    ]);
    expect(touches[0]!.carries).toEqual([]);
  });

  it('a shot follows its source pass as the next touch and shares a touch with its source carry', () => {
    const d = make(
      [
        [0, 0, 1, 0, 17, 32, 6, 0, 0, -1],
        [0, 1, 5, 0, 27, 32, 9, 0, 0, -1],
      ],
      [
        [0, 20, 32, 0, 0, 10, 1, 0, 10, 6, 0, 11],
        [0, 30, 32, 0, 0, 10, 1, 0, 9, -1, 1, 11],
      ],
    );
    const minutes = dealFixed(d);
    expect(minutes.events).toEqual([19, 29]);
    const touches = buildTouches(d, minutes);
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
    const d = smallDetail();
    const minutes = dealFixed(d);
    expect(minutes.fouls).toEqual([39, FLOATING, FLOATING]);
    d.shots.forEach((shot) => {
      const source = shot[SH.source]!;
      if (source >= 0) expect(minutes.events[source]).toBe(minuteIndex(shot[SH.minute]!));
    });
    const sources = new Set(d.shots.map((shot) => shot[SH.source]!));
    d.events.forEach((_, id) => {
      if (!sources.has(id)) expect(minutes.events[id]).toBe(FLOATING);
    });
  });

  it('a floating carry runs into the release of his whose start it meets (T822)', () => {
    const d = make([
      [0, 0, 0, 0, 22, 27, 5, 0, 0, -1],
      [0, 0, 0, 0, 12, 17, 5, 0, 0, -1],
      [0, 0, 5, 0, 7, 12, 5, 0, 0, -1],
      [0, 0, 5, 0, 17, 22, 5, 0, 0, -1],
    ]);
    const touches = buildTouches(d, dealFixed(d));
    // Each carry ends where one of his passes starts, and joins that one, floating with it.
    expect(releasing(touches, 0).carries).toEqual([3]);
    expect(releasing(touches, 1).carries).toEqual([2]);
    expect(touches.every((t) => t.minute === FLOATING)).toBe(true);
    expect(touches).toHaveLength(2);
  });

  it("a booked foul keeps its card's minute and a shot its own", () => {
    const d = smallDetail();
    const minutes = dealFixed(d);
    expect(minutes.fouls[0]).toBe(39);
    const touches = buildTouches(d, minutes);
    d.shots.forEach((shot, id) => {
      const t = touches.find(
        (x) => x.release !== undefined && 'shot' in x.release && x.release.shot === id,
      );
      expect(t!.minute).toBe(minuteIndex(shot[SH.minute]!));
    });
    const booked = touches.find(
      (t) => t.release !== undefined && 'foul' in t.release && t.release.foul === 0,
    );
    expect(booked!.minute).toBe(39);
  });
});
