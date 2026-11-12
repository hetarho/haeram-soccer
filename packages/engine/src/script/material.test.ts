import { describe, expect, it } from 'vitest';
import {
  fixtureSeed,
  loadDetail,
  sampleDetail,
  smallDetail,
} from '../../../../tests/fixtures/match-script';
import { cellOf } from '../match/pitch';
import { MaterialTally, M } from '../match/record';
import { MATERIAL_LAYOUT, REPORT_SLOTS } from '../material';
import { TD } from '../../../contracts/src/detail';
import { cellAt, toAttack } from './cells';
import { SH } from './codes';
import type { MatchDetail } from './detail';
import { scriptMaterial } from './material';
import { materialBeat, materialScript } from './material.testkit';
import { recordOf } from './recount';
import { isPassLike, type Beat, type Script } from './types';
import { writeScript } from './write';

const write = (d: MatchDetail, seed: string): Script => {
  const result = writeScript(d, seed);
  if ('problems' in result) throw new Error(result.problems.join(';'));
  return result.script;
};
const cases = () =>
  [
    { d: sampleDetail(), seed: 'material-small' },
    ...Array.from({ length: 10 }, (_, i) => {
      const id = `s${String(i + 1).padStart(2, '0')}`;
      return { d: loadDetail(id), seed: fixtureSeed(id) };
    }),
  ].map(({ d, seed }) => ({ d, s: write(d, seed) }));
let prepared: ReturnType<typeof cases> | undefined;
const corpus = () => (prepared ??= cases());
const action = (b: Beat) => b.kind !== 'stoppage' && b.kind !== 'shootoutKick';
const received = (b: Beat) =>
  isPassLike(b.kind) && b.outcome === 'complete' && b.receiver !== undefined;
const pairsOf = (rows: number[], lines: number) => {
  const pairs = new Map<string, number>();
  for (let i = lines * MATERIAL_LAYOUT.node; i < rows.length; i += MATERIAL_LAYOUT.pair)
    pairs.set(`${rows[i]}:${rows[i + 1]}`, rows[i + 2]!);
  return pairs;
};

describe('post-match material from a script', () => {
  it('the pairs are the completed passes the script plays, and sum to the record', () => {
    let restarts = 0,
      connective = 0;
    for (const { d, s } of corpus()) {
      const record = recordOf(d);
      for (const own of [0, 1] as const) {
        const expected = new Map<string, number>();
        for (const b of s.beats) {
          if (b.side !== own || !received(b)) continue;
          if (b.event === undefined) {
            connective++;
            continue;
          }
          if (b.kind !== 'pass') restarts++;
          const key = `${b.actor}:${b.receiver}`;
          expected.set(key, (expected.get(key) ?? 0) + 1);
        }
        const material = scriptMaterial(d, s, own);
        const pairs = pairsOf(material.network, d.sides[own].lines.length);
        expect(pairs, `${d.id}:${own}`).toEqual(expected);
        expect([...pairs.values()].reduce((sum, n) => sum + n, 0)).toBe(
          record.metrics[own][M.completed],
        );
      }
    }
    expect(restarts).toBeGreaterThan(0);
    expect(connective).toBeGreaterThan(0);
  });

  it('a singleton pass stays while linking carries, heavy touches and connective deliveries credit no pair', () => {
    const d = smallDetail([[0, 0, 0, 0, 22, 27, 1, 0, 0, -1]]);
    const s = materialScript([
      materialBeat({ kind: 'kickOff', event: 0 }),
      materialBeat({ kind: 'carry', move: 'link' }),
      materialBeat({ kind: 'carry', move: 'miscontrol', outcome: 'loose', opponent: 2 }),
      materialBeat({ kind: 'throwIn', move: 'restart', side: 1 }),
      materialBeat({ kind: 'corner', move: 'restart' }),
    ]);
    expect([...pairsOf(scriptMaterial(d, s, 0).network, 11)]).toEqual([['1:2', 1]]);
    expect([...pairsOf(scriptMaterial(d, s, 1).network, 11)]).toEqual([]);
    expect(scriptMaterial(d, s, 0).network[2 * 3 + 2]).toBe(2); // both completed deliveries received
  });

  it("a player's average position is the mean of his scripted touches, and each touch reaches the heat map", () => {
    for (const { d, s } of corpus()) {
      const touches = d.sides.map((side) =>
        side.lines.map(() => [] as (readonly [number, number])[]),
      );
      for (const b of s.beats) {
        if (!action(b)) continue;
        touches[b.side]![b.actor]!.push(toAttack(b.side, b.from));
        if (received(b)) touches[b.side]![b.receiver!]!.push(toAttack(b.side, b.to));
      }
      for (const own of [0, 1] as const) {
        const m = scriptMaterial(d, s, own),
          totals = [Array<number>(40).fill(0), Array<number>(40).fill(0)];
        for (const side of [0, 1] as const)
          touches[side]!.forEach((points, line) => {
            const cells = Array<number>(40).fill(0);
            for (const p of points) {
              cells[cellOf(p)]!++;
              totals[side]![cellOf(p)]!++;
            }
            if (side !== own) return;
            expect(m.heat.slice(line * 40, (line + 1) * 40), `${d.id}:${own}:${line}`).toEqual(
              cells,
            );
            const mean = (axis: 0 | 1) =>
              points.length
                ? Math.round((points.reduce((sum, p) => sum + p[axis], 0) * 10) / points.length)
                : 0;
            expect(m.network.slice(line * 3, (line + 1) * 3)).toEqual([
              mean(0),
              mean(1),
              points.length,
            ]);
          });
        expect(m.heat.slice(d.sides[own].lines.length * 40)).toEqual([
          ...totals[own]!,
          ...totals[1 - own]!,
        ]);
      }
    }
  });

  it('counts a headed shot once, excludes incident stops and shoot-out kicks, and keeps substitute line order', () => {
    const d = smallDetail([], [[1, 30, 32, 0, 1, 25, 0, 0, 11, -1, -1, 0]]);
    d.sides[1].lines.push({ ...d.sides[1].lines[10]!, id: 'substitute' });
    const s = materialScript([
      materialBeat({
        side: 1,
        kind: 'shot',
        actor: 11,
        shot: 0,
        header: true,
        from: [10, 30],
        outcome: 'goal',
      }),
      materialBeat({ side: 1, kind: 'stoppage', actor: 11 }),
      materialBeat({ side: 1, kind: 'shootoutKick', actor: 11, period: 5 }),
    ]);
    const m = scriptMaterial(d, s, 1);
    expect(m.network.slice(11 * 3, 12 * 3)).toEqual([950, 380, 1]);
    expect(m.heat.slice(11 * 40, 12 * 40).reduce((a, b) => a + b, 0)).toBe(1);
    expect(m.shots).toEqual([1, 11, 950, 380, 25, 0, 1]);
  });

  it('the shot map has every recorded shot at its scripted point inside its recorded cell', () => {
    const outcomes = new Set<number>(),
      headers = new Set<number>();
    for (const { d, s } of corpus()) {
      for (const own of [0, 1] as const) {
        const rows = scriptMaterial(d, s, own).shots;
        expect(rows).toHaveLength(d.shots.length * 7);
        s.beats
          .filter((b) => b.shot !== undefined)
          .forEach((b, i) => {
            const shot = d.shots[b.shot!]!,
              p = toAttack(b.side, b.from),
              row = rows.slice(i * 7, (i + 1) * 7);
            expect(row).toEqual([
              b.side,
              b.actor,
              Math.round(p[0] * 10),
              Math.round(p[1] * 10),
              shot[SH.xg],
              shot[SH.outcome],
              shot[SH.header],
            ]);
            expect(cellAt(b.side, b.from)).toBe(shot[SH.cell]);
            expect(cellOf([row[2]! / 10, row[3]! / 10])).toBe(shot[SH.cell]);
            outcomes.add(row[5]!);
            headers.add(row[6]!);
          });
      }
    }
    expect([...outcomes].sort()).toEqual([0, 1, 2, 3]);
    expect([...headers].sort()).toEqual([0, 1]);
  });

  it('the same detail and script give the same material without mutating either input', () => {
    const { d, s } = corpus()[0]!,
      original = structuredClone({ d, s });
    expect(scriptMaterial(d, s, 0)).toEqual(scriptMaterial(d, s, 0));
    expect(scriptMaterial(d, s, 1)).toEqual(scriptMaterial(d, structuredClone(s), 1));
    expect({ d, s }).toEqual(original);
  });

  it('the report preserves the record counters for passes and decisive duels', () => {
    for (const { d, s } of corpus()) {
      const r = recordOf(d),
        report = scriptMaterial(d, s, 0).report;
      for (const side of [0, 1] as const) {
        const at = side * 30,
          m = r.metrics[side],
          td = r.detail![side];
        expect(report[at + REPORT_SLOTS.crosses], d.id).toBe(td[TD.crosses]);
        expect(report[at + REPORT_SLOTS.cutBacks], d.id).toBe(td[TD.cutBacks]);
        expect(report[at + REPORT_SLOTS.throughBalls], d.id).toBe(td[TD.throughBalls]);
        expect(report[at + REPORT_SLOTS.takeOnsWon], d.id).toBe(m[M.dribbles]);
        expect(report[at + REPORT_SLOTS.takeOns], d.id).toBe(td[TD.takeOns]);
        expect(report[at + REPORT_SLOTS.tacklesWon], d.id).toBe(m[M.tackles]);
        expect(report[at + REPORT_SLOTS.tackles], d.id).toBe(
          m[M.tackles]! + r.metrics[1 - side]![M.dribbles]!,
        );
      }
    }
  });

  it('the tally keeps its grid defaults for pair filtering, header touches and counter possessions', () => {
    const tally = new MaterialTally(0, 11);
    tally.touch(0, 1, [60, 34], 'counter');
    tally.touch(0, 1, [61, 34], 'counter');
    tally.received(0, 1, 2, [75, 34]);
    tally.received(0, 2, 3, [76, 34]);
    tally.received(0, 2, 3, [76, 34]);
    tally.shot(0, 3, 'goal', { x: 95, y: 34, xg: 0.25, header: true, setPiece: false });
    const lines = Array.from({ length: 11 }, (_, line) => line),
      m = tally.finish([lines, lines]);
    expect([...pairsOf(m.network, 11)]).toEqual([['2:3', 2]]);
    expect(m.network[3 * 3 + 2]).toBe(3); // two receptions and the headed finish
    expect(m.report[REPORT_SLOTS.counterAttacks]).toBe(1);
    expect(m.report[REPORT_SLOTS.counterShots]).toBe(1);
  });

  it("the rows fit the save schema's unchanged integer and length caps", () => {
    // schema.ts materialRow: integers 0..100000, shots 7*80, heat 40*34,
    // network 3*30+3*300, report 60. No world or checkpoint is needed to test the rows.
    for (const { d, s } of corpus())
      for (const own of [0, 1] as const) {
        const m = scriptMaterial(d, s, own);
        for (const [key, cap] of [
          ['shots', 560],
          ['heat', 1360],
          ['network', 990],
          ['report', 60],
        ] as const) {
          expect(m[key].length).toBeLessThanOrEqual(cap);
          expect(
            m[key].every((n) => Number.isSafeInteger(n) && n >= 0 && n <= 100000),
            key,
          ).toBe(true);
        }
        expect(m.report).toHaveLength(60);
      }
  });

  it('keeps every directed pair of sixteen participants, including their single passes', () => {
    const d = smallDetail();
    for (let i = 11; i < 16; i++)
      d.sides[0].lines.push({ ...d.sides[0].lines[10]!, id: `sub-${i}` });
    const beats: Beat[] = [];
    for (let actor = 0; actor < 16; actor++)
      for (let receiver = 0; receiver < 16; receiver++) {
        if (actor === receiver) continue;
        const event = d.events.length;
        d.events.push([0, event, 0, 0, 22, 27, actor, 0, 0, -1, 0]);
        beats.push(materialBeat({ actor, receiver, event }));
      }
    const m = scriptMaterial(d, materialScript(beats), 0);
    expect(pairsOf(m.network, 16).size).toBe(240);
    expect([...pairsOf(m.network, 16).values()].reduce((a, b) => a + b, 0)).toBe(240);
    expect(m.network.length).toBeLessThanOrEqual(990);
  });

  it('empty material retains zero-valued nodes and the existing row dimensions', () => {
    const d = smallDetail(),
      m = scriptMaterial(d, materialScript([]), 0);
    expect(m).toEqual({
      shots: [],
      heat: Array(13 * 40).fill(0),
      network: Array(11 * 3).fill(0),
      report: Array(60).fill(0),
    });
  });
});
