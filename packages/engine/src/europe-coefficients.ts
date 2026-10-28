import type { AssociationCoefficient, EuropeTournament, World } from '../../contracts/src/types';
import { COUNTRIES } from '../../catalogs/src/index';
import { compareIds } from './primitives';

/** UEFA Annex D.3/D.5; eighths retain the Conference's 0.125 bonus exactly (→EURO-13). */
export const ASSOCIATION_COEFFICIENT_CONFIG = {
  firstRecordedSeason: 2023,
  units: 8,
  precision: 1000,
  win: 2,
  draw: 1,
  qualifyingWeight: 0.5,
  league: {
    ucl: { top: 12, floor: 6, step: 0.25 },
    uel: { top: 6, floor: 0, step: 0.25 },
    uecl: { top: 4, topEightStep: 0.25, ninth: 2, step: 0.125 },
  },
  knockout: { ucl: 1.5, uel: 1, uecl: 0.5 },
  groups: { uclEntry: 4, uclLast16: 5, uclRound: 1, uelWinner: 4, ueclWinner: 2 },
} as const;

export function coefficientValue(row: AssociationCoefficient | undefined) {
  if (!row?.clubs) return 0;
  const c = ASSOCIATION_COEFFICIENT_CONFIG;
  return Math.floor((row.points * c.precision) / (c.units * row.clubs));
}

/** The phase table's common ordering, also used to decide its coefficient bonuses. */
export function europeanTableOrder(t: EuropeTournament, ids: readonly string[]) {
  return [...ids].sort((a, b) => {
    const x = t.standings[a],
      y = t.standings[b];
    return y.points - x.points || y.gf - y.ga - (x.gf - x.ga) || y.gf - x.gf || compareIds(a, b);
  });
}

export function leaguePhaseBonus(key: string, rank: number) {
  const c = ASSOCIATION_COEFFICIENT_CONFIG.league;
  if (key === 'ucl' || key === 'uel')
    return Math.max(c[key].floor, c[key].top - (rank - 1) * c[key].step);
  if (key === 'uecl')
    return rank <= 8
      ? c.uecl.top - (rank - 1) * c.uecl.topEightStep
      : Math.max(0, c.uecl.ninth - (rank - 9) * c.uecl.step);
  return 0;
}

/** Complete season facts only: missing older detail never becomes an invented coefficient. */
export function associationCoefficients(
  w: Pick<World, 'year' | 'clubs' | 'europe'>,
): AssociationCoefficient[] | undefined {
  const config = ASSOCIATION_COEFFICIENT_CONFIG;
  if (w.year < config.firstRecordedSeason) return undefined;
  const tournaments = w.europe.filter((t) => ['ucl', 'uel', 'uecl'].includes(t.key));
  if (
    !tournaments.length ||
    tournaments.some((t) => !t.winner || !t.fixtures.length || t.fixtures.some((f) => !f.score))
  )
    return undefined;
  const countryOf = new Map(w.clubs.map((club) => [club.id, club.country]));
  const totals = new Map(
    COUNTRIES.map((c) => [
      c.code as string,
      { country: c.code, points: 0, entrants: new Set<string>() },
    ]),
  );
  const add = (id: string, points: number) => {
    const row = totals.get(countryOf.get(id) ?? '');
    if (row) row.points += points * config.units;
  };
  for (const t of tournaments) {
    for (const id of t.clubs) totals.get(countryOf.get(id) ?? '')?.entrants.add(id);
    const qualifiers = new Set(
      (t.rounds ?? []).flatMap((r, index) => (r.label.startsWith('예선') ? [index] : [])),
    );
    for (const f of t.fixtures) {
      const round = /:k(\d+):/.exec(f.id);
      const weight = round && qualifiers.has(Number(round[1])) ? config.qualifyingWeight : 1;
      const score = f.score!;
      add(
        f.home,
        (score.home > score.away ? config.win : score.home === score.away ? config.draw : 0) *
          weight,
      );
      add(
        f.away,
        (score.away > score.home ? config.win : score.home === score.away ? config.draw : 0) *
          weight,
      );
    }
    if (w.year >= 2024) {
      if (t.format === 'league') {
        if (t.firstStandings)
          t.firstStandings.forEach((row) =>
            add(w.clubs[row[0]].id, leaguePhaseBonus(t.key, row[1])),
          );
        else
          europeanTableOrder(t, t.clubs).forEach((id, i) =>
            add(id, leaguePhaseBonus(t.key, i + 1)),
          );
      }
      for (const r of t.rounds ?? [])
        if (['16강', '8강', '4강', '결승'].includes(r.label))
          for (const id of new Set([
            ...r.ties.flatMap((tie) => [tie.home, tie.away]),
            ...(r.byes ?? []),
          ]))
            add(id, config.knockout[t.key as keyof typeof config.knockout]);
    } else {
      if (t.format === 'groups') {
        if (t.key === 'ucl') t.clubs.forEach((id) => add(id, config.groups.uclEntry));
        else
          for (let i = 0; i < t.clubs.length; i += 4) {
            const group = europeanTableOrder(t, t.clubs.slice(i, i + 4));
            const bonus = t.key === 'uel' ? config.groups.uelWinner : config.groups.ueclWinner;
            group.slice(0, 2).forEach((id, rank) => add(id, bonus / (rank + 1)));
          }
      }
      for (const r of t.rounds ?? []) {
        const bonus =
          t.key === 'ucl'
            ? r.label === '16강'
              ? config.groups.uclLast16
              : ['8강', '4강', '결승'].includes(r.label)
                ? config.groups.uclRound
                : 0
            : (t.key === 'uel' ? ['16강', '8강', '4강', '결승'] : ['4강', '결승']).includes(r.label)
              ? 1
              : 0;
        for (const id of new Set([
          ...r.ties.flatMap((tie) => [tie.home, tie.away]),
          ...(r.byes ?? []),
        ]))
          add(id, bonus);
      }
    }
  }
  return [...totals.values()]
    .filter((r) => r.entrants.size)
    .map(({ country, points, entrants }) => ({ country, points, clubs: entrants.size }));
}
