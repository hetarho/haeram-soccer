import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { POSITIONS } from '../../../contracts/src/player';
import { CELL_BASELINES, POSITION_PROFILES, profileKey } from './baselines';

describe('grid baselines', () => {
  it('matches the retained reference dataset exactly', () => {
    const copy = readFileSync(new URL('./baselines.json', import.meta.url));
    const doc = readFileSync(
      new URL('../../../../artifacts/benchmarks/match-baselines-40.json', import.meta.url),
    );
    expect(copy.equals(doc)).toBe(true);
  });

  it('has 40 cells whose shares sum to 1 (±0.01)', () => {
    expect(CELL_BASELINES).toHaveLength(40);
    expect(CELL_BASELINES.every((cell) => cell !== undefined)).toBe(true);
    const total = CELL_BASELINES.reduce((sum, cell) => sum + cell.share, 0);
    expect(Math.abs(total - 1)).toBeLessThanOrEqual(0.01);
  });

  it('maps every position to a profile', () => {
    for (const position of POSITIONS) expect(POSITION_PROFILES[profileKey(position)]).toBeDefined();
    expect(profileKey('LWB')).toBe('FB');
    expect(profileKey('RW')).toBe('W');
    expect(profileKey('ST')).toBe('ST');
  });
});
