import { describe, expect, it } from 'vitest';
import { createWorld } from '../../../../packages/engine/src/founding';
import { recordRecentResult } from '../../../../packages/engine/src/recent-results';
import { validateWorld } from '../../../../packages/contracts/src/schema';
import { RECENT_RESULT_LIMIT } from '../../../../packages/contracts/src/recent-results';
import { pack, unpack } from './packing';

function world() {
  const w = createWorld({
    country: 'ENG',
    name: 'Recent results',
    color: '#24664f',
    seed: 'recent-results-packing',
    level: 'easy',
  });
  const played = {
    ...w.fixtures[0]!,
    score: { home: 2, away: 2 },
    shootout: { home: 5, away: 4 },
  };
  recordRecentResult(w, played);
  return { w, played };
}

describe('saved recent club results', () => {
  it('round-trips both clubs and shoot-outs through compact storage and world validation', () => {
    const { w } = world();
    const packed = pack(w);
    expect(packed.world.recentResults).toBeUndefined();
    expect(packed.recentResults).toBeDefined();
    const restored = validateWorld(unpack(packed));
    expect(restored.recentResults).toEqual(w.recentResults);
  });

  it('keeps old saves without recent-result tracking loadable', () => {
    const { w } = world();
    delete w.recentResults;
    const packed = pack(w);
    expect(packed).not.toHaveProperty('recentResults');
    expect(validateWorld(unpack(packed)).recentResults).toBeUndefined();
  });

  it('rejects oversized packed lists, duplicate results and foreign club references', () => {
    const { w, played } = world();
    const packed = pack(w);
    const rows = packed.recentResults![played.home]!;
    packed.recentResults![played.home] = Array.from(
      { length: RECENT_RESULT_LIMIT + 1 },
      () => rows[0]!,
    );
    expect(() => unpack(packed)).toThrow('최근 경기 압축 데이터 손상');
    w.recentResults![played.home]!.push({ ...played });
    expect(() => validateWorld(w)).toThrow('최근 경기 기록 참조 손상');
    w.recentResults![played.home] = [{ ...played, away: 'unknown-club' }];
    expect(() => validateWorld(w)).toThrow('최근 경기 기록 참조 손상');
  });
});
