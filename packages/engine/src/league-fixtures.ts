/** Pure fixture reconstruction shared by season preparation and the save codec. */
import type { Club, Fixture, LeagueDeduction, TableRow, World } from '../../contracts/src/types';
import { compareIds } from './primitives';

export function groupKey(c: Club) {
  return `${c.country}:${c.tier}:${c.group}`;
}
export function fixturesFor(clubs: Club[], year: number, globalRounds = 46): Fixture[] {
  const ring: (Club | null)[] = [...clubs].sort((a, b) => compareIds(a.id, b.id));
  if (ring.length % 2) ring.push(null);
  const n = ring.length;
  const matches: Fixture[] = [];
  for (let round = 0; round < (n - 1) * 2; round++) {
    for (let i = 0; i < n / 2; i++) {
      let a = ring[i],
        b = ring[n - 1 - i];
      if (!a || !b) continue;
      if (((round % (n - 1)) % 2 === 1) !== round >= n - 1) [a, b] = [b, a];
      matches.push({
        id: `${year}:${groupKey(a)}:${round}:${i}`,
        year,
        round: Math.floor((round * globalRounds) / ((n - 1) * 2)) + 1,
        kind: 'league',
        home: a.id,
        away: b.id,
        country: a.country,
        groupKey: groupKey(a),
      });
    }
    ring.splice(1, 0, ring.pop()!);
  }
  return matches;
}
/** Every professional group's round robin this season (→LEAGUE-1). */
export function buildSeasonFixtures(w: Pick<World, 'clubs' | 'year'>): Fixture[] {
  const groups = new Map<string, Club[]>();
  for (const c of w.clubs)
    if (!c.representative) {
      const k = groupKey(c);
      groups.set(k, [...(groups.get(k) || []), c]);
    }
  const fixtures: Fixture[] = [];
  for (const cs of groups.values()) fixtures.push(...fixturesFor(cs, w.year));
  return fixtures;
}
/** Settled match points after separately recorded administrative deductions. */
export const leaguePoints = (row: Pick<TableRow, 'points' | 'deducted'>) =>
  row.points - (row.deducted ?? 0);

/** A compact record carries settled points and its administrative deduction separately. */
export function archivedLeaguePoints(
  archive: { leagueDeductions?: Record<string, LeagueDeduction> },
  club: string,
  points: number,
) {
  return leaguePoints({ points, deducted: archive.leagueDeductions?.[club]?.deducted });
}
export const emptyTable = (): TableRow => ({
  played: 0,
  won: 0,
  drawn: 0,
  lost: 0,
  gf: 0,
  ga: 0,
  points: 0,
});

/** The settled league ordering, shared by season outcomes and individual award team credit. */
export function ranked<T extends Pick<Club, 'id'>>(w: Pick<World, 'tables'>, clubs: readonly T[]) {
  return [...clubs].sort((a, b) => {
    const x = w.tables[a.id] || emptyTable(),
      y = w.tables[b.id] || emptyTable();
    return (
      leaguePoints(y) - leaguePoints(x) ||
      y.gf - y.ga - (x.gf - x.ga) ||
      y.gf - x.gf ||
      compareIds(a.id, b.id)
    );
  });
}

/** Preserve the existing six-column history tuples and add only actual deduction receipts. */
export function archiveLeagueDeductions(w: Pick<World, 'tables'>, clubs = Object.keys(w.tables)) {
  const rows = clubs
    .map((club) => [club, w.tables[club]] as const)
    .filter(([, row]) => row?.deducted !== undefined);
  return rows.length
    ? {
        leagueDeductions: Object.fromEntries(
          rows.map(([club, row]) => [
            club,
            { deducted: row.deducted!, deductionReason: 'administration' as const },
          ]),
        ),
      }
    : {};
}
