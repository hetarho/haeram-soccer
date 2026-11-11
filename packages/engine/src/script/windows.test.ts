import { describe, expect, it } from 'vitest';
import type { MatchScript } from '../../../contracts/src/match-script';
import { EV, INCIDENT_KINDS, ST, type MatchDetail } from './detail';
import { smallDetail } from './script.testkit';
import { buildTouches, dealFixed } from './touches';
import { validateScript } from './validate';
import { touchWindows, writeScript } from './write';

// Hand-built details (T826, T827): the small match with a man leaving and another coming on, his
// substitution recorded at the stamp after the minute he leaves.

/** `detail` with line `line` of `side` off after `minute` and a new line in his slot on from it. */
function substituted(detail: MatchDetail, side: 0 | 1, line: number, minute: number): MatchDetail {
  const d: MatchDetail = structuredClone(detail);
  const off = d.sides[side].lines[line]!;
  const on = d.sides[side].lines.length;
  d.sides[side].lines.push({ ...off, id: `${off.id}:sub` });
  d.stints = d.stints.map((s) =>
    s[ST.side] === side && s[ST.line] === line ? [side, line, off.slot, 0, minute] : s,
  );
  d.stints.push([side, on, off.slot, minute, 90]);
  d.incidents.push([minute + 1, side, INCIDENT_KINDS.indexOf('sub'), line, on, -1, -1]);
  return d;
}
const written = (detail: MatchDetail, seed = 'fit'): MatchScript => {
  const r = writeScript(detail, seed);
  if ('problems' in r) throw new Error(r.problems.join(', '));
  expect(validateScript(detail, r.script)).toEqual([]);
  return r.script;
};
/** Clocks of the beats playing a recorded row by `line` of `side`. */
const clocksOf = (script: MatchScript, side: 0 | 1, line: number) =>
  script.beats
    .filter(
      (b) =>
        b.side === side &&
        b.actor === line &&
        (b.event !== undefined || b.shot !== undefined || b.foul !== undefined),
    )
    .map((b) => b.clock);
// [side, group, kind, setPiece, from, to, actor, result, lineBreaking, other, period]
const row = (side: number, actor: number, result = 0, other = -1, from = 22, to = 27) => [
  side,
  90 + actor,
  0,
  0,
  from,
  to,
  actor,
  result,
  0,
  other,
  0,
];

describe('script windows (T826)', () => {
  it("a substitute's rows are played inside his stint", () => {
    // Side 0's line 9 (a forward with recorded rows and a shot in the 60th minute) goes off after 60;
    // line 11 comes on in his slot with four rows of his own.
    const d = substituted(smallDetail(), 0, 9, 60);
    d.events.push(
      row(0, 11),
      row(0, 11, 0, -1, 27, 32),
      row(0, 11, 2, 4),
      row(0, 11, 0, -1, 17, 22),
    );
    const script = written(d);
    const sub = clocksOf(script, 0, 11);
    expect(sub).toHaveLength(4);
    for (const clock of sub) expect(clock).toBeGreaterThanOrEqual(60 * 60);
    const starter = clocksOf(script, 0, 9);
    expect(starter.length).toBeGreaterThan(0);
    for (const clock of starter) expect(clock).toBeLessThan(60 * 60);
    // Nobody off the pitch is passed to, tackled by or handed the ball.
    expect(validateScript(d, script).filter((p) => p.endsWith(':window'))).toEqual([]);
  });

  it('a row waits for the man who wins it to be on the pitch', () => {
    // Side 1's line 4 goes off after 30; its substitute, line 11, intercepts a pass of side 0's.
    const d = substituted(smallDetail(), 1, 4, 30);
    d.events.push(row(0, 2, 2, 11));
    const id = d.events.length - 1;
    const script = written(d);
    const beat = script.beats.find((b) => b.event === id)!;
    expect(beat.opponent).toBe(11);
    expect(beat.clock).toBeGreaterThanOrEqual(30 * 60);
  });

  it('extra-time rows are played after the ninetieth minute', () => {
    // Its extra-time rows have no minute before the ninety-first, and its regulation rows none
    // after the ninetieth (T827 writes it).
    const d: MatchDetail = structuredClone(smallDetail());
    d.length = 120;
    d.stints = d.stints.map((s) => [s[ST.side]!, s[ST.line]!, s[ST.slot]!, 0, 120]);
    d.events.push([...row(0, 6).slice(0, EV.period), 1]);
    const script = written(d);
    const beat = script.beats.find((b) => b.event === d.events.length - 1)!;
    expect(beat.clock).toBeGreaterThanOrEqual(90 * 60);
    expect(beat.period).toBeGreaterThanOrEqual(3);
    const touches = buildTouches(d, dealFixed(d));
    const windows = touchWindows(d, touches);
    const extra = touches.findIndex(
      (t) =>
        t.release !== undefined && 'event' in t.release && t.release.event === d.events.length - 1,
    );
    expect(windows[extra]!.indexOf(true)).toBe(90);
    windows.forEach((w, i) => {
      if (i !== extra) expect(w.lastIndexOf(true), `touch ${i}`).toBeLessThan(90);
    });
  });

  it('a period ends with its own rows played', () => {
    // Side 1's line 6 leaves after 20 with every row of his still floating: all are played before he goes.
    const d = substituted(smallDetail(), 1, 6, 20);
    d.events.push(row(1, 6), row(1, 6, 0, -1, 27, 32), row(1, 6, 0, -1, 12, 17));
    const script = written(d);
    const rows = clocksOf(script, 1, 6);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const clock of rows) expect(clock).toBeLessThan(20 * 60);
    // Every regulation row is played in the ninety minutes.
    expect(script.beats[script.beats.length - 1]!.clock).toBeLessThan(90 * 60);
  });

  it('a detail whose rows cannot all be placed returns problems, never a partial script', () => {
    // Side 0's line 2 is off after 30 and side 1's line 11 on only from it: a pass of 2's that 11
    // intercepts has no minute.
    const d = substituted(substituted(smallDetail(), 0, 2, 30), 1, 4, 30);
    d.events.push(row(0, 2, 2, 11));
    const r = writeScript(d, 'fit');
    expect(r).toEqual({ problems: [`unplaced:event:${d.events.length - 1}`] });
    expect('script' in r).toBe(false);
  });

  it('writes every incident and special scene, refusing none by name (T827)', () => {
    const base = smallDetail();
    const dissent: MatchDetail = structuredClone(base);
    dissent.incidents.push([70, 1, 0, 2, -1, 2, -1]);
    const penalty: MatchDetail = structuredClone(base);
    const [kick, foul] = [penalty.shots.length, penalty.fouls.length];
    penalty.fouls.push([0, 32, 3, 9, -1, 1, 0, kick, -1]);
    penalty.shots.push([0, 50, 32, 3, 0, 76, 0, 0, 9, -1, -1, 0, foul]);
    for (const d of [substituted(base, 0, 9, 60), dissent, penalty]) {
      const r = writeScript(d, 'fit');
      expect('problems' in r ? r.problems : []).toEqual([]);
    }
  });
});
