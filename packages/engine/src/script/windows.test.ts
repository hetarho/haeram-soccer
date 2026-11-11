import { describe, expect, it } from 'vitest';
import { smallDetail } from '../../../../tests/fixtures/match-script';
import type { MatchDetail } from './detail';
import { writePeriods, writeScript } from './write';
import { validateScript } from './validate';
import { compareRecord, countScript } from './count';
import { touchWindow } from './windows';
import { buildTouches, dealFixed } from './touches';
const event = (
  side: number,
  id: number,
  actor: number,
  from = 17,
  to = 22,
  result = 0,
  other = -1,
  period = 0,
) => [side, id, 0, 0, from, to, actor, result, 0, other, period];
const write = (d: MatchDetail) => {
  const r = writePeriods(d, 'windows-unit');
  if ('problems' in r) throw new Error(r.problems.join(';'));
  expect(validateScript(d, r.script)).toEqual([]);
  expect(compareRecord(d, countScript(r.script, d))).toEqual([]);
  return r.script;
};
const sub = (d: MatchDetail, side: 0 | 1, line: number, at: number) => {
  d.sides[side].lines.push({ ...d.sides[side].lines[line]!, id: `sub:${side}:${line}` });
  const index = d.sides[side].lines.length - 1;
  d.stints.find((s) => s[0] === side && s[1] === line)![4] = at;
  d.stints.push([side, index, line, at, d.length]);
  d.incidents.push([at + 1, side, 3, line, index, -1]);
  return index;
};

describe('script placement windows', () => {
  it("a substitute's rows are played inside his stint", () => {
    const d = smallDetail([event(0, 0, 11), event(0, 1, 1), event(1, 0, 5, 22, 17, 2, 5)]);
    sub(d, 0, 1, 30);
    const script = write(d),
      row = script.beats.find((b) => b.event === 0)!;
    expect(row.actor).toBe(11);
    expect(row.clock).toBeGreaterThanOrEqual(30 * 60);
    expect(script.beats.find((b) => b.event === 1)!.clock).toBeLessThan(30 * 60);
    expect('script' in writeScript(d, 'public')).toBe(true);
  });
  it('a row waits for the man who wins it to be on the pitch', () => {
    const d = smallDetail([event(0, 0, 5, 17, 22, 2, 11), event(1, 0, 11, 22, 17)]);
    sub(d, 1, 1, 70);
    const script = write(d),
      b = script.beats.find((b) => b.event === 0)!;
    expect(b.clock).toBeGreaterThanOrEqual(70 * 60);
    expect(b.opponent).toBe(11);
  });
  it('extra-time rows are played after the ninetieth minute', () => {
    const d = smallDetail([
      event(0, 0, 5),
      event(0, 1, 6, 17, 22, 0, -1, 1),
      event(1, 0, 7, 22, 17, 0, -1, 1),
    ]);
    d.length = 120;
    d.added = [0, 0, 0, 0];
    d.stints.forEach((s) => (s[4] = 120));
    const script = write(d);
    expect(script.beats.find((b) => b.event === 0)!.clock).toBeLessThan(5400);
    for (const id of [1, 2]) {
      const b = script.beats.find((b) => b.event === id)!;
      expect([3, 4]).toContain(b.period);
      expect(b.clock).toBeGreaterThanOrEqual(5400);
    }
    expect('script' in writeScript(d, 'public')).toBe(true);
  });
  it('a period ends with its own rows played', () => {
    const d = smallDetail(
      Array.from({ length: 20 }, (_, i) => event(0, i, 1, 17 + (i % 2) * 5, 22 + (i % 2) * 5)),
    );
    sub(d, 0, 1, 1);
    const script = write(d);
    expect(script.beats.filter((b) => b.event !== undefined)).toHaveLength(20);
    expect(script.beats.filter((b) => b.event !== undefined).every((b) => b.clock < 60)).toBe(true);
  });
  it('a detail whose rows cannot all be placed returns problems, never a partial script', () => {
    const d = smallDetail([event(0, 0, 1, 17, 22, 2, 1)]);
    sub(d, 0, 1, 20);
    sub(d, 1, 1, 30);
    // The two named participants have disjoint stints within the same period.
    d.events[0]![9] = 11;
    const r = writePeriods(d, 'impossible');
    expect('problems' in r).toBe(true);
    expect('script' in r).toBe(false);
    expect(touchWindow(d, [0]).from).toBeGreaterThanOrEqual(touchWindow(d, [0]).until);
  });
  it('never joins equal local line indexes from opposing teams or across periods', () => {
    const d = smallDetail([event(0, 0, 5), [1, 0, 5, 0, 12, 17, 5, 0, 0, -1, 0], event(1, 1, 5)]);
    const t = buildTouches(d, dealFixed(d));
    expect(t.find((x) => x.side === 0)!.carries).toEqual([]);
    expect(t.find((x) => x.side === 1)!.carries).toEqual([1]);
  });
});
