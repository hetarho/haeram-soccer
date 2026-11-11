import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLAYER_ROW, readSettled, type Settled } from '../core/settled.ts';
import type { Script } from '../core/types.ts';
import { compareRecord, countScript } from './count.ts';
import { validateFitted } from './validate.ts';
import { writeFitted } from './write.ts';

const DIR = new URL('../fixtures/settled/', import.meta.url);
const files = readdirSync(DIR)
  .filter((name) => name.endsWith('.json'))
  .sort();
const load = (name: string): Settled =>
  readSettled(JSON.parse(readFileSync(new URL(name, DIR), 'utf8')));
const s01 = load('s01.json');
const fitted = writeFitted(s01, 'fit');
const interceptions = (player: number) =>
  s01.record.players[player]![PLAYER_ROW.indexOf('interceptions')]!;
const without = (script: Script, i: number): Script => ({
  ...script,
  beats: script.beats.filter((_, k) => k !== i),
});

describe('match-proto fitted count (T820)', () => {
  it('countScript gives the record of every settled match', () => {
    expect(files).toHaveLength(10);
    for (const name of files) {
      const settled = load(name);
      const script = writeFitted(settled, 'fit');
      expect(compareRecord(settled, countScript(script, settled)), name).toEqual([]);
      expect(validateFitted(settled, script), name).toEqual([]);
    }
  });

  it('a script missing one pass is caught', () => {
    const i = fitted.beats.findIndex(
      (b) => b.event !== undefined && b.kind === 'pass' && b.outcome === 'intercepted',
    );
    const b = fitted.beats[i]!;
    const want = s01.record.players[b.actor]![PLAYER_ROW.indexOf('passes')]!;
    const diff = compareRecord(s01, countScript(without(fitted, i), s01));
    // The passer's row names him once; the side's total and the interceptor's row follow it.
    expect(diff.filter((d) => d.startsWith(`player:${b.actor}:`))).toEqual([
      `player:${b.actor}:passes=${want - 1}/${want}`,
    ]);
    const won = interceptions(b.opponent!);
    expect(diff).toContain(`player:${b.opponent}:interceptions=${won - 1}/${won}`);
  });

  it('a script with one pass too many is caught', () => {
    const i = fitted.beats.findIndex(
      (b) => b.event !== undefined && b.kind === 'pass' && b.outcome === 'complete',
    );
    const extra = { ...fitted, beats: [...fitted.beats, fitted.beats[i]!] };
    const b = fitted.beats[i]!;
    const row = s01.record.players[b.actor]!;
    const [passes, completed] = [
      row[PLAYER_ROW.indexOf('passes')]!,
      row[PLAYER_ROW.indexOf('completed')]!,
    ];
    expect(
      compareRecord(s01, countScript(extra, s01)).filter((d) => d.startsWith('player:')),
    ).toEqual([
      `player:${b.actor}:passes=${passes + 1}/${passes}`,
      `player:${b.actor}:completed=${completed + 1}/${completed}`,
    ]);
  });

  it('connective beats count nothing', () => {
    const connective = fitted.beats.flatMap((b, i) =>
      b.event === undefined && b.shot === undefined && b.foul === undefined && b.kind === 'carry'
        ? [i]
        : [],
    );
    expect(connective.length).toBeGreaterThan(0);
    const keep = new Set(connective);
    const stripped = { ...fitted, beats: fitted.beats.filter((_, i) => !keep.has(i)) };
    expect(compareRecord(s01, countScript(stripped, s01))).toEqual([]);
  });
});
