import { describe, expect, it } from 'vitest';
import { PD, TD } from '../../../contracts/src/detail';
import { M } from '../match/record';
import { sampleDetail } from '../../../../tests/fixtures/match-script';
import { countScript, compareRecord } from './count';
import { writeScript } from './write';
import type { Script } from './types';
const detail = sampleDetail();
const result = writeScript(detail, 'count-unit');
if ('problems' in result) throw new Error(result.problems.join(';'));
const script = result.script;
const without = (i: number): Script => ({
  ...script,
  beats: script.beats.filter((_, k) => k !== i),
});

describe('fitted count (ported T820 cases)', () => {
  it('countScript gives the record of every settled match', () => {
    expect(compareRecord(detail, countScript(script, detail))).toEqual([]);
  });
  it('counts a performed corner prefix without weakening the complete-record guard', () => {
    const corner = script.beats.find((b) => b.event !== undefined && b.setPiece === 'corner')!;
    const prefix = { ...script, beats: [corner] };
    expect(() => countScript(prefix, detail)).toThrow();
    const running = countScript(prefix, detail, 'prefix');
    expect(running.metrics[corner.side][M.passes]).toBe(1);
    expect(running.detail![corner.side]![TD.corners]).toBe(corner.kind === 'corner' ? 1 : 0);
    expect(running.score).toEqual({ home: 0, away: 0 });
    expect(compareRecord(detail, countScript(script, detail))).toEqual([]);
  });
  it('counts a penalty kick in a selected prefix without a complete causal ledger', () => {
    const shot = script.beats.find((b) => b.shot !== undefined)!;
    const penalty = {
      ...shot,
      kind: 'penalty' as const,
      shotKind: 'penalty' as const,
      from: [94, 34] as const,
      xg: 76,
      source: -1,
      keyPass: -1,
    };
    const prefix = { ...script, beats: [penalty] };
    expect(() => countScript(prefix, detail)).toThrow();
    expect(countScript(prefix, detail, 'prefix').detail![penalty.side]![TD.penaltiesScored]).toBe(
      1,
    );
  });
  it('a script missing one pass is caught', () => {
    const i = script.beats.findIndex((b) => b.event !== undefined && b.outcome === 'intercepted');
    const b = script.beats[i]!,
      counted = countScript(without(i), detail);
    const original = countScript(script, detail),
      own = b.side * 11 + b.actor,
      foe = (1 - b.side) * 11 + b.opponent!;
    expect(counted.players[own]!.metrics[M.passes]).toBe(
      original.players[own]!.metrics[M.passes]! - 1,
    );
    expect(counted.players[foe]!.metrics[M.interceptions]).toBe(
      original.players[foe]!.metrics[M.interceptions]! - 1,
    );
    expect(compareRecord(detail, counted)).toContain(
      `player:${own}:M:${M.passes}=${counted.players[own]!.metrics[M.passes]}/${original.players[own]!.metrics[M.passes]}`,
    );
  });
  it('a script with one pass too many is caught', () => {
    const b = script.beats.find((b) => b.event === 0)!;
    const counted = countScript({ ...script, beats: [...script.beats, b] }, detail),
      original = countScript(script, detail);
    expect(counted.players[b.actor]!.metrics[M.completed]).toBe(
      original.players[b.actor]!.metrics[M.completed]! + 1,
    );
    expect(
      compareRecord(detail, counted).some((p) => p.startsWith(`player:${b.actor}:M:${M.passes}=`)),
    ).toBe(true);
  });
  it('connective beats count nothing', () => {
    const carries = script.beats.filter(
      (b) =>
        b.event === undefined && b.foul === undefined && b.shot === undefined && b.kind === 'carry',
    );
    expect(carries.length).toBeGreaterThan(0);
    expect(
      compareRecord(
        detail,
        countScript({ ...script, beats: script.beats.filter((b) => !carries.includes(b)) }, detail),
      ),
    ).toEqual([]);
  });
  it('reads counted facts from beats rather than echoing the original action rows', () => {
    const blank = { ...detail, events: [], shots: [], fouls: [] };
    expect(countScript(script, blank)).toEqual(countScript(script, detail));
  });
  it('counts the actual saving player rather than the recorded keeper qualifier', () => {
    const s = structuredClone(script),
      b = s.beats.find((b) => b.outcome === 'saved')!;
    b.opponent = 1;
    const counted = countScript(s, detail);
    expect(compareRecord(detail, counted).some((p) => p.includes(`:M:${M.saves}=`))).toBe(true);
  });
  it('a goal assist comes from the completed delivery even if its qualifier is altered', () => {
    const s = structuredClone(script),
      b = s.beats.find((b) => b.outcome === 'goal' && b.keyPass! >= 0)!;
    b.keyPass = -1;
    expect(countScript(s, detail).players).toEqual(countScript(script, detail).players);
  });
  it('compares advanced team and player values, not just the prototype short rows', () => {
    const counted = countScript(script, detail);
    counted.detail![0]![TD.xtAdded]!++;
    counted.players[0]!.detail![PD.xa]!++;
    expect(compareRecord(detail, counted)).toEqual([
      expect.stringMatching(`^team:0:TD:${TD.xtAdded}=`),
      expect.stringMatching(`^player:0:PD:${PD.xa}=`),
    ]);
  });
});
