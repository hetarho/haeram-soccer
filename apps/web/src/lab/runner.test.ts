import { describe, expect, it } from 'vitest';
import {
  probeReads,
  tunableDefault,
  tunableLeaves,
} from '../../../../packages/engine/src/grid/tunables';
import { generateLabSide } from '../../../../packages/engine/src/lab/sides';
import { labWorld, playLabSample, playSlice, playWatch } from './runner';
import { summarizeRun } from './summary';
import type { LabSample } from './protocol';

const sides = [
  generateLabSide({ side: 0, seed: 'runner', tactic: 'balanced', average: 72, spread: 4 }),
  generateLabSide({ side: 1, seed: 'runner', tactic: 'counter', average: 72, spread: 4 }),
] as const;

let whole: LabSample[] | undefined;
/** Matches 0–2 of run `r` as one slice, played once for the file. */
function oneSlice() {
  if (!whole) {
    const outcome = playSlice(sides, 'r', {}, 0, 3);
    if (!outcome.ok) throw new Error('rejected');
    whole = outcome.samples;
  }
  return whole;
}

describe('lab runner', () => {
  it('left home on even matches', { timeout: 120_000 }, () => {
    const [hostA, hostB] = labWorld().hosts;
    const samples = oneSlice();
    expect(samples.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(samples.map((s) => s.leftHome)).toEqual([true, false, true]);
    for (const s of samples) {
      const r = s.sample.record;
      expect(r.id).toBe(`lab:r:${s.index}`);
      expect([r.home, r.away]).toEqual(s.leftHome ? [hostA.id, hostB.id] : [hostB.id, hostA.id]);
      // The left side (balanced) plays on the home side when at home.
      expect(r.tactics).toEqual(s.leftHome ? ['balanced', 'counter'] : ['counter', 'balanced']);
      // A longer run's samples cross the channel without per-player rows.
      expect(r.players).toEqual([]);
    }
  });

  it('same run seed same summary with 1 and 3 slices', { timeout: 120_000 }, () => {
    const slices = [0, 1, 2].map((from) => {
      const outcome = playSlice(sides, 'r', {}, from, 1);
      if (!outcome.ok) throw new Error('rejected');
      return outcome.samples;
    });
    // Arriving out of order changes nothing either.
    const merged = [slices[2]!, slices[0]!, slices[1]!].flat();
    expect(summarizeRun(merged)).toEqual(summarizeRun(oneSlice()));
  });

  it('override changes the result, defaults restore it', { timeout: 120_000 }, () => {
    const lab = labWorld();
    const digest = (samples: readonly LabSample[]) =>
      JSON.stringify(samples.map((s) => [s.sample.record.score, s.sample.record.metrics]));
    const before = digest(oneSlice().slice(0, 1));
    const reads = probeReads(() => void playLabSample(lab, sides, 'r', 0, false));
    // Shots never taken: the most direct lever on what a match records.
    const lever = [...reads].find(
      (p) => p.startsWith('DECISION_CONFIG.') || p.startsWith('SHOT_CONFIG.'),
    )!;
    const changed = playSlice(sides, 'r', { [lever]: tunableDefault(lever)! * 3 + 1 }, 0, 1);
    expect(changed.ok && digest(changed.samples)).not.toBe(before);
    const restored = playSlice(sides, 'r', {}, 0, 1);
    expect(restored.ok && digest(restored.samples)).toBe(before);
  });

  it('watch applies overrides and restores', { timeout: 120_000 }, () => {
    const watched = (overrides: Record<string, number>) => {
      const outcome = playWatch(sides, 'r', overrides);
      if (!outcome.ok) throw new Error('rejected');
      return JSON.stringify([outcome.playback.record.score, outcome.playback.record.metrics]);
    };
    // The watched match is the run's match 0 under the same values.
    const [first] = oneSlice();
    expect(watched({})).toBe(
      JSON.stringify([first!.sample.record.score, first!.sample.record.metrics]),
    );
    const lever = [...probeReads(() => void playLabSample(labWorld(), sides, 'r', 0, false))].find(
      (p) => p.startsWith('DECISION_CONFIG.') || p.startsWith('SHOT_CONFIG.'),
    )!;
    const base = tunableDefault(lever)!;
    expect(watched({ [lever]: base * 3 + 1 })).not.toBe(watched({}));
    const atCode = () => tunableLeaves().every((l) => l.value === tunableDefault(l.path));
    expect(atCode()).toBe(true);
    // A rejected override plays nothing and leaves the code's values in place.
    expect(playWatch(sides, 'r', { [lever]: base + 1, 'NOPE_CONFIG.x': 1 })).toEqual({
      ok: false,
      rejected: [{ path: 'NOPE_CONFIG.x', reason: 'unknown' }],
    });
    expect(atCode()).toBe(true);
  });

  it('same seed and values give the same playback', { timeout: 120_000 }, () => {
    const a = playWatch(sides, 'same', {}),
      b = playWatch(sides, 'same', {});
    if (!a.ok || !b.ok) throw new Error('rejected');
    expect(b.playback).toEqual(a.playback);
    expect(a.playback.record.id).toBe('lab:same:0');
    expect(a.playback.record.home).toBe(labWorld().hosts[0].id);
    expect(a.playback.frames.length).toBeGreaterThan(90);
  });

  it('rejects unknown overrides before any match', () => {
    let played = 0;
    const outcome = playSlice(sides, 'r', { 'NOPE_CONFIG.x': 1 }, 0, 3, () => played++);
    expect(outcome).toEqual({
      ok: false,
      rejected: [{ path: 'NOPE_CONFIG.x', reason: 'unknown' }],
    });
    expect(played).toBe(0);
  });
});
