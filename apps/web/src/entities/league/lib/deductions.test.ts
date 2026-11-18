import { describe, expect, it } from 'vitest';
import type {
  SeasonArchive,
  StandingSnapshot,
  World,
} from '../../../../../../packages/contracts/src/types';
import { emptyTable, ranked } from '../../../../../../packages/engine/src/league-fixtures';
import { archivedTimeline, leagueOverviewModel, orderIds } from './league';
import { finalRows, seasonRecords } from './seasonArchive';

/** Only the table and archived facts under test; club order deliberately differs from ID order. */
function scene() {
  const clubs = ['B', 'A'].map((id) => ({ id, country: 'ENG', tier: 0, group: 0 }));
  const tables = {
    A: {
      ...emptyTable(),
      played: 1,
      won: 1,
      gf: 2,
      points: 3,
      deducted: 10,
      deductionReason: 'administration' as const,
    },
    B: { ...emptyTable(), played: 1, lost: 1, ga: 2, points: 0 },
  };
  const deductions = { A: { deducted: 10, deductionReason: 'administration' as const } };
  const snapshot: StandingSnapshot = {
    year: 2000,
    round: 1,
    day: 1,
    tier: 0,
    group: 0,
    rows: [
      [0, 0, 0, 2],
      [1, 3, 2, 0],
    ],
    leagueDeductions: deductions,
  };
  const w = {
    year: 2000,
    clubs,
    tables,
    playerClub: 'A',
    fixtures: [],
    rankHistory: [snapshot],
  } as unknown as World;
  const season = {
    year: 2000,
    tier: 0,
    group: 0,
    points: 3,
    deducted: 10,
    won: 1,
    drawn: 0,
    lost: 0,
    leagueDeductions: deductions,
  } as unknown as SeasonArchive;
  const standings = [
    [1, 0, 0, 3, 2, 0],
    [0, 0, 0, 0, 0, 2],
  ];
  return { w, season, standings };
}

describe('administrative points at league display boundaries', () => {
  it('uses the engine order and net gaps without changing gross match facts', () => {
    const { w } = scene();
    const before = structuredClone(w);
    const ids = w.clubs.map((c) => c.id);
    expect(orderIds(ids, w.tables)).toEqual(ranked(w, w.clubs).map((c) => c.id));
    expect(orderIds(ids, w.tables)).toEqual(['B', 'A']);
    expect(leagueOverviewModel(w)).toMatchObject({ rank: 2, gap: 7 });
    expect(w).toEqual(before);
  });
  it('reads snapshot and final-standings deductions by stable ID, keeping W/D/L inference gross', () => {
    const { w, season, standings } = scene();
    const before = structuredClone(w);
    expect(archivedTimeline(w, 2000)[0].rows).toEqual([
      { id: 'B', rank: 1, points: 0, gf: 0, ga: 2 },
      {
        id: 'A',
        rank: 2,
        points: -7,
        gf: 2,
        ga: 0,
        deducted: 10,
        deductionReason: 'administration',
      },
    ]);
    const kept = finalRows(w, season, standings);
    expect(kept).toEqual([
      [0, 0, 0, 2],
      [1, -7, 2, 0],
    ]);
    expect(seasonRecords(w, season)?.get(1)).toEqual([1, 0, 0]);
    expect(w).toEqual(before);
    delete w.rankHistory;
    expect(finalRows(w, season, standings)).toEqual(kept);
    // A pre-deduction archive keeps its original gross table.
    const legacy = { ...season, leagueDeductions: undefined, deducted: undefined };
    expect(finalRows(w, legacy, standings)?.[0]).toEqual([1, 3, 2, 0]);
  });
});
