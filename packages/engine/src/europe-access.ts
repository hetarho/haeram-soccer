import { message as sourceMessage } from '../../contracts/src/messages';
import type { SeasonArchive, World } from '../../contracts/src/types';
import { COUNTRIES } from '../../catalogs/src/index';
import { compareIds } from './primitives';
import { coefficientValue } from './europe-coefficients';

/** Quota bands include qualifying entrants, admitted directly in this demo (→EURO-11). */
export const EUROPE_ACCESS_CONFIG = {
  modernFrom: 2021,
  leagueFrom: 2024,
  performanceFrom: 2024,
  performanceSpots: 2,
  rankingSeasons: 5,
  rankingLag: 2,
  baseline: ['ENG', 'ESP', 'ITA', 'GER', 'FRA', 'NED', 'POR', 'BEL'],
  earlierBaseline: ['ENG', 'ESP', 'ITA', 'GER', 'FRA', 'POR', 'NED', 'BEL'],
  quotas: {
    topFour: [4, 2, 1],
    fifth: [4, 2, 1],
    sixth: [3, 2, 1],
    remaining: [2, 1, 2],
  },
  priority: ['ucl', 'cwc', 'uel', 'uecl'],
} as const;
type AccessWorld = Pick<World, 'year' | 'history' | 'clubs' | 'lastChampions'>;
export interface EuropeanEntry {
  competition: string;
  reason: string;
}

const preceding = (w: AccessWorld) => w.history.find((h) => h.year === w.year - 1);
const baseline = (year: number): readonly string[] =>
  year < EUROPE_ACCESS_CONFIG.leagueFrom
    ? EUROPE_ACCESS_CONFIG.earlierBaseline
    : EUROPE_ACCESS_CONFIG.baseline;
const complete = (h: SeasonArchive | undefined) =>
  !!h && COUNTRIES.every((c) => h.europeCoefficients?.some((r) => r.country === c.code));
const value = (h: SeasonArchive | undefined, country: string) =>
  coefficientValue(h?.europeCoefficients?.find((r) => r.country === country));

/** Association ranking has a one-season publication lag: entry Y reads Y-6 through Y-2. */
export function associationAccessOrder(w: AccessWorld) {
  const config = EUROPE_ACCESS_CONFIG;
  const seasons = Array.from({ length: config.rankingSeasons }, (_, i) =>
    w.history.find((h) => h.year === w.year - config.rankingLag - i),
  );
  const order = [...baseline(w.year)];
  if (!seasons.every(complete)) return order;
  return order.sort((a, b) => {
    const difference = seasons.reduce((sum, h) => sum + value(h, b) - value(h, a), 0);
    if (difference) return difference;
    for (const h of seasons) {
      const recent = value(h, b) - value(h, a);
      if (recent) return recent;
    }
    return baseline(w.year).indexOf(a) - baseline(w.year).indexOf(b);
  });
}

export function performanceAssociations(w: AccessWorld) {
  if (w.year < EUROPE_ACCESS_CONFIG.performanceFrom) return [];
  const last = preceding(w);
  if (!complete(last)) return [];
  const order = associationAccessOrder(w);
  return [...order]
    .sort((a, b) => value(last, b) - value(last, a) || order.indexOf(a) - order.indexOf(b))
    .slice(0, EUROPE_ACCESS_CONFIG.performanceSpots);
}

function leagueOrder(w: AccessWorld, country: string) {
  const last = preceding(w);
  if (last)
    return last.standings
      .filter((r) => r[1] === 0 && w.clubs[r[0]].country === country)
      .sort(
        (a, b) =>
          b[3] - a[3] ||
          b[4] - b[5] - (a[4] - a[5]) ||
          b[4] - a[4] ||
          compareIds(w.clubs[a[0]].id, w.clubs[b[0]].id),
      )
      .map((r) => w.clubs[r[0]].id);
  return w.clubs
    .filter((c) => c.country === country && c.tier === 0 && !c.representative)
    .sort((a, b) => b.strength - a.strength || compareIds(a.id, b.id))
    .map((c) => c.id);
}

/** Pure allocation: reads closed facts, never active draws or this season's live league table. */
export function europeanAccess(w: AccessWorld): Map<string, EuropeanEntry> {
  const config = EUROPE_ACCESS_CONFIG;
  const entries = new Map<string, EuropeanEntry>();
  const last = preceding(w);
  const season = last
    ? sourceMessage('copy.europe_access.62a074737b', {
        p0: last.year,
        p1: String(last.year + 1).slice(-2),
      })
    : sourceMessage('copy.SeasonReview.73092db344');
  const tables = new Map(COUNTRIES.map((c) => [c.code as string, leagueOrder(w, c.code)]));
  const countryOf = new Map(w.clubs.map((c) => [c.id, c.country]));
  const leagueReason = (id: string) =>
    last
      ? sourceMessage('copy.europe_access.16f8eddfe5', {
          p0: season,
          p1: tables.get(countryOf.get(id)!)!.indexOf(id) + 1,
        })
      : sourceMessage('copy.europe_access.03f5fe09d1');
  const give = (id: string | undefined, competition: string, reason: string) => {
    if (!id || !countryOf.has(id)) return;
    const old = entries.get(id);
    if (
      !old ||
      config.priority.indexOf(competition as (typeof config.priority)[number]) <=
        config.priority.indexOf(old.competition as (typeof config.priority)[number])
    )
      entries.set(id, { competition, reason });
  };
  const order = associationAccessOrder(w);
  for (const c of COUNTRIES) {
    const table = tables.get(c.code)!;
    const cup = (last?.champions ?? (w.history.length ? [] : w.lastChampions)).find(
      (ch) => ch.country === c.code,
    )?.cup;
    if (w.year < config.modernFrom) {
      const ucl = w.year >= 1997 ? 2 : 1;
      if (w.year >= 1955)
        table
          .slice(0, ucl)
          .forEach((id) =>
            give(
              id,
              'ucl',
              sourceMessage('copy.europe_access.843a7c8705', { p0: leagueReason(id) }),
            ),
          );
      if (w.year >= 1960 && w.year <= 1998)
        give(
          cup || table[1],
          'cwc',
          cup
            ? sourceMessage('copy.europe_access.684ca30007', { p0: season })
            : sourceMessage('copy.europe_access.843a7c8705', { p0: leagueReason(table[1]) }),
        );
      if (w.year >= 1971) {
        if (w.year >= 1999)
          give(cup, 'uel', sourceMessage('copy.europe_access.684ca30007', { p0: season }));
        table
          .slice(ucl, ucl + 2)
          .forEach((id) =>
            give(
              id,
              'uel',
              sourceMessage('copy.europe_access.843a7c8705', { p0: leagueReason(id) }),
            ),
          );
      }
      continue;
    }
    const rank = order.indexOf(c.code) + 1;
    const q = config.quotas;
    const quota =
      rank <= 4
        ? q.topFour
        : rank === 5 && w.year >= config.leagueFrom
          ? q.fifth
          : rank <= 6
            ? q.sixth
            : q.remaining;
    const allocatedReason = (id: string) =>
      sourceMessage('copy.europe_access.7db147fe53', { p0: leagueReason(id), p1: rank });
    table.slice(0, quota[0]).forEach((id) => give(id, 'ucl', allocatedReason(id)));
    give(cup, 'uel', sourceMessage('copy.europe_access.684ca30007', { p0: season }));
    for (const competition of ['uel', 'uecl'] as const) {
      const target = quota[competition === 'uel' ? 1 : 2];
      const count = () =>
        [...entries].filter(
          ([id, e]) => countryOf.get(id) === c.code && e.competition === competition,
        ).length;
      for (const id of table) {
        if (count() >= target) break;
        if (!entries.has(id))
          give(
            id,
            competition,
            `${allocatedReason(id)}${cup ? sourceMessage('copy.europe_access.a1de99dc46') : ''}${c.code === 'ENG' && competition === 'uecl' ? sourceMessage('copy.europe_access.d75177b316') : ''}`,
          );
      }
    }
  }
  for (const t of last?.europe ?? []) {
    const target =
      t.kind === 'ucl' && w.year >= 1956
        ? 'ucl'
        : t.kind === 'uel' && w.year >= 1972
          ? w.year >= 2015
            ? 'ucl'
            : 'uel'
          : t.kind === 'uecl' && w.year >= 2022
            ? 'uel'
            : t.kind === 'cwc' && w.year <= 1998
              ? 'cwc'
              : undefined;
    if (target)
      give(
        t.winner,
        target,
        sourceMessage('copy.europe_access.a81de8e0de', { p0: season, p1: t.name }),
      );
  }
  for (const country of performanceAssociations(w)) {
    const table = tables.get(country)!;
    const id = table.find((club) => entries.get(club)?.competition !== 'ucl');
    if (!id) continue;
    const vacated = entries.get(id)?.competition;
    give(id, 'ucl', sourceMessage('copy.europe_access.aac6cebc22', { p0: leagueReason(id) }));
    if (vacated !== 'uel' && vacated !== 'uecl') continue;
    const lower =
      vacated === 'uel'
        ? table.find((club) => entries.get(club)?.competition === 'uecl')
        : undefined;
    if (lower)
      give(
        lower,
        'uel',
        sourceMessage('copy.europe_access.07900fd5b7', { p0: leagueReason(lower) }),
      );
    const next = table.find((club) => !entries.has(club));
    give(
      next,
      lower ? 'uecl' : vacated,
      next ? sourceMessage('copy.europe_access.5b977bad64', { p0: leagueReason(next) }) : '',
    );
  }
  return entries;
}
