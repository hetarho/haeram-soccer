import { describe, expect, it } from 'vitest';
import { CENTRE } from '../core/pitch.ts';
import { EV, EVENT_RESULTS, type Settled } from '../core/settled.ts';
import { PASS_KINDS, type Script } from '../core/types.ts';
import { cellAt } from './cells.ts';
import { compareRecord, countScript } from './count.ts';
import { loadSettled, smallSettled } from './fit.testkit.ts';
import { validateFitted } from './validate.ts';
import { writeFitted } from './write.ts';

const cases: [string, Settled][] = [
  ['small', smallSettled()],
  ['s01', loadSettled('s01')],
];
const written = cases.map(
  ([name, settled]) => [name, settled, writeFitted(settled, 'fit')] as const,
);
const result = (s: Settled, id: number) => EVENT_RESULTS[s.events[id]![EV.result]!];
const firstHalfStart = (script: Script) => script.beats.findIndex((b) => b.clock! >= 2700);

describe('match-proto fitted writer (T820)', () => {
  it('every event, shot and foul is performed exactly once', () => {
    for (const [name, settled, script] of written) {
      expect(validateFitted(settled, script), name).toEqual([]);
      expect(script.bound).toBe(true);
      expect(script.times).toEqual(script.beats.map((b) => b.clock));
    }
  });

  it('the ball never jumps', () => {
    for (const [name, settled, script] of written) {
      const jumps = validateFitted(settled, script).filter((p) => /:(jump|spot|restart)$/.test(p));
      expect(jumps, name).toEqual([]);
      // A completed beat leaves the ball where it ends.
      script.beats.forEach((b, i) => {
        const next = script.beats[i + 1];
        if (next === undefined || b.outcome !== 'complete' || i + 1 === firstHalfStart(script))
          return;
        expect(next.from, `${name} beat ${i + 1}`).toEqual(b.to);
      });
    }
  });

  it('a pass is received by the next man to play', () => {
    for (const [name, , script] of written) {
      script.beats.forEach((b, i) => {
        if (!PASS_KINDS.includes(b.kind) || b.outcome !== 'complete') return;
        const next = script.beats.slice(i + 1).find((x) => x.team === b.team);
        if (next === undefined || i + 1 === firstHalfStart(script)) return;
        expect(next.actor, `${name} beat ${i}`).toBe(b.receiver);
      });
    }
  });

  it('a failed pass hands the ball over as its result says', () => {
    const seen = new Set<string>();
    for (const [name, settled, script] of written) {
      script.beats.forEach((b, i) => {
        const next = script.beats[i + 1];
        if (b.event === undefined || next === undefined || i + 1 === firstHalfStart(script)) return;
        const res = result(settled, b.event);
        const at = `${name} beat ${i}`;
        if (res === 'intercepted') {
          expect(next.actor, at).toBe(b.opponent);
          expect(next.team, at).toBe(1 - b.team);
          expect(cellAt(b.team, next.from), at).toBe(settled.events[b.event]![EV.to]);
        } else if (res === 'outTouch') {
          expect([next.kind, next.team], at).toEqual(['throwIn', 1 - b.team]);
        } else if (res === 'outByline') {
          expect([next.kind, next.team], at).toEqual(['goalKick', 1 - b.team]);
        } else if (res === 'cornerWon') {
          expect([next.kind, next.team], at).toEqual(['corner', b.team]);
        } else if (res === 'offside') {
          expect([next.kind, next.team], at).toEqual(['freeKick', 1 - b.team]);
          expect(b.through).toBe(true);
          expect(b.receiver).toBe(settled.events[b.event]![EV.other]);
        } else return;
        seen.add(res!);
      });
    }
    expect([...seen].sort()).toEqual(
      ['cornerWon', 'intercepted', 'offside', 'outByline', 'outTouch'].sort(),
    );
  });

  it('goals restart from the centre and the half from the centre by the other side', () => {
    for (const [name, , script] of written) {
      const beats = script.beats;
      expect([beats[0]!.kind, beats[0]!.team, beats[0]!.clock], name).toEqual(['kickOff', 0, 0]);
      expect(beats[0]!.from).toEqual(CENTRE);
      const half = beats[firstHalfStart(script)]!;
      expect([half.kind, half.team, half.from], name).toEqual(['kickOff', 1, CENTRE]);
      expect(half.clock).toBe(2700);
      let goals = 0;
      beats.forEach((b, i) => {
        const next = beats[i + 1];
        if (b.outcome !== 'goal' || next === undefined) return;
        goals++;
        expect([next.kind, next.from], `${name} beat ${i}`).toEqual(['kickOff', CENTRE]);
        if (i + 1 !== firstHalfStart(script)) expect(next.team).toBe(1 - b.team);
      });
      expect(goals, name).toBeGreaterThan(0);
    }
  });

  it('the same match and seed write the same script', () => {
    const settled = smallSettled();
    expect(writeFitted(settled, 'fit')).toEqual(writeFitted(settled, 'fit'));
    const s01 = loadSettled('s01');
    expect(JSON.stringify(writeFitted(s01, 'a'))).toBe(JSON.stringify(writeFitted(s01, 'a')));
    expect(JSON.stringify(writeFitted(s01, 'a'))).not.toBe(JSON.stringify(writeFitted(s01, 'b')));
  });
});

const TEN = ['s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10'];
const recorded = (b: Script['beats'][number]) =>
  b.event !== undefined || b.shot !== undefined || b.foul !== undefined;
const rowsByMinute = (script: Script) => {
  const per = Array<number>(90).fill(0);
  for (const b of script.beats) if (recorded(b)) per[Math.floor(b.clock! / 60)]!++;
  return per;
};

describe('match-proto fitted order of play (T822)', () => {
  const ten = TEN.map((id) => {
    const settled = loadSettled(id);
    return [id, settled, writeFitted(settled, 'fit')] as const;
  });
  const s01 = ten[0]![2];
  const s06 = ten[5]![2];

  it('every settled match is written exactly, a restart owed at the whistle included', () => {
    // Rows the record gives no minute float to wherever the order of play reaches them; a restart
    // owed as a half ends is delivered and its pass received before the kick-off (s07 lost one).
    for (const [id, settled, script] of ten) {
      expect(validateFitted(settled, script), id).toEqual([]);
      expect(compareRecord(settled, countScript(script, settled)), id).toEqual([]);
    }
  }, 30_000);

  it('nobody passes to himself, a restart included', () => {
    // s09's connective goal kick went from its keeper to its keeper, the next touch being his: the
    // ball jumped 16 m in a frame on the page (ball.maxSpeed).
    for (const [id, , script] of ten) {
      const self = script.beats.filter((b) => b.receiver !== undefined && b.receiver === b.actor);
      expect(
        self.map((b) => `${b.index}:${b.kind}`),
        id,
      ).toEqual([]);
    }
  });

  it('a completed pass is mostly received where the next touch starts', () => {
    // The next touch is taken from the whole match, not a dealt minute: under the greedy writer of
    // T820 two of every three completed passes needed a link carry after them.
    let passes = 0;
    let linked = 0;
    s01.beats.forEach((b, i) => {
      if (b.kind !== 'pass' || b.outcome !== 'complete' || b.event === undefined) return;
      passes++;
      if (s01.beats[i + 1]?.move === 'link') linked++;
    });
    expect(linked / passes).toBeLessThan(0.4);
  });

  it('every minute holds its share of the recorded rows', () => {
    for (const script of [s01, s06]) {
      const per = rowsByMinute(script);
      const mean = per.reduce((s, n) => s + n, 0) / 90;
      expect(Math.min(...per)).toBeGreaterThan(0);
      expect(Math.max(...per)).toBeLessThan(mean * 3);
    }
  });

  it('both sides spend their possession-ending rows at one pace, so neither runs out', () => {
    // s06: the home side has 79 rows that end a possession, the away side 45; the difference is
    // lost by heavy touches spread over the match, not piled into its last minutes.
    const lastTen = [0, 1].map(
      (t) => s06.beats.filter((b) => b.clock! >= 80 * 60 && b.team === t && recorded(b)).length,
    );
    expect(Math.min(...lastTen)).toBeGreaterThan(20);
    const heavy = s06.beats.filter((b) => b.move === 'miscontrol').map((b) => b.clock! / 60);
    const late = heavy.filter((m) => m >= 80).length;
    expect(late / heavy.length).toBeLessThan(0.3);
  });
});
