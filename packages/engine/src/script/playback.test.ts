import { describe, expect, it } from 'vitest';
import type { Attributes } from '../../../contracts/src/player';
import type { MatchRecord, Player } from '../../../contracts/src/types';
import { smallDetail } from '../../../../tests/fixtures/match-script';
import { playerTendencies } from '../grid/tendencies';
import { ownMatchPlayback, stagingSides } from './playback';
import { recordOf, type MatchDetail } from './detail';
import { writeScript } from './write';
import { countScript, compareRecord } from './count';
import { scriptMaterial } from './material';

const managers = [
  { flexibility: 80, interim: false, style: 'positional' as const },
  { flexibility: 35, interim: false, style: 'counter' as const },
];
const attrs: Attributes = {
  finishing: 55,
  dribbling: 60,
  crossing: 50,
  passing: 65,
  vision: 70,
  tackling: 45,
  positioning: 60,
  heading: 50,
  pace: 77,
  stamina: 65,
  strength: 55,
  reflexes: 20,
  handling: 20,
  distribution: 25,
  decisions: 75,
  composure: 65,
};
function fixture(detail: MatchDetail = smallDetail([[0, 0, 0, 0, 22, 27, 1, 0, 0, -1]])) {
  const squads = detail.sides.map((s) =>
    s.lines.map((p) => ({
      id: p.id,
      name: p.id,
      position: p.position,
      attrs,
    })),
  ) as [Player[], Player[]];
  const record: MatchRecord = {
    id: detail.id,
    year: 2024,
    round: 1,
    kind: 'league',
    home: 'home',
    away: 'away',
    country: 'ENG',
    groupKey: 'ENG.0.0',
    ...recordOf(detail),
    tactics: [detail.sides[0].tactic, detail.sides[1].tactic],
    lineCounts: [detail.sides[0].lines.length, detail.sides[1].lines.length],
    highlights: [],
    added: detail.added,
    model: 'scripted-aggregate-11',
  };
  const options = { managers, seed: 'playback-unit', own: 0 as const, observe: true };
  return { detail, squads, record, options };
}

describe('own script playback boundary with synthetic rows', () => {
  it('watching and skipping produce identical material without staging or mutating the record', () => {
    const f = fixture();
    const watched = ownMatchPlayback(f.record, f.squads, () => f.detail, f.options);
    const skipped = ownMatchPlayback(f.record, f.squads, () => f.detail, {
      ...f.options,
      observe: false,
    });
    expect(watched.problems).toBeUndefined();
    expect(watched.frames).toEqual([]);
    expect(watched.script).toBeDefined();
    expect(watched.staging).toHaveLength(2);
    expect(compareRecord(f.detail, countScript(watched.script!, f.detail))).toEqual([]);
    expect(watched.record.material).toEqual(scriptMaterial(f.detail, watched.script!, 0));
    expect(skipped.record).toEqual(watched.record);
    expect(skipped.frames).toEqual([]);
    expect(skipped).not.toHaveProperty('script');
    expect(skipped).not.toHaveProperty('staging');
    expect(f.record).not.toHaveProperty('material');
    expect(watched.squads).toBe(f.squads);
  });

  it('an away own side keeps its own heat maps and network', () => {
    const f = fixture();
    const playback = ownMatchPlayback(f.record, f.squads, () => f.detail, { ...f.options, own: 1 });
    expect(playback.problems).toBeUndefined();
    expect(playback.record.material).toEqual(scriptMaterial(f.detail, playback.script!, 1));
    expect(playback.record.material).not.toEqual(scriptMaterial(f.detail, playback.script!, 0));
  });

  it('uses record-line order and the actual entry slot and role for a substitute', () => {
    const detail = smallDetail();
    const outgoing = detail.sides[0].lines[6]!;
    detail.sides[0].lines.push({ ...outgoing, id: 'substitute' });
    detail.stints.find((s) => s[0] === 0 && s[1] === 6)![4] = 60;
    detail.stints.push([0, 11, 6, 60, 90]);
    const f = fixture(detail);
    const sides = stagingSides(detail, f.squads, managers);
    expect(sides[0].players.map((p) => p.line)).toEqual(Array.from({ length: 12 }, (_, i) => i));
    const sub = sides[0].players[11]!;
    expect(sub.slot).toBe(6);
    expect(sub.role).toBe(outgoing.role);
    expect(sub.pace).toBe(attrs.pace);
    const expected = playerTendencies(f.squads[0][11]!, managers[0]!, outgoing.role);
    for (const key of ['anticipation', 'discipline', 'pressing', 'freedom'] as const)
      expect(sub[key]).toBe(expected[key] * 100);
    expect(sides[1].players[6]!.freedom).not.toBe(sides[0].players[6]!.freedom);
  });

  it.each([true, false])('never hands over a failed count (observe=%s)', (observe) => {
    const f = fixture();
    const writer: typeof writeScript = (detail, seed) => {
      const written = writeScript(detail, seed);
      if ('problems' in written) return written;
      for (const b of written.script.beats) if (b.event !== undefined) delete b.event;
      return written;
    };
    const playback = ownMatchPlayback(f.record, f.squads, () => f.detail, {
      ...f.options,
      observe,
      writer,
    });
    expect(playback.record).toBe(f.record);
    expect(playback.problems?.some((p) => p.startsWith('team:'))).toBe(true);
    expect(playback.frames).toEqual([]);
    for (const field of ['script', 'staging']) expect(playback).not.toHaveProperty(field);
    expect(playback.record).not.toHaveProperty('material');
  });

  it('retains explicit writer problems and catches structural failures without aborting settlement', () => {
    const f = fixture();
    const failed = ownMatchPlayback(f.record, f.squads, () => f.detail, {
      ...f.options,
      writer: () => ({ problems: ['forced:count'] }),
    });
    expect(failed.problems).toEqual(['forced:count']);
    const thrown = ownMatchPlayback(
      f.record,
      f.squads,
      () => {
        throw new Error('forced:detail');
      },
      f.options,
    );
    expect(thrown.problems).toEqual(['forced:detail']);
    expect(thrown.record).toBe(f.record);
    expect(thrown.record).not.toHaveProperty('material');
  });

  it('compares the count to the original settled record, as well as to the transient detail', () => {
    const f = fixture();
    f.record.metrics[0][0]!++;
    const playback = ownMatchPlayback(f.record, f.squads, () => f.detail, f.options);
    expect(playback.problems?.some((p) => p.startsWith('team:'))).toBe(true);
    expect(playback.record).toBe(f.record);
    expect(playback.script).toBeUndefined();
    expect(playback.record.material).toBeUndefined();
  });
});
