/** Pure fixture reconstruction shared by season preparation and the save codec. */
import type { Club, Fixture, TableRow, World } from '../../contracts/src/types';
import { country } from '../../catalogs/src/index';
import { clubOf } from './player-state';
import { compareIds } from './primitives';
export const AMATEUR_CLUBS = 15;

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
/** The amateur clubs the own club meets in the amateur league. */
export function amateurOpponents(w: Pick<World, 'clubs' | 'playerClub'>) {
  const own = clubOf(w);
  return w.clubs
    .filter(
      (c) =>
        c.country === own.country &&
        c.representative &&
        c.tier === country(c.country).groups.length,
    )
    .slice(0, AMATEUR_CLUBS);
}

export function buildSeasonFixtures(
  w: Pick<World, 'clubs' | 'playerClub' | 'year' | 'lower'>,
): Fixture[] {
  const groups = new Map<string, Club[]>();
  for (const c of w.clubs)
    if (!c.representative && c.tier < country(c.country).groups.length) {
      const k = groupKey(c);
      groups.set(k, [...(groups.get(k) || []), c]);
    }
  const fixtures: Fixture[] = [];
  for (const cs of groups.values()) fixtures.push(...fixturesFor(cs, w.year));
  if (w.lower)
    fixtures.push(
      ...fixturesFor([clubOf(w), ...amateurOpponents(w)], w.year).map((f) => ({
        ...f,
        kind: 'lower' as const,
        groupKey: 'lower',
      })),
    );
  return fixtures;
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
