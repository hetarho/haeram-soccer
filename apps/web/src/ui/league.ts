import type { Club, Fixture, TableRow, World } from '../../../../packages/contracts/src/types';
import { country } from '../../../../packages/catalogs/src/index';

const emptyRow = (): TableRow => ({
  played: 0,
  won: 0,
  drawn: 0,
  lost: 0,
  gf: 0,
  ga: 0,
  points: 0,
});

export interface LeagueRound {
  year: number;
  round: number;
  rows: { id: string; rank: number; points: number; gf: number; ga: number }[];
}

export function ownLeagueIds(w: World): string[] {
  const own = w.clubs.find((c) => c.id === w.playerClub)!;
  if (w.lower)
    return [
      ...new Set(w.fixtures.filter((f) => f.kind === 'lower').flatMap((f) => [f.home, f.away])),
    ];
  return w.clubs
    .filter(
      (c) =>
        c.country === own.country &&
        c.tier === own.tier &&
        c.group === own.group &&
        !c.representative,
    )
    .map((c) => c.id);
}

export function orderIds(ids: string[], tables: Record<string, TableRow>): string[] {
  return [...ids].sort((a, b) => {
    const x = tables[a] || emptyRow(),
      y = tables[b] || emptyRow();
    return (
      y.points - x.points ||
      y.gf - y.ga - (x.gf - x.ga) ||
      y.gf - x.gf ||
      (a < b ? -1 : a > b ? 1 : 0)
    );
  });
}

export function leagueFixtures(w: World, ids: string[]): Fixture[] {
  const clubs = new Set(ids);
  return w.fixtures.filter(
    (f) =>
      f.year === w.year &&
      (f.kind === 'league' || f.kind === 'lower') &&
      clubs.has(f.home) &&
      clubs.has(f.away),
  );
}

export function sameMembers(a: string[], b: string[]): boolean {
  const members = new Set(a);
  return members.size === new Set(b).size && b.every((id) => members.has(id));
}

export function leagueTimeline(w: World, ids: string[]): LeagueRound[] {
  const stored = (w.rankHistory || []).filter(
    (snapshot) =>
      snapshot.year === w.year &&
      snapshot.round > 0 &&
      sameMembers(
        ids,
        snapshot.rows.map((row) => w.clubs[row[0]]?.id).filter((id): id is string => !!id),
      ),
  );
  const savedRounds = stored.map((snapshot) => ({
    year: snapshot.year,
    round: snapshot.round,
    rows: snapshot.rows.map(([index, points, gf, ga], i) => ({
      id: w.clubs[index].id,
      rank: i + 1,
      points,
      gf,
      ga,
    })),
  }));

  // Scores are the source of truth for older saves and leagues without saved snapshots.
  const fixtures = leagueFixtures(w, ids)
    .filter((f) => f.score)
    .sort((a, b) => a.round - b.round || a.id.localeCompare(b.id));
  const tables = Object.fromEntries(ids.map((id) => [id, emptyRow()]));
  const rounds = [...new Set(fixtures.map((f) => f.round))];
  const reconstructed = rounds.map((round) => {
    for (const f of fixtures.filter((f) => f.round === round)) {
      for (const [id, gf, ga] of [
        [f.home, f.score!.home, f.score!.away],
        [f.away, f.score!.away, f.score!.home],
      ] as [string, number, number][]) {
        const row = tables[id];
        row.played++;
        row.gf += gf;
        row.ga += ga;
        if (gf > ga) {
          row.won++;
          row.points += 3;
        } else if (gf === ga) {
          row.drawn++;
          row.points++;
        } else row.lost++;
      }
    }
    return {
      year: w.year,
      round,
      rows: orderIds(ids, tables).map((id, i) => ({
        id,
        rank: i + 1,
        points: tables[id].points,
        gf: tables[id].gf,
        ga: tables[id].ga,
      })),
    };
  });
  // A migrated save can start saving snapshots midseason; retain its earlier scores.
  return [
    ...new Map([...reconstructed, ...savedRounds].map((round) => [round.round, round])).values(),
  ].sort((a, b) => a.round - b.round);
}

export function rankChange(timeline: LeagueRound[], id: string): number | undefined {
  if (timeline.length < 2) return undefined;
  const current = timeline.at(-1)?.rows.find((r) => r.id === id)?.rank;
  const previous = timeline.at(-2)?.rows.find((r) => r.id === id)?.rank;
  return current === undefined || previous === undefined ? undefined : previous - current;
}

export function formFor(fixtures: Fixture[], id: string): ('승' | '무' | '패')[] {
  return fixtures
    .filter((f) => f.score && (f.home === id || f.away === id))
    .sort((a, b) => a.round - b.round || a.id.localeCompare(b.id))
    .slice(-5)
    .map((f) => {
      const own = f.home === id ? f.score!.home : f.score!.away;
      const other = f.home === id ? f.score!.away : f.score!.home;
      return own > other ? '승' : own < other ? '패' : '무';
    });
}

export function leagueRules(w: World, ids: string[]) {
  const clubs = ids.map((id) => w.clubs.find((c) => c.id === id)).filter((c): c is Club => !!c);
  const first = clubs[0];
  if (
    !first ||
    !clubs.every(
      (c) => c.country === first.country && c.tier === first.tier && c.group === first.group,
    )
  )
    return undefined;
  const cp = country(first.country),
    lower = first.tier >= cp.groups.length;
  const regional = (cp.groups[first.tier]?.length || 0) > 1;
  const automatic = lower ? 1 : first.tier === 0 ? 0 : regional ? 1 : cp.automatic[first.tier - 1];
  const playoff = lower
    ? 3
    : first.tier > 0 && cp.moves[first.tier - 1] > cp.automatic[first.tier - 1]
      ? regional
        ? 3
        : 4
      : 0;
  const relegation = lower ? 0 : cp.moves[first.tier] || 2;
  return { automatic, playoff, relegation, lower, first, cp };
}
