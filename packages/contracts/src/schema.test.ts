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

  it('drops removed training orders from an older save', () => {
    const w = world();
    // Orders the owner had the coaches take and the strain they left, as a career saved before
    // STAFF-19 was withdrawn: the coaches' own calls decide from here (→CLUB-13, CLUB-31).
    const older = structuredClone(w) as World & {
      trainingOrders: unknown;
      staff: (NonNullable<World['staff']>[number] & { strain?: unknown; asked?: unknown })[];
    };
    const player = w.players[0]!.id;
    older.trainingOrders = {
      assistant: { focus: 'hard', rounds: 3, forced: true },
      youth: { focus: 'firstTeam', rounds: 2 },
      players: { [player]: { focus: 'recovery', rounds: 4 } },
      asked: { [player]: { year: w.year, round: 0 } },
      hardStreak: 2,
    };
    older.staff[0] = {
      ...older.staff[0]!,
      strain: { year: w.year, count: 2 },
      asked: { year: w.year, round: 0 },
    };
    const loaded = validateWorld(older, LOAD_CATALOG);
    expect(loaded).not.toHaveProperty('trainingOrders');
    // The squad's 하드 streak was kept among the orders: it restarts with the next 하드 round.
    expect(loaded.hardStreak).toBeUndefined();
    for (const member of loaded.staff!) {
      expect(member).not.toHaveProperty('strain');
      expect(member).not.toHaveProperty('asked');
    }
    // Every other fact stays as saved.
    expect(loaded).toEqual(validateWorld(w, LOAD_CATALOG));
    // Reading never writes: the save itself is left for the writer's next checkpoint.
    expect(older.staff[0]!.strain).toEqual({ year: w.year, count: 2 });
    expect(older.trainingOrders).toBeDefined();
  });
});
