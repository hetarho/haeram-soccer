import { describe, expect, it } from 'vitest';
import type { MatchScript, ScriptBeat } from '../../../contracts/src/match-script';
import { CENTRE, cellAt } from './cells';
import { compareRecord, countScript, scriptCost } from './count';
import { EV, EVENT_RESULTS, type MatchDetail } from './detail';
import { FIXTURE_IDS, loadDetail, smallDetail } from './script.testkit';
import { validateScript } from './validate';
import { isPassLike, writeScript } from './write';

/** The script of `detail`, failing the test on problems. */
export function scriptOf(detail: MatchDetail, seed = 'fit'): MatchScript {
  const r = writeScript(detail, seed);
  if ('problems' in r) throw new Error(r.problems.join(', '));
  return r.script;
}

const cases: [string, MatchDetail][] = [
  ['small', smallDetail()],
  ['s01', loadDetail('s01')],
];
const written = cases.map(([name, detail]) => [name, detail, scriptOf(detail)] as const);
const result = (d: MatchDetail, id: number) => EVENT_RESULTS[d.events[id]![EV.result]!];
const secondHalf = (script: MatchScript) => script.beats.findIndex((b) => b.clock >= 2700);

// The prototype's fit/write.test.ts cases (T820), on the engine's details.
describe('script writer (T820)', () => {
  it('every event, shot and foul is performed exactly once', () => {
    for (const [name, detail, script] of written) {
      expect(validateScript(detail, script), name).toEqual([]);
      expect(script.bound).toBe(true);
      expect(script.version).toBe(1);
    }
  });

  it('the ball never jumps', () => {
    for (const [name, detail, script] of written) {
      const jumps = validateScript(detail, script).filter((p) => /:(jump|spot|restart)$/.test(p));
      expect(jumps, name).toEqual([]);
      // A completed beat leaves the ball where it ends.
      script.beats.forEach((b, i) => {
        const next = script.beats[i + 1];
        if (next === undefined || b.outcome !== 'complete' || i + 1 === secondHalf(script)) return;
        expect(next.from, `${name} beat ${i + 1}`).toEqual(b.to);
      });
    }
  });

  it('a pass is received by the next man to play', () => {
    for (const [name, , script] of written) {
      script.beats.forEach((b, i) => {
        if (!isPassLike(b.kind) || b.outcome !== 'complete') return;
        const next = script.beats.slice(i + 1).find((x) => x.side === b.side);
        if (next === undefined || i + 1 === secondHalf(script)) return;
        expect(next.actor, `${name} beat ${i}`).toBe(b.receiver);
      });
    }
  });

  it('a failed pass hands the ball over as its result says', () => {
    const seen = new Set<string>();
    for (const [name, detail, script] of written) {
      script.beats.forEach((b, i) => {
        const next = script.beats[i + 1];
        if (b.event === undefined || next === undefined || i + 1 === secondHalf(script)) return;
        const res = result(detail, b.event);
        const at = `${name} beat ${i}`;
        if (res === 'intercepted') {
          expect(next.actor, at).toBe(b.opponent);
          expect(next.side, at).toBe(1 - b.side);
          expect(cellAt(b.side, next.from), at).toBe(detail.events[b.event]![EV.to]);
        } else if (res === 'outTouch') {
          expect([next.kind, next.side], at).toEqual(['throwIn', 1 - b.side]);
        } else if (res === 'outByline') {
          expect([next.kind, next.side], at).toEqual(['goalKick', 1 - b.side]);
        } else if (res === 'cornerWon') {
          expect([next.kind, next.side], at).toEqual(['corner', b.side]);
        } else if (res === 'offside') {
          expect([next.kind, next.side], at).toEqual(['freeKick', 1 - b.side]);
          expect(b.through).toBe(true);
          expect(b.receiver).toBe(detail.events[b.event]![EV.other]);
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
      expect([beats[0]!.kind, beats[0]!.side, beats[0]!.clock], name).toEqual(['kickOff', 0, 0]);
      expect(beats[0]!.from).toEqual(CENTRE);
      const half = beats[secondHalf(script)]!;
      expect([half.kind, half.side, half.from], name).toEqual(['kickOff', 1, CENTRE]);
      expect(half.clock).toBe(2700);
      let goals = 0;
      beats.forEach((b, i) => {
        const next = beats[i + 1];
        if (b.outcome !== 'goal' || next === undefined) return;
        goals++;
        expect([next.kind, next.from], `${name} beat ${i}`).toEqual(['kickOff', CENTRE]);
        if (i + 1 !== secondHalf(script)) expect(next.side).toBe(1 - b.side);
      });
      expect(goals, name).toBeGreaterThan(0);
    }
  });

  it('the same match and seed write the same script', () => {
    const small = smallDetail();
    expect(scriptOf(small)).toEqual(scriptOf(small));
    const s01 = loadDetail('s01');
    expect(JSON.stringify(scriptOf(s01, 'a'))).toBe(JSON.stringify(scriptOf(s01, 'a')));
    expect(JSON.stringify(scriptOf(s01, 'a'))).not.toBe(JSON.stringify(scriptOf(s01, 'b')));
  });
});

const recorded = (b: ScriptBeat) =>
  b.event !== undefined || b.shot !== undefined || b.foul !== undefined;
const rowsByMinute = (script: MatchScript) => {
  const per = Array<number>(90).fill(0);
  for (const b of script.beats) if (recorded(b)) per[Math.floor(b.clock / 60)]!++;
  return per;
};

/**
 * What the prototype's writer adds on the ten matches at the task's base (5b658a30), summed:
 * `pnpm exec tsx scripts/match-proto/check/report.ts --match sNN`, `fit.linkMetres`,
 * `fit.miscontrols` and `fit.connectiveRestarts`.
 */
const PROTOTYPE = { linkMetres: 54_014, miscontrols: 172, connectiveRestarts: 114 };

describe('script writer on the ten matches (T822, T826)', () => {
  const ten = FIXTURE_IDS.map((id) => {
    const detail = loadDetail(id);
    return [id, detail, scriptOf(detail)] as const;
  });
  const s01 = ten[0]![2];
  const s06 = ten[5]![2];

  it('every fixture is written exactly', () => {
    // Rows the record gives no minute float to wherever the order of play reaches them; a restart
    // owed as a half ends is delivered and its pass received before the kick-off.
    for (const [id, detail, script] of ten) {
      expect(validateScript(detail, script), id).toEqual([]);
      expect(compareRecord(detail, countScript(script, detail)), id).toEqual([]);
    }
  });

  it('the same detail and seed give the same script', () => {
    for (const [id, detail, script] of ten)
      expect(JSON.stringify(scriptOf(detail)), id).toBe(JSON.stringify(script));
  });

  it("what the script adds stays at the prototype's level", () => {
    const sum = { linkMetres: 0, miscontrols: 0, connectiveRestarts: 0 };
    for (const [, detail, script] of ten) {
      const cost = scriptCost(script, detail);
      sum.linkMetres += cost.linkMetres;
      sum.miscontrols += cost.miscontrols;
      sum.connectiveRestarts += cost.connectiveRestarts;
    }
    expect(sum.linkMetres).toBeLessThanOrEqual(PROTOTYPE.linkMetres * 1.02);
    expect(sum.miscontrols).toBeLessThanOrEqual(PROTOTYPE.miscontrols * 1.02);
    expect(sum.connectiveRestarts).toBeLessThanOrEqual(PROTOTYPE.connectiveRestarts * 1.02);
  });

  it('nobody passes to himself, a restart included', () => {
    for (const [id, , script] of ten) {
      const self = script.beats.filter((b) => b.receiver !== undefined && b.receiver === b.actor);
      expect(
        self.map((b) => `${b.index}:${b.kind}`),
        id,
      ).toEqual([]);
    }
  });

  it('a completed pass is mostly received where the next touch starts', () => {
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
    const lastTen = [0, 1].map(
      (t) => s06.beats.filter((b) => b.clock >= 80 * 60 && b.side === t && recorded(b)).length,
    );
    expect(Math.min(...lastTen)).toBeGreaterThan(20);
    const heavy = s06.beats.filter((b) => b.move === 'miscontrol').map((b) => b.clock / 60);
    const late = heavy.filter((m) => m >= 80).length;
    expect(late / heavy.length).toBeLessThan(0.3);
  });
});
