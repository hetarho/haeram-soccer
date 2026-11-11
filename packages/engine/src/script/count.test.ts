import { describe, expect, it } from 'vitest';
import type { MatchScript } from '../../../contracts/src/match-script';
import { compareRecord, countScript } from './count';
import { FIXTURE_IDS, loadDetail } from './script.testkit';
import { writeScript } from './write';

// The prototype's fit/count.test.ts cases (T820) on the engine's record layout: every M, TD and PD
// value of `recordOf` (T825), not the prototype's short rows.
const s01 = loadDetail('s01');
const written = writeScript(s01, 'fit');
if ('problems' in written) throw new Error(written.problems.join(', '));
const fitted = written.script;
const without = (script: MatchScript, i: number): MatchScript => ({
  ...script,
  beats: script.beats.filter((_, k) => k !== i),
});

describe('script count (T820, T826)', () => {
  it('countScript gives the record of every settled match', () => {
    expect(FIXTURE_IDS).toHaveLength(10);
    // The ten together are write.test.ts's `every fixture is written exactly`; here s01 alone.
    expect(compareRecord(s01, countScript(fitted, s01))).toEqual([]);
  });

  it('a script missing one pass is caught', () => {
    const i = fitted.beats.findIndex(
      (b) => b.event !== undefined && b.kind === 'pass' && b.outcome === 'intercepted',
    );
    const b = fitted.beats[i]!;
    const diff = compareRecord(s01, countScript(without(fitted, i), s01));
    // The passer's row names him one pass short; the interceptor's names one interception fewer.
    expect(diff.some((d) => d.startsWith(`player:${b.side}:${b.actor}:M.passes=`))).toBe(true);
    expect(
      diff.some((d) => d.startsWith(`player:${1 - b.side}:${b.opponent}:M.interceptions=`)),
    ).toBe(true);
    expect(diff.some((d) => d.startsWith(`team:${b.side}:M.passes=`))).toBe(true);
  });

  it('a script with one pass too many is caught', () => {
    const i = fitted.beats.findIndex(
      (b) => b.event !== undefined && b.kind === 'pass' && b.outcome === 'complete',
    );
    const extra = { ...fitted, beats: [...fitted.beats, fitted.beats[i]!] };
    const b = fitted.beats[i]!;
    const diff = compareRecord(s01, countScript(extra, s01));
    expect(diff.some((d) => d.startsWith(`player:${b.side}:${b.actor}:M.passes=`))).toBe(true);
    expect(diff.some((d) => d.startsWith(`player:${b.side}:${b.actor}:M.completed=`))).toBe(true);
  });

  it('a pass credited to another man is caught', () => {
    const i = fitted.beats.findIndex(
      (b) => b.event !== undefined && b.kind === 'pass' && b.outcome === 'complete',
    );
    const b = fitted.beats[i]!;
    const swapped = {
      ...fitted,
      beats: fitted.beats.map((x, k) => (k === i ? { ...x, actor: b.actor === 5 ? 6 : 5 } : x)),
    };
    expect(compareRecord(s01, countScript(swapped, s01))).not.toEqual([]);
  });

  it('connective beats count nothing', () => {
    // Link carries; a heavy touch counts nothing either, but it ends a feed, so a shot after it
    // has no key pass (MATCH-11), and taking it out would hand the shooter the pass before it.
    const connective = fitted.beats.flatMap((b, i) => (b.move === 'link' ? [i] : []));
    expect(connective.length).toBeGreaterThan(0);
    const keep = new Set(connective);
    const stripped = { ...fitted, beats: fitted.beats.filter((_, i) => !keep.has(i)) };
    expect(compareRecord(s01, countScript(stripped, s01))).toEqual([]);
  });
});

describe('script count of the ten (T826, T827)', () => {
  it('cards without a foul are counted from the beats that show them', () => {
    // s03 holds two yellow cards no foul was booked for: each is shown on a stoppage of its minute.
    const d = loadDetail('s03', true);
    const r = writeScript(d, 'fit');
    if ('problems' in r) throw new Error(r.problems.join(', '));
    expect(compareRecord(d, countScript(r.script, d))).toEqual([]);
    const shown = r.script.beats.filter((b) => b.kind === 'stoppage');
    expect(shown.flatMap((b) => b.incidents!.map((x) => x.kind))).toEqual(['yellow', 'yellow']);
    // Without them the count misses both.
    const bare = { ...r.script, beats: r.script.beats.filter((b) => b.kind !== 'stoppage') };
    expect(compareRecord(d, countScript(bare, d)).some((p) => p.startsWith('incident:'))).toBe(
      true,
    );
  });
});
