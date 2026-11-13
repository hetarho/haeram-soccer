import { describe, expect, it } from 'vitest';
import type { MatchFrame } from '../../packages/contracts/src/types';
import { presentationAdvance, deadBallBeats } from '../../apps/web/src/entities/match/logic';
import { assertComparable, readExport, type ComparisonExport } from './data';
import { ownSeconds, periodsOf, sharedPreparations, sharedTimeline } from './model';

const frames = (...periods: (1 | 2)[]) =>
  periods.map((period) => ({ period, stoppages: [] }) as unknown as MatchFrame);
const exported = () =>
  ({
    version: 1,
    meta: {
      head: 'a'.repeat(40),
      seed: 's',
      year: 2024,
      country: 'ENG',
      club: 'c',
      fixture: 'f',
      inputHash: 'b'.repeat(64),
      recordHash: 'c'.repeat(64),
    },
    playback: { frames: frames(1, 2), squads: [[], []], record: {} },
  }) as unknown as ComparisonExport;

describe('standalone comparison input contracts', () => {
  it('accepts equal frozen inputs and facts even when pictures/engine SHAs differ', () => {
    const a = exported(),
      b = exported();
    b.meta.head = 'd'.repeat(40);
    b.playback.frames = frames(1, 1, 2);
    expect(() => assertComparable(readExport(a), readExport(b))).not.toThrow();
  });
  it.each(['seed', 'year', 'country', 'club', 'fixture', 'inputHash', 'recordHash'] as const)(
    'rejects a different %s',
    (key) => {
      const a = exported(),
        b = exported();
      Object.assign(b.meta, { [key]: key === 'year' ? 2025 : 'different' });
      expect(() => assertComparable(a, b)).toThrow();
    },
  );
  it('rejects missing frames and malformed provenance', () => {
    expect(() => readExport({})).toThrow();
    const a = exported();
    a.meta.head = 'unknown';
    expect(() => readExport(a)).toThrow();
  });
});

describe('shared football clock', () => {
  it('aligns second halves while the shorter first half holds its last picture', () => {
    const a = frames(1, 1, 2, 2),
      b = frames(1, 1, 1, 2, 2),
      shared = sharedTimeline([a, b]);
    expect(ownSeconds(periodsOf(a), shared, 150)).toBeCloseTo(119.999);
    expect(ownSeconds(periodsOf(b), shared, 150)).toBe(150);
    expect(ownSeconds(periodsOf(a), shared, 180)).toBe(120);
    expect(ownSeconds(periodsOf(b), shared, 180)).toBe(180);
    expect(ownSeconds(periodsOf(a), shared, shared.length)).toBe(240);
  });
  it('gives equal repeated seeks and clamps the start/end', () => {
    const a = frames(1, 1, 2),
      shared = sharedTimeline([a, a]);
    const periods = periodsOf(a);
    expect(ownSeconds(periods, shared, 75)).toBe(ownSeconds(periods, shared, 75));
    expect(ownSeconds(periods, shared, -5)).toBe(0);
    expect(ownSeconds(periods, shared, 999)).toBe(180);
  });
  it('preserves real-time running and identical-panel dead-ball timing', () => {
    const a = frames(1, 1);
    a[0].stoppages = [{ kind: 'freeKick', dead: 10, settled: 12, kick: 15 }];
    const shared = sharedTimeline([a, a]),
      preparations = sharedPreparations([a, a], shared);
    expect(presentationAdvance(0, 1000, 1, 120, preparations)).toBe(1);
    for (const start of [0, 9, 10, 11, 12, 14, 15, 59, 60, 100])
      expect(presentationAdvance(start, 500, 2, 120, preparations)).toBeCloseTo(
        presentationAdvance(start, 500, 2, 120, deadBallBeats(a)),
        9,
      );
  });
});
