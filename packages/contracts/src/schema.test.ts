import { describe, expect, it } from 'vitest';
import { LOAD_CATALOG } from '../../catalogs/src/index';
import { createWorld } from '../../engine/src/index';
import { addEvent } from '../../engine/src/events';
import { validateWorld } from './schema';
import type { World } from './types';

const world = () =>
  createWorld({
    country: 'ENG',
    name: 'Withdrawn Rovers',
    color: '#224466',
    seed: 'withdrawn-interventions',
    level: 'easy' as const,
  });

describe('owner interventions withdrawn (→SAVE-25)', () => {
  it('drops removed care state from an older save', () => {
    const w = world();
    // A paid request and a pending win bonus, as a career saved before CLUB-20 was withdrawn.
    addEvent(w, 'care:camp', '단기 전지훈련 캠프', '스태프 · 체력과 분위기를 함께 회복', '1000');
    addEvent(w, 'care:win-bonus', '승리 수당 걸기 (다음 5경기)', '구단주 · 선수단이 동기부여됨');
    const older = { ...structuredClone(w), winBonus: { matches: 3 } } as World & {
      winBonus: { matches: number };
    };
    const loaded = validateWorld(older, LOAD_CATALOG);
    expect(loaded).not.toHaveProperty('winBonus');
    // Every other fact stays as saved, the recorded requests among the club's events.
    expect(loaded).toEqual(validateWorld(w, LOAD_CATALOG));
    expect(loaded.events.slice(-2).map((event) => event.kind)).toEqual([
      'care:camp',
      'care:win-bonus',
    ]);
    // Reading never writes: the save itself is left for the writer's next checkpoint.
    expect(older.winBonus).toEqual({ matches: 3 });
  });
});
