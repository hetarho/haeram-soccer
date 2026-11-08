import { message as sourceMessage } from '../../contracts/src/messages';
/**
 * Competition keys and calendars, a leaf the UI may read (→ARCH-4): cup keys and names, the domestic
 * cup's rounds, knockout round counts and labels, tie IDs, legs and aggregates, and the continental
 * eras and calendar. cups.ts, knockout.ts and europe.ts re-export what they used to define here.
 */
import type { EuropeTournament, Fixture, KnockoutTie, World } from '../../contracts/src/types';
import { country } from '../../catalogs/src/index';

export const cupKey = (code: string) => `cup:${code}`;
export const domesticCupName = (code: string) =>
  sourceMessage('copy.competition_keys.ef795ccae4', { p0: country(code).name });

/** Media name of a knockout round from the clubs it starts with: 결승, 4강, 8강 … or N라운드. */
export function roundLabel(clubs: number, index: number) {
  if (clubs === 2) return sourceMessage('copy.CupHistory.d7f030913a');
  if (clubs <= 64 && (clubs & (clubs - 1)) === 0)
    return sourceMessage('copy.competition_keys.839570c2f2', { p0: clubs });
  return sourceMessage('copy.BusinessWorkbench.fcefde4602', { p0: index + 1 });
}

/** A tie's fixture ID; `year` reaches the fixtures of a season already closed. */
export function tieId(
  w: Pick<World, 'year'>,
  key: string,
  round: number,
  tie: number,
  year = w.year,
) {
  return `${year}:${key}:k${round}:${tie}`;
}

/** Aggregate score of a tie from the first-leg home side's view, for display. */
export function tieAggregate(tie: KnockoutTie, legs: readonly Fixture[]): [number, number] {
  return legs.reduce<[number, number]>(
    (sum, f) =>
      f.score
        ? f.home === tie.home
          ? [sum[0] + f.score.home, sum[1] + f.score.away]
          : [sum[0] + f.score.away, sum[1] + f.score.home]
        : sum,
    [0, 0],
  );
}

/**
 * Midweek rounds of the domestic cup, final last (→LEAGUE-5): early September to a May final,
 * clear of every round the continental competitions use.
 */
export const DOMESTIC_CUP_ROUNDS = [5, 11, 16, 23, 28, 35, 42] as const;

/**
 * Knockout rounds needed to find one winner among `n` clubs, at least 1: ⌈log₂ n⌉, the bit length
 * of n − 1, exact in integers for the whole club counts it receives (below 2³²).
 */
export function roundsFor(n: number) {
  return 32 - Math.clz32(Math.max(2, n) - 1);
}

/** The legs of tie `t` in round `index` of the `year` season, in playing order. */
export function legsOf(
  w: World,
  fixtures: readonly Fixture[],
  key: string,
  index: number,
  t: number,
  year = w.year,
) {
  const id = tieId(w, key, index, t, year);
  return fixtures
    .filter((f) => f.id === id || f.id === `${id}:2`)
    .sort((a, b) => a.round - b.round);
}

/** Continental competitions: their format by season (eras) and their calendar in league rounds. */
export interface Era {
  key: string;
  name: string;
  field: number;
  format: EuropeTournament['format'];
  games: number;
  qualifier?: number;
}
export function europeanEras(year: number): Era[] {
  const eras: Era[] = [];
  if (year >= 1955)
    eras.push({
      key: 'ucl',
      name: year < 1992 ? 'European Cup' : 'Champions League',
      field:
        year === 1955
          ? 16
          : year < 1994
            ? 32
            : year < 1997
              ? 16
              : year < 1999
                ? 24
                : year < 2024
                  ? 32
                  : 36,
      format:
        year < 1991
          ? 'knockout'
          : year < 1999
            ? 'groups'
            : year < 2003
              ? 'double-groups'
              : year < 2024
                ? 'groups'
                : 'league',
      games: year < 1991 ? 0 : year < 2024 ? 6 : 8,
      ...(year >= 1991 && year < 1994 ? { qualifier: 8 } : {}),
    });
  if (year >= 1971)
    eras.push({
      key: 'uel',
      name: year < 2009 ? 'UEFA Cup' : 'Europa League',
      field: year < 2004 ? 64 : year < 2009 ? 40 : year < 2021 ? 48 : year < 2024 ? 32 : 36,
      format: year < 2004 ? 'knockout' : year < 2024 ? 'groups' : 'league',
      games: year < 2004 ? 0 : year < 2009 ? 4 : year < 2024 ? 6 : 8,
    });
  if (year >= 2021)
    eras.push({
      key: 'uecl',
      name: year < 2024 ? 'Europa Conference League' : 'Conference League',
      field: year < 2024 ? 32 : 36,
      format: year < 2024 ? 'groups' : 'league',
      games: 6,
    });
  if (year >= 1960 && year <= 1998)
    eras.push({ key: 'cwc', name: 'Cup Winners Cup', field: 32, format: 'knockout', games: 0 });
  return eras;
}

/** League rounds of a knockout round's legs: first leg and return, or the final alone. */
export type Legs = readonly [number, number] | readonly [number];

/**
 * The continental calendar in league rounds (a midweek three days before the league weekend),
 * modelled on the UEFA season (→EURO-10): phase matchdays from September to January, two-legged
 * knockout rounds and a single final in late May. Legs keep each era's gap: two weeks before
 * 2003, then a week, except the Champions League's last 16 (three weeks until 2024). No leg falls
 * on a domestic cup midweek.
 */
export const EUROPE_CALENDAR = {
  /** Phase matchdays by how many a club plays (5 for five-club groups with a bye). */
  phase: {
    5: [9, 12, 14, 17, 19],
    6: [7, 9, 12, 14, 17, 19],
    8: [7, 9, 12, 14, 17, 19, 25, 26],
  } as Record<number, number[]>,
  /** The 1999–2002 second group stage. */
  second: [25, 26, 29, 30, 32, 33],
  /** The 1991–93 knockout rounds before the groups, and those groups. */
  qualifier: [
    [7, 9],
    [12, 14],
  ] as readonly Legs[],
  qualifiedPhase: [17, 19, 25, 26, 29, 32],
  /** Knockout-only eras: early rounds from September, the last three back from the final. */
  knockout: {
    early: [
      [7, 9],
      [12, 14],
      [17, 19],
    ] as readonly Legs[],
    late: [[43], [36, 38], [31, 33]] as readonly Legs[],
  },
  /** Knockout rounds after a phase, back from the final. */
  afterPhase: {
    /** Before 2003; after the 1999–2002 second group stage the last eight move to April. */
    early: [[43], [38, 40], [31, 33]] as readonly Legs[],
    afterSecond: [[43], [39, 41], [36, 38]] as readonly Legs[],
    /** 2003–2023; the Champions League's last 16 play three weeks apart. */
    groups: [[43], [39, 40], [36, 37], [32, 33], [29, 30]] as readonly Legs[],
    championsGroups: [[43], [39, 40], [36, 37], [29, 32]] as readonly Legs[],
    /** From 2024: the play-off and the last 16 in consecutive fortnights. */
    league: [[43], [39, 40], [36, 37], [31, 32], [29, 30]] as readonly Legs[],
  },
} as const;
/**
 * First-leg rounds back from the final before rules 1.14.0, every return a round later. Matches
 * archived then keep their stage (→HIST-13).
 */
export const LEGACY_EUROPE_CALENDAR = {
  afterPhase: [43, 39, 36, 32, 29],
  knockout: [43, 39, 32, 14, 9, 7],
} as const;

type Format = Pick<EuropeTournament, 'key' | 'format'>;
function afterPhaseLadder(t: Format, year: number) {
  const c = EUROPE_CALENDAR.afterPhase;
  if (t.format === 'league') return c.league;
  if (year < 2003) return t.format === 'double-groups' ? c.afterSecond : c.early;
  return t.key === 'ucl' ? c.championsGroups : c.groups;
}
/** The legs of knockout round `within` of `total` (qualifying rounds aside) in `year` (→EURO-10). */
export function knockoutLegs(t: Format, year: number, within: number, total: number): Legs {
  const back = Math.max(0, total - 1 - within);
  if (t.format === 'knockout') {
    const { early, late } = EUROPE_CALENDAR.knockout;
    return back < late.length ? late[back] : early[Math.min(within, early.length - 1)];
  }
  const ladder = afterPhaseLadder(t, year);
  return ladder[Math.min(back, ladder.length - 1)];
}
/** Rounds back from the final of a knockout match after a phase, from its league round. */
export function afterPhaseBack(t: Format, year: number, round: number, second: boolean) {
  const back = afterPhaseLadder(t, year).findIndex((legs) => legs[second ? 1 : 0] === round);
  return back >= 0
    ? back
    : (LEGACY_EUROPE_CALENDAR.afterPhase as readonly number[]).indexOf(second ? round - 1 : round);
}
/** The round of a tie's return leg given its first leg's, for brackets rebuilt from archives. */
export function returnLegRound(t: Format, year: number, first: number) {
  const ladders =
    t.format === 'knockout'
      ? [...EUROPE_CALENDAR.knockout.early, ...EUROPE_CALENDAR.knockout.late]
      : [...EUROPE_CALENDAR.qualifier, ...afterPhaseLadder(t, year)];
  return ladders.find((legs) => legs[0] === first)?.[1] ?? first + 1;
}
