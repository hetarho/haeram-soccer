import { describe, expect, it } from 'vitest';
import { smallDetail } from '../../../../tests/fixtures/match-script';
import type { MatchDetail } from './detail';
import { FO, IN } from './codes';
import { writeScript } from './write';
import { compareRecord, countScript } from './count';
import { validateScript } from './validate';
import { restartSpot } from './cells';

const event = (side: number, id: number, actor: number, result = 0, other = -1) => [
  side,
  id,
  0,
  0,
  17,
  22,
  actor,
  result,
  0,
  other,
  0,
];
const detail = () => smallDetail([event(0, 0, 1), event(0, 1, 5), event(1, 0, 1), event(1, 1, 5)]);
function replace(d: MatchDetail, side: 0 | 1, line: number, minute: number) {
  const next = d.sides[side].lines.length;
  d.sides[side].lines.push({ ...d.sides[side].lines[line]!, id: `${side}:sub:${next}` });
  d.stints.find((s) => s[0] === side && s[1] === line)![4] = minute - 1;
  d.stints.push([side, next, line, minute - 1, d.length]);
  d.incidents.push([minute, side, 3, line, next, -1]);
  return next;
}
function write(d: MatchDetail) {
  const r = writeScript(d, 'incident-unit');
  if ('problems' in r) throw new Error(r.problems.join(';'));
  expect(validateScript(d, r.script)).toEqual([]);
  expect(compareRecord(d, countScript(r.script, d))).toEqual([]);
  expect(writeScript(d, 'incident-unit')).toEqual(r);
  return r.script;
}
const scene = (s: ReturnType<typeof write>, kind: string) =>
  s.beats.find((b) => b.incidents?.some((x) => x.kind === kind))!;

describe('script incidents and special scenes', () => {
  it('keeps a key-pass delivery attached to a non-goal shot through a same-minute change', () => {
    const d = smallDetail(
      [[0, 0, 0, 0, 22, 32, 5, 0, 0, -1, 0]],
      [[0, 61, 32, 0, 0, 6, 3, 0, 9, 5, 0, 0]],
    );
    const next = replace(d, 0, 9, 61);
    d.shots[0]![8] = next;
    write(d);
  });
  it('plays a booked penalty cause and its delivery around a same-minute substitution', () => {
    const d = smallDetail(
      [],
      [[0, 61, 32, 3, 0, 76, 1, 0, 9, -1, -1, 0]],
      [[0, 32, 3, 5, 61, 1, 0]],
    );
    d.penalties = [[0, 0]];
    d.incidents = [[61, 1, 0, 3, -1, 0]];
    const next = replace(d, 0, 5, 61);
    d.fouls[0]![3] = next;
    write(d);
  });
  it('plays a booked foul before its fouler is substituted in that minute', () => {
    const d = smallDetail([], [], [[0, 22, 3, 5, 61, 0, 0]]);
    d.incidents = [[61, 1, 0, 3, -1, 0]];
    replace(d, 1, 3, 61);
    const s = write(d),
      foul = scene(s, 'yellow'),
      sub = scene(s, 'sub');
    expect(sub).toBe(foul); // The foul creates the dead ball at which he is replaced.
    // A boundary foul is still refused after the actual exit, even in the same minute.
    const earlyExit = {
      ...foul,
      kind: 'stoppage' as const,
      move: 'incident',
      outcome: 'complete' as const,
      to: foul.from,
      foul: undefined,
      opponent: undefined,
      incidents: foul.incidents!.filter((x) => x.kind === 'sub'),
    };
    foul.incidents = foul.incidents!.filter((x) => x.kind !== 'sub');
    s.beats.splice(foul.index, 0, earlyExit);
    s.beats.forEach((b, i) => (b.index = i));
    expect(validateScript(d, s)).toContain(`beat:${foul.index}:lineup`);
  });
  it('a substitution is a dead-ball beat of its recorded minute, naming both men', () => {
    const d = detail();
    const next = replace(d, 0, 1, 61);
    d.events.push(event(0, 2, next));
    const s = write(d),
      b = scene(s, 'sub');
    expect(b.kind).toBe('stoppage');
    expect(Math.floor(b.clock / 60) + 1).toBe(61);
    expect(b.incidents).toEqual([{ kind: 'sub', side: 0, line: 1, other: next }]);
    expect(s.beats.find((b) => b.event === 0)!.clock).toBeLessThan(3600);
    expect(s.beats.find((b) => b.event === 4)!.index).toBeGreaterThan(b.index);
    expect(
      s.beats
        .filter((x) => x.index > b.index && x.side === 0)
        .every((x) => x.actor !== 1 && x.receiver !== 1),
    ).toBe(true);
  });
  it.each([46, 91, 106])('a minute %i change rides its half kick-off', (minute) => {
    const d = detail();
    if (minute > 90) {
      d.length = 120;
      d.added = [0, 0, 0, 0];
      d.stints.forEach((s) => (s[4] = 120));
    }
    replace(d, 0, 1, minute);
    const b = scene(write(d), 'sub');
    expect(b.kind).toBe('kickOff');
    expect(b.clock).toBe((minute - 1) * 60);
  });
  it('a booked foul shows its card on the foul beat', () => {
    const d = smallDetail([], [], [[0, 22, 3, 5, 40, 0, 0]]);
    d.incidents = [[40, 1, 0, 3, -1, 0]];
    const s = write(d),
      b = scene(s, 'yellow');
    expect(b.foul).toBe(0);
    expect(b.incidents).toEqual([{ kind: 'yellow', side: 1, line: 3, reason: 'reckless' }]);
    b.incidents = [];
    expect(compareRecord(d, countScript(s, d))).not.toEqual([]);
  });
  it('a dissent card without a foul stops play for it', () => {
    const d = detail();
    d.incidents = [[15, 0, 0, 1, -1, 2]];
    const b = scene(write(d), 'yellow');
    expect(b.kind).toBe('stoppage');
    expect(b.foul).toBeUndefined();
    expect(b.incidents![0]!.reason).toBe('dissent');
  });
  it.each([1, 2])('a dismissal (%i) sends the fouler off on that beat', (kind) => {
    const d = smallDetail([event(1, 0, 3)], [], [[0, 22, 3, 5, 40, 0, 0]]);
    d.incidents =
      kind === 1
        ? [
            [10, 1, 0, 3, -1, 2],
            [40, 1, 1, 3, -1, 0],
          ]
        : [[40, 1, 2, 3, -1, 4]];
    d.stints.find((s) => s[0] === 1 && s[1] === 3)![4] = 39;
    const s = write(d),
      b = scene(s, kind === 1 ? 'secondYellow' : 'red');
    expect(b.foul).toBe(0);
    expect(s.beats.find((b) => b.event === 0)!.index).toBeLessThan(b.index);
    expect(
      s.beats
        .slice(b.index + 1)
        .some(
          (x) =>
            (x.side === 1 && (x.actor === 3 || x.receiver === 3)) ||
            (x.side === 0 && x.opponent === 3),
        ),
    ).toBe(false);
  });
  it.each([false, true])('an injury leaves in its minute, replacement %s', (withReplacement) => {
    const d = detail();
    d.incidents = [[61, 0, 4, 1, -1, -1]];
    if (withReplacement) replace(d, 0, 1, 61);
    else d.stints.find((s) => s[0] === 0 && s[1] === 1)![4] = 60;
    const s = write(d),
      b = scene(s, 'injury');
    expect(Math.floor(b.clock / 60)).toBe(60);
    expect(b.incidents!.map((x) => x.kind)).toEqual(
      withReplacement ? ['injury', 'sub'] : ['injury'],
    );
    expect(s.beats.slice(b.index + 1).some((x) => x.side === 0 && x.actor === 1)).toBe(false);
  });
  it('a keeper replacement is the keeper the record names on the next save', () => {
    const d = smallDetail([], [], [[0, 27, 3, 5, -1, 0, 0]]);
    d.incidents = [[61, 1, 4, 0, -1, -1]];
    const next = replace(d, 1, 0, 61);
    d.shots = [[0, 70, 27, 2, 0, 10, 1, 0, 9, -1, -1, next]];
    const s = write(d);
    expect(s.beats.find((b) => b.shot === 0)!.opponent).toBe(next);
  });
  it('an outfielder taking the gloves keeps both parts of his recorded spell', () => {
    const d = smallDetail(
      [event(1, 0, 3)],
      [[0, 70, 27, 2, 0, 10, 1, 0, 9, -1, -1, 3]],
      [[0, 27, 5, 6, -1, 0, 0]],
    );
    d.incidents = [[61, 1, 4, 0, -1, -1]];
    d.stints.find((s) => s[0] === 1 && s[1] === 0)![4] = 60;
    d.stints.find((s) => s[0] === 1 && s[1] === 3)![4] = 60;
    d.stints.push([1, 3, 0, 60, 90]);
    const s = write(d);
    expect(s.beats.find((b) => b.shot === 0)!.opponent).toBe(3);
    expect(s.beats.some((b) => b.event === 0)).toBe(true);
  });
  it('a keeper who comes on cannot receive the ball before his substitution', () => {
    const d = smallDetail();
    const next = replace(d, 0, 0, 61);
    const s = write(d),
      b = scene(s, 'sub');
    expect(
      s.beats
        .slice(0, b.index)
        .some((x) =>
          x.side === 0 ? x.actor === next || x.receiver === next : x.opponent === next,
        ),
    ).toBe(false);
    expect(s.beats.some((x) => x.kind === 'stoppage')).toBe(true);
  });
  it('uses an existing goal as the minute dead ball and keeps its owed kick-off', () => {
    const d = smallDetail(
      [[0, 0, 5, 0, 27, 32, 9, 0, 0, -1, 0]],
      [[0, 30, 32, 0, 0, 20, 0, 0, 9, -1, 0, 0]],
    );
    replace(d, 1, 1, 30);
    const s = write(d),
      b = scene(s, 'sub');
    expect(b.shot).toBe(0);
    expect(b.outcome).toBe('goal');
    expect(s.beats[b.index + 1]!.kind).toBe('kickOff');
  });
  it('a saved penalty sent behind restarts with a corner', () => {
    const d = smallDetail(
      [[0, 0, 3, 1, 35, 32, 7, 0, 0, -1, 0]],
      [[0, 30, 32, 3, 0, 76, 1, 1, 9, -1, -1, 0]],
      [[0, 32, 3, 5, -1, 1, 0]],
    );
    d.penalties = [[0, 0]];
    const s = write(d),
      b = s.beats.find((b) => b.kind === 'penalty')!;
    expect(s.beats[b.index + 1]!.kind).toBe('corner');
  });
  it.each([0, 1, 3])(
    'a penalty (%i) follows its box foul from the spot with the recorded taker',
    (outcome) => {
      const d = smallDetail(
        [],
        [[0, 30, 32, 3, 0, 76, outcome, 0, 9, -1, -1, 0]],
        [[0, 32, 3, 5, -1, 1, 0]],
      );
      d.penalties = [[0, 0]];
      const s = write(d),
        b = s.beats.find((b) => b.shot === 0)!;
      expect(b.kind).toBe('penalty');
      expect(b.actor).toBe(9);
      expect(b.from).toEqual(restartSpot('penalty', 0, [0, 0]));
      expect(Math.floor(b.clock / 60)).toBe(29);
      expect(s.beats[b.index - 1]!.foul).toBe(0);
      const next = s.beats[b.index + 1]!;
      if (outcome === 0) expect(next.kind).toBe('kickOff');
      if (outcome === 1) {
        expect(next.kind).toBe('kickOff'); // No later recorded action: the next half starts.
        expect(b.opponent).toBe(0);
      }
      if (outcome === 3) expect(next.kind).toBe('goalKick');
      expect(d.fouls[0]![FO.penalty]).toBe(1);
    },
  );
  it('a saved penalty gives the next distribution to its recorded keeper', () => {
    const d = smallDetail(
      [[1, 0, 0, 0, 2, 32, 0, 0, 0, -1, 0]],
      [
        [0, 30, 32, 3, 0, 76, 1, 0, 9, -1, -1, 0],
        [1, 31, 32, 0, 0, 20, 0, 0, 9, 0, 0, 0],
      ],
      [[0, 32, 3, 5, -1, 1, 0]],
    );
    d.penalties = [[0, 0]];
    const s = write(d),
      b = s.beats.find((b) => b.kind === 'penalty')!;
    const next = s.beats[b.index + 1]!;
    expect([next.side, next.actor]).toEqual([1, 0]);
    expect(next.from).toEqual(b.to);
  });
  it('extra time opens each half with its kick-off; ordered shoot-out kicks change no ordinary score', () => {
    const d = smallDetail();
    d.length = 120;
    d.added = [1, 2, 1, 1];
    d.stints.forEach((s) => (s[4] = 120));
    d.shootout = [
      [0, 9, 1],
      [1, 9, 0],
      [0, 8, 1],
      [1, 8, 1],
    ];
    const s = write(d);
    expect(s.beats.filter((b) => b.kind === 'kickOff').map((b) => [b.clock, b.period])).toEqual([
      [0, 1],
      [2700, 2],
      [5400, 3],
      [6300, 4],
    ]);
    const kicks = s.beats.filter((b) => b.kind === 'shootoutKick');
    expect(kicks.map((b) => [b.side, b.actor, b.outcome === 'goal' ? 1 : 0])).toEqual(d.shootout);
    expect(kicks.every((b) => b.period === 5 && b.clock >= 7200)).toBe(true);
    expect(countScript(s, d).score).toEqual({ home: 0, away: 0 });
    expect(countScript(s, d).shootout).toEqual({ home: 2, away: 1 });
    s.beats.splice(kicks[0]!.index, 1);
    expect(validateScript(d, s)).toContain('shootout:length');
  });
  it('rejects an incident off its minute and action outside an on-pitch interval', () => {
    const d = detail();
    const next = replace(d, 0, 1, 61);
    d.events.push(event(0, 2, next));
    const s = write(d),
      b = scene(s, 'sub');
    b.clock += 60;
    expect(validateScript(d, s)).toContain('incident:0:missingOrMinute');
    b.clock -= 60;
    const later = s.beats.find((x) => x.event === 4)!;
    later.actor = 1;
    expect(validateScript(d, s)).toContain(`beat:${later.index}:stint`);
  });
  it('rejects an extra man and a shoot-out kick out of order', () => {
    const d = detail();
    replace(d, 0, 1, 61);
    const s = write(d),
      b = scene(s, 'sub');
    b.incidents![0]!.line = 99;
    expect(validateScript(d, s)).toContain(`beat:${b.index}:men`);
    d.length = 120;
    d.added = [0, 0, 0, 0];
    d.stints.forEach((s) => {
      if (s[4] === 90) s[4] = 120;
    });
    d.shootout = [
      [0, 9, 1],
      [1, 9, 0],
    ];
    const shootout = write(d),
      last = shootout.beats.at(-1)!;
    last.side = 0;
    expect(validateScript(d, shootout)).toContain('shootout:1:orderOrOutcome');
    expect(d.incidents[0]![IN.kind]).toBe(3);
  });
});
