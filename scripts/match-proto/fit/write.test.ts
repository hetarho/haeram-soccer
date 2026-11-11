import { describe, expect, it } from 'vitest';
import { CENTRE } from '../core/pitch.ts';
import { EV, EVENT_RESULTS, type Settled } from '../core/settled.ts';
import { PASS_KINDS, type Script } from '../core/types.ts';
import { cellAt } from './cells.ts';
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
