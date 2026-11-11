import { describe, expect, it } from 'vitest';
import type { MatchScript, ScriptBeat } from '../../../contracts/src/match-script';
import { CENTRE } from './cells';
import { compareRecord, countScript } from './count';
import {
  CARD_REASONS,
  EV,
  FO,
  INCIDENT_KINDS,
  R,
  SH,
  SHOT_KINDS,
  SHOT_OUTCOMES,
  ST,
  settlePairs,
  settlePenaltyFouls,
  type MatchDetail,
} from './detail';
import { loadDetail } from './script.testkit';
import { validateScript } from './validate';
import { penaltySpot, writeScript } from './write';

// Hand-built details (T827): the prototype's match s01 (every line on for 90 minutes) with
// substitutions, cards, injuries, penalties, extra time and a shoot-out added to its record.

const K = (kind: (typeof INCIDENT_KINDS)[number]) => INCIDENT_KINDS.indexOf(kind);
const REASON = (reason: (typeof CARD_REASONS)[number]) => CARD_REASONS.indexOf(reason);
const base = (): MatchDetail => structuredClone(loadDetail('s01'));
/**
 * An outfield line of `side` that the record fixes to no minute after `from` (no shot, key pass,
 * source, booked foul or kept goal), so he may leave then; the `skip`th such.
 */
function free(d: MatchDetail, side: 0 | 1, from: number, skip = 0): number {
  const fixed = new Set<number>();
  for (const s of d.shots) {
    if (s[SH.minute]! <= from) continue;
    if (s[SH.side] === side) {
      fixed.add(s[SH.shooter]!);
      fixed.add(s[SH.passer]!);
    } else fixed.add(s[SH.keeper]!);
  }
  for (const f of d.fouls)
    if (f[FO.cardMinute]! > from)
      fixed.add(f[FO.fouledSide] === side ? f[FO.fouled]! : f[FO.fouler]!);
  return d.sides[side].lines.flatMap((l, line) => (l.slot > 0 && !fixed.has(line) ? [line] : []))[
    skip
  ]!;
}

/** `detail` with line `line` of `side` off and a new line in his slot from record minute `stamp` on; the new line's index. */
function substitute(detail: MatchDetail, side: 0 | 1, line: number, stamp: number): number {
  const off = detail.sides[side].lines[line]!;
  const on = detail.sides[side].lines.length;
  detail.sides[side].lines.push({ ...off, id: `${off.id}:sub` });
  detail.stints = detail.stints.map((s) =>
    s[ST.side] === side && s[ST.line] === line ? [side, line, off.slot, 0, stamp - 1] : s,
  );
  detail.stints.push([side, on, off.slot, stamp - 1, detail.length]);
  return on;
}
/** `detail` with line `line` of `side` off the pitch from record minute `stamp` on, nobody in his place. */
function sendOff(detail: MatchDetail, side: 0 | 1, line: number, stamp: number) {
  detail.stints = detail.stints.map((s) =>
    s[ST.side] === side && s[ST.line] === line ? [side, line, s[ST.slot]!, 0, stamp - 1] : s,
  );
}
const written = (detail: MatchDetail, seed = 'fit'): MatchScript => {
  const r = writeScript(detail, seed);
  if ('problems' in r) throw new Error(r.problems.join(', '));
  expect(validateScript(detail, r.script)).toEqual([]);
  expect(compareRecord(detail, countScript(r.script, detail))).toEqual([]);
  return r.script;
};
const showing = (script: MatchScript, incident: number) =>
  script.beats.find((b) => b.incidents?.some((x) => x.incident === incident))!;
const names = (b: ScriptBeat, side: 0 | 1, line: number) =>
  (b.side === side && (b.actor === line || b.receiver === line)) ||
  (b.side !== side && b.opponent === line);
const minuteOf = (b: ScriptBeat) => Math.floor(b.clock / 60);
/** The next beat after `b` that is not a stoppage. */
const after = (script: MatchScript, b: ScriptBeat) =>
  script.beats.slice(b.index + 1).find((x) => x.kind !== 'stoppage')!;

/** s01 with one of side 0's lines replaced by a substitute at 61, who has rows of his own. */
function withSubstitution() {
  const d = base();
  const off = free(d, 0, 60);
  const on = substitute(d, 0, off, 61);
  d.incidents.push([61, 0, K('sub'), off, on, -1, -1]);
  // [side, group, kind, setPiece, from, to, actor, result, lineBreaking, other, period]
  d.events.push(
    [0, 900, 0, 0, 22, 27, on, 0, 0, -1, 0],
    [0, 901, 0, 0, 27, 32, on, 0, 0, -1, 0],
    [0, 902, 0, 0, 22, 27, on, 2, 0, 4, 0],
  );
  return { d, off, on, incident: d.incidents.length - 1 };
}

/** A penalty of side 0 in `minute`: its foul in the box on line 8 by side 1's line 2, kicked by line 8. */
function withPenalty(d: MatchDetail, minute: number, outcome: (typeof SHOT_OUTCOMES)[number]) {
  const foul = d.fouls.length;
  const kick = d.shots.length;
  d.fouls.push([0, 32, 2, 8, -1, 1, 0, kick, -1]);
  // [side, minute, cell, kind, header, xg, outcome, corner, shooter, passer, source, keeper, foul]
  d.shots.push([
    0,
    minute,
    32,
    SHOT_KINDS.indexOf('penalty'),
    0,
    76,
    SHOT_OUTCOMES.indexOf(outcome),
    0,
    8,
    -1,
    -1,
    0,
    foul,
  ]);
  return { foul, kick };
}

/** s01 played to 120 minutes, with completed open-play rows of extra time. */
function withExtraTime() {
  const d = base();
  d.length = 120;
  d.stints = d.stints.map((s) => [s[ST.side]!, s[ST.line]!, s[ST.slot]!, 0, 120]);
  const extra = d.events
    .filter((e) => e[EV.group]! < 12 && e[EV.result] === R.complete && e[EV.setPiece] === 0)
    .map((e) => [...e.slice(0, EV.period), 1]);
  extra.forEach((e) => (e[EV.group] = e[EV.group]! + 1000));
  d.events.push(...extra);
  return d;
}

describe('the script’s incidents (T827)', () => {
  it('a substitution is a beat of its recorded minute at a dead ball, the man off and the man on named', () => {
    const { d, off, on, incident } = withSubstitution();
    const script = written(d);
    const b = showing(script, incident);
    expect(b.kind).toBe('stoppage');
    expect(b.from).toEqual(b.to);
    expect(minuteOf(b)).toBe(60);
    expect(b.incidents).toEqual([{ kind: 'sub', side: 0, line: off, other: on, incident }]);
    // Play stops for it and starts again from where the ball stood.
    expect(after(script, b).from).toEqual(b.to);
  });

  it('nobody plays a row after he has gone off, and the man who came on plays none before', () => {
    const { d, off, on, incident } = withSubstitution();
    const script = written(d);
    const at = showing(script, incident).index;
    const play = script.beats.filter((b) => b.kind !== 'stoppage');
    const left = play.filter((b) => names(b, 0, off)).map((b) => b.index);
    const sub = play.filter((b) => names(b, 0, on)).map((b) => b.index);
    expect(left.length).toBeGreaterThan(0);
    expect(sub.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...left)).toBeLessThan(at);
    expect(Math.min(...sub)).toBeGreaterThan(at);
  });

  it("a booked foul shows its card on the foul's beat", () => {
    const d = base();
    const foul = d.fouls.findIndex((f) => f[FO.card]! >= 0);
    const card = d.fouls[foul]![FO.card]!;
    const script = written(d);
    const b = script.beats.find((x) => x.foul === foul)!;
    expect(b.incidents).toEqual([
      {
        kind: 'yellow',
        side: 1 - d.fouls[foul]![FO.fouledSide]!,
        line: b.opponent,
        incident: card,
      },
    ]);
    expect(minuteOf(b)).toBe(d.fouls[foul]![FO.cardMinute]! - 1);
  });

  it('a card without a foul stops play for it', () => {
    const d = base();
    d.incidents.push([70, 1, K('yellow'), 2, -1, REASON('dissent'), -1]);
    const script = written(d);
    const b = showing(script, d.incidents.length - 1);
    expect(b.kind).toBe('stoppage');
    expect(minuteOf(b)).toBe(69);
    expect(b.incidents).toEqual([
      { kind: 'yellow', side: 1, line: 2, reason: 'dissent', incident: d.incidents.length - 1 },
    ]);
  });

  it('a red card leaves its side a man short from that beat on', () => {
    const d = base();
    const red = free(d, 1, 49);
    const incident = d.incidents.length;
    d.incidents.push([50, 1, K('red'), red, -1, REASON('serious'), -1]);
    d.fouls.push([0, 22, red, 5, 50, 0, 0, -1, incident]);
    sendOff(d, 1, red, 50);
    const script = written(d);
    const b = showing(script, incident);
    expect(b.foul).toBe(d.fouls.length - 1);
    expect(b.opponent).toBe(red);
    expect(minuteOf(b)).toBe(49);
    expect(script.beats.slice(b.index + 1).filter((x) => names(x, 1, red))).toEqual([]);
    // Nobody comes on for him: side 1 plays on with ten (the validator counts its men each minute).
    expect(d.sides[1].lines).toHaveLength(11);
  });

  it('a second yellow is a card beat that sends him off', () => {
    const d = base();
    // A man booked for dissent at 20 fouls at 60 and is booked again.
    const man = free(d, 1, 19, 1);
    d.incidents.push([20, 1, K('yellow'), man, -1, REASON('dissent'), -1]);
    const incident = d.incidents.length;
    d.incidents.push([60, 1, K('secondYellow'), man, -1, REASON('reckless'), -1]);
    d.fouls.push([0, 27, man, 7, 60, 0, 0, -1, incident]);
    sendOff(d, 1, man, 60);
    const script = written(d);
    const b = showing(script, incident);
    expect(b.foul).toBe(d.fouls.length - 1);
    expect(b.incidents).toEqual([
      { kind: 'secondYellow', side: 1, line: man, reason: 'reckless', incident },
    ]);
    expect(script.beats.slice(b.index + 1).filter((x) => names(x, 1, man))).toEqual([]);
  });

  it('an injured player leaves in his recorded minute, with his replacement when the record names one', () => {
    const d = base();
    const hurtLine = free(d, 0, 60);
    const on = substitute(d, 0, hurtLine, 61);
    const hurt = d.incidents.length;
    d.incidents.push(
      [61, 0, K('injury'), hurtLine, -1, -1, -1],
      [61, 0, K('sub'), hurtLine, on, -1, -1],
    );
    d.events.push([0, 900, 0, 0, 22, 27, on, 0, 0, -1, 0]);
    // A man of side 1 is hurt at 75 with nobody to replace him.
    const lone = free(d, 1, 74);
    const alone = d.incidents.length;
    d.incidents.push([75, 1, K('injury'), lone, -1, -1, -1]);
    sendOff(d, 1, lone, 75);
    const script = written(d);
    const b = showing(script, hurt);
    expect(b.kind).toBe('stoppage');
    expect(minuteOf(b)).toBe(60);
    expect(b.incidents!.map((x) => x.kind)).toEqual(['injury', 'sub']);
    expect(b.incidents![1]!.other).toBe(on);
    const c = showing(script, alone);
    expect(minuteOf(c)).toBe(74);
    expect(c.incidents).toEqual([{ kind: 'injury', side: 1, line: lone, incident: alone }]);
    expect(script.beats.slice(c.index + 1).filter((x) => names(x, 1, lone))).toEqual([]);
  });

  it('a penalty is its foul in the box, the kick from the spot by the recorded taker and its recorded outcome', () => {
    const d = base();
    const { foul, kick } = withPenalty(d, 50, 'goal');
    const script = written(d);
    const f = script.beats.find((b) => b.foul === foul)!;
    expect(f.outcome).toBe('foul');
    expect(f.opponent).toBe(2);
    const p = after(script, f);
    expect(p.kind).toBe('penalty');
    expect(p.shot).toBe(kick);
    expect(p.actor).toBe(8);
    expect(p.from).toEqual(penaltySpot(0));
    expect(p.outcome).toBe('goal');
    expect(minuteOf(p)).toBe(49);
    const restart = script.beats[p.index + 1]!;
    expect([restart.kind, restart.side, restart.from]).toEqual(['kickOff', 1, CENTRE]);
  });

  it('a saved or missed penalty restarts play as its outcome says', () => {
    const d = base();
    const saved = withPenalty(d, 50, 'save');
    const missed = withPenalty(d, 65, 'miss');
    const script = written(d);
    const s = script.beats.find((b) => b.shot === saved.kick)!;
    expect([s.kind, s.outcome, s.opponent]).toEqual(['penalty', 'saved', 0]);
    // The keeper has it and distributes it.
    const next = script.beats[s.index + 1]!;
    expect([next.side, next.actor, next.from]).toEqual([1, 0, s.to]);
    const m = script.beats.find((b) => b.shot === missed.kick)!;
    expect([m.kind, m.outcome]).toEqual(['penalty', 'wide']);
    expect([script.beats[m.index + 1]!.kind, script.beats[m.index + 1]!.side]).toEqual([
      'goalKick',
      1,
    ]);
  });

  it('extra time opens with a kick-off for each of its halves', () => {
    const d = withExtraTime();
    const script = written(d);
    for (const [clock, side, period] of [
      [5400, 0, 3],
      [6300, 1, 4],
    ] as const) {
      const b = script.beats.find((x) => x.clock >= clock)!;
      expect([b.kind, b.side, b.from, b.clock, b.period]).toEqual([
        'kickOff',
        side,
        CENTRE,
        clock,
        period,
      ]);
    }
    // Extra time's rows are played in it, and regulation's before it.
    for (const b of script.beats) {
      if (b.event === undefined) continue;
      expect(b.clock >= 5400, `beat ${b.index}`).toBe(d.events[b.event]![EV.period] === 1);
    }
  });

  it("the shoot-out's kicks alternate in the recorded order after the last whistle and change no ordinary score", () => {
    const d = withExtraTime();
    d.shootout = [
      [0, 9, 1],
      [1, 9, 0],
      [0, 8, 1],
      [1, 8, 1],
      [0, 7, 0],
      [1, 7, 0],
      [0, 6, 1],
      [1, 6, 1],
      [0, 5, 1],
      [1, 5, 0],
    ];
    const script = written(d);
    const kicks = script.beats.filter((b) => b.kind === 'shootoutKick');
    expect(kicks.map((b) => [b.side, b.actor])).toEqual(d.shootout.map((k) => [k[0], k[1]]));
    expect(script.beats.slice(-kicks.length)).toEqual(kicks);
    for (const [j, b] of kicks.entries()) {
      expect(b.kick).toBe(j);
      expect(b.period).toBe(5);
      expect(b.clock).toBeGreaterThanOrEqual(120 * 60);
      expect(b.from).toEqual(penaltySpot(b.side));
      expect(b.outcome === 'goal').toBe(d.shootout[j]![2] === 1);
      expect(['goal', 'saved', 'wide']).toContain(b.outcome);
      expect(b.shot).toBeUndefined();
    }
    const counted = countScript(script, d);
    const without = writeScript({ ...d, shootout: [] }, 'fit');
    if ('problems' in without) throw new Error(without.problems.join(', '));
    expect(counted.score).toEqual(countScript(without.script, { ...d, shootout: [] }).score);
    expect(counted.shootout).toEqual({ home: 4, away: 2 });
  });
});

describe('the validator on incidents (T827)', () => {
  const { d, off, on, incident } = withSubstitution();
  const script = written(d);
  const at = showing(script, incident).index;
  const edit = (f: (beats: ScriptBeat[]) => void): MatchScript => {
    const beats = structuredClone(script.beats);
    f(beats);
    return { ...script, beats };
  };

  it('fails an incident off its recorded minute', () => {
    const late = edit((beats) => {
      beats[at]!.clock = 62 * 60;
    });
    expect(validateScript(d, late)).toContain(`beat:${at}:incident:${incident}:minute`);
  });

  it('fails a man who plays outside his time on the pitch', () => {
    const p = validateScript(
      d,
      edit((beats) => {
        const b = beats.slice(at + 1).find((x) => x.side === 0 && x.actor === on)!;
        b.actor = off;
      }),
    );
    expect(p.some((x) => x.endsWith(':off'))).toBe(true);
    expect(p.some((x) => x.endsWith(':window'))).toBe(true);
  });

  it('fails a side that fields more men than its record allows', () => {
    // A red card whose beat does not send its man off leaves his side eleven.
    const r = base();
    const red = free(r, 1, 49);
    const card = r.incidents.length;
    r.incidents.push([50, 1, K('red'), red, -1, REASON('violent'), -1]);
    r.fouls.push([0, 22, red, 5, 50, 0, 0, -1, card]);
    sendOff(r, 1, red, 50);
    const s = written(r);
    const edited = structuredClone(s);
    delete edited.beats[showing(s, card).index]!.incidents;
    expect(validateScript(r, edited)).toContain('minute:49:side:1:men');
  });

  it('fails a shoot-out kick missing or out of order', () => {
    const e = withExtraTime();
    e.shootout = [
      [0, 9, 1],
      [1, 9, 1],
      [0, 8, 1],
      [1, 8, 0],
    ];
    const s = written(e);
    const n = s.beats.length;
    const missing = { ...s, beats: s.beats.slice(0, n - 1) };
    expect(validateScript(e, missing)).toContain('shootout:3:missing');
    const swapped = structuredClone(s);
    [swapped.beats[n - 1], swapped.beats[n - 2]] = [swapped.beats[n - 2]!, swapped.beats[n - 1]!];
    expect(validateScript(e, swapped).some((x) => x.startsWith('shootout:'))).toBe(true);
  });
});

describe('details the writer can play (T827)', () => {
  it('a booked penalty foul whose card is in another minute trades places with an unbooked foul', () => {
    // The case of four of T825's sixty: the box row's only foul booked at 6, its kick at 88. Here a
    // booked foul of s01 becomes its side's penalty foul, kicked twenty minutes after the card.
    const d = base();
    const g = d.fouls.findIndex((f) => f[FO.card]! >= 0);
    const f = d.fouls[g]!;
    const side = f[FO.fouledSide] as 0 | 1;
    const minute = (f[FO.cardMinute]! + 20) % 90 || 70;
    const kick = d.shots.length;
    d.shots.push([side, minute, 32, SHOT_KINDS.indexOf('penalty'), 0, 76, 0, 0, 8, -1, -1, 0, g]);
    f[FO.cell] = 32;
    f[FO.penalty] = 1;
    f[FO.shot] = kick;
    expect(writeScript(d, 'fit')).toMatchObject({ problems: [expect.stringContaining('booked')] });
    const men = (x: MatchDetail) =>
      x.fouls.map((r) => [r[FO.fouledSide], r[FO.fouler], r[FO.fouled], r[FO.card]].join()).sort();
    const before = men(d);
    expect(settlePenaltyFouls(d)).toBe(0);
    expect(d.fouls[g]![FO.cardMinute]).toBe(-1);
    expect(men(d)).toEqual(before);
    written(d);
  });

  it('a ball won by a man who never met the man who lost it trades winners with another row', () => {
    // A man of side 1 is off at 30 and his substitute on from it, and a man of side 0 off at 30
    // too: the latter's lost ball is drawn to the substitute, another man's to the man who left.
    const d = base();
    const away = free(d, 1, 29);
    const sub = substitute(d, 1, away, 31);
    d.incidents.push([31, 1, K('sub'), away, sub, -1, -1]);
    const home = free(d, 0, 29);
    const two = substitute(d, 0, home, 31);
    d.incidents.push([31, 0, K('sub'), home, two, -1, -1]);
    const stays = free(d, 0, 29, 1);
    d.events.push(
      [0, 990, 0, 0, 22, 27, home, 2, 0, sub, 0],
      [0, 990, 0, 0, 22, 27, stays, 2, 0, away, 0],
    );
    expect(writeScript(d, 'fit')).toMatchObject({ problems: expect.anything() });
    expect(settlePairs(d)).toBe(0);
    const rows = d.events.slice(-2);
    expect(rows.map((e) => [e[EV.actor], e[EV.other]])).toEqual([
      [home, away],
      [stays, sub],
    ]);
    written(d);
  });
});
