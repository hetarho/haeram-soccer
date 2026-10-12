import type { World, EuropeTournament, Fixture, KnockoutRound } from '../../contracts/src/types';
import { COUNTRIES } from '../../catalogs/src/index';
import { random, integer, compareIds, clamp } from './primitives';
import { addEvent, clubOf, findClub, initialElo } from './world';
import { emptyTable } from './season';
import { credit } from './operations';
import { footballQuote } from './finance';
import { currentDay, ROUND_INTERVAL_DAYS, SEASON_ROUNDS } from './calendar';
import {
  decideTie,
  finalOf,
  isDue,
  legsOf,
  openDraw,
  playFixture,
  roundDecided,
  roundLabel,
  roundsFor,
  seededDraw,
  splitByes,
  survivors,
  tieFixtures,
  type Settlement,
} from './knockout';
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
export function ensureRepresentatives(w: World) {
  if (w.clubs.some((c) => c.id === 'euro:0')) return;
  const places = [
    'AUT',
    'SCO',
    'SUI',
    'TUR',
    'GRE',
    'POL',
    'CZE',
    'DEN',
    'SWE',
    'NOR',
    'ROU',
    'CRO',
    'SRB',
    'UKR',
    'FIN',
    'HUN',
  ];
  for (let i = 0; i < 160; i++) {
    const r = random(`${w.seed}:euro:${i}`),
      code = places[i % places.length];
    const strength = integer(r, 50, 84);
    w.clubs.push({
      id: `euro:${i}`,
      country: code,
      name: `${code} ${['Railway', 'Riverside', 'Harbour', 'Foundry'][Math.floor(i / places.length) % 4]} ${Math.floor(i / places.length) + 1}`,
      short: `${code}${Math.floor(i / places.length) + 1}`,
      tier: 0,
      group: 0,
      strength,
      reputation: integer(r, 30, 75),
      fans: integer(r, 3000, 40000),
      color: '#456b73',
      representative: true,
      elo: initialElo(strength),
    });
    w.tables[`euro:${i}`] = emptyTable();
  }
}
function order(w: World, code: string) {
  const last = w.history.at(-1);
  if (last)
    return last.standings
      .filter((row) => w.clubs[row[0]].country === code && row[1] === 0)
      .sort(
        (a, b) =>
          b[3] - a[3] ||
          b[4] - b[5] - (a[4] - a[5]) ||
          b[4] - a[4] ||
          compareIds(w.clubs[a[0]].id, w.clubs[b[0]].id),
      )
      .map((row) => w.clubs[row[0]].id);
  return w.clubs
    .filter((c) => c.country === code && c.tier === 0 && !c.representative)
    .sort((a, b) => b.strength - a.strength || compareIds(a.id, b.id))
    .map((c) => c.id);
}
function sorted(t: EuropeTournament, ids: string[]) {
  return [...ids].sort((a, b) => {
    const x = t.standings[a],
      y = t.standings[b];
    return y.points - x.points || y.gf - y.ga - (x.gf - x.ga) || y.gf - x.gf || compareIds(a, b);
  });
}
export function leaguePhasePairs(ids: string[], games: number) {
  if (ids.length !== 36 || ![6, 8].includes(games)) throw new Error('36팀 리그 페이즈 설정 오류');
  const result: [string, string, number][] = [];
  // Balanced circulant graph: each opponent unique, exactly games/2 at home and away.
  for (let shift = 1; shift <= games / 2; shift++)
    for (let i = 0; i < ids.length; i++)
      result.push([ids[i], ids[(i + shift) % ids.length], shift * 2 - (i % 2)]);
  return result;
}
function groupPairs(ids: string[], size: number, double: boolean) {
  const result: [string, string, number][] = [];
  for (let g = 0; g < ids.length; g += size) {
    const ring: (string | null)[] = ids.slice(g, g + size);
    if (ring.length % 2) ring.push(null);
    const n = ring.length;
    for (let r = 0; r < (n - 1) * (double ? 2 : 1); r++) {
      for (let i = 0; i < n / 2; i++) {
        let a = ring[i],
          b = ring[n - 1 - i];
        if (!a || !b) continue;
        if (((r % (n - 1)) % 2 === 1) !== r >= n - 1) [a, b] = [b, a];
        result.push([a, b, r + 1]);
      }
      ring.splice(1, 0, ring.pop()!);
    }
  }
  return result;
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

function eraOf(w: World, t: EuropeTournament) {
  return europeanEras(w.year).find((era) => era.key === t.key);
}
const phaseFixture = (
  w: World,
  t: EuropeTournament,
  marker: string,
  i: number,
  a: string,
  b: string,
  round: number,
): Fixture => ({
  id: `${w.year}:${t.key}:${marker}:${i}`,
  year: w.year,
  round,
  kind: 'europe',
  home: a,
  away: b,
  country: 'UEFA',
  groupKey: t.key,
});
/** Phase fixtures for `ids`: one 36-club league or groups of four (five with four matches). */
function schedulePhase(
  w: World,
  t: EuropeTournament,
  ids: string[],
  marker: 'phase' | 'second',
  slots?: readonly number[],
) {
  const pairs =
    t.format === 'league' && marker === 'phase'
      ? leaguePhasePairs(ids, t.games)
      : groupPairs(ids, t.games === 4 ? 5 : 4, t.games !== 4);
  const matchdays = Math.max(...pairs.map((p) => p[2]));
  const calendar = slots || EUROPE_CALENDAR.phase[matchdays] || EUROPE_CALENDAR.phase[6];
  pairs.forEach(([a, b, r], i) =>
    t.fixtures.push(
      phaseFixture(w, t, marker, i, a, b, calendar[Math.min(r - 1, calendar.length - 1)]),
    ),
  );
}
/** Knockout legs are `…:k<round>:<tie>`; every other continental fixture counts in the table. */
const isKnockout = (id: string) => /:k\d+:\d+(:2)?$/.test(id);
/** Groups recovered from who plays whom: every group is a round robin of its own. */
export function phaseGroups(t: EuropeTournament, marker: 'phase' | 'second' = 'phase') {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const up = parent.get(id) ?? id;
    if (up === id) return id;
    const root = find(up);
    parent.set(id, root);
    return root;
  };
  const fixtures = t.fixtures.filter((f) => f.id.includes(`:${marker}:`));
  for (const f of fixtures) {
    parent.set(f.home, parent.get(f.home) ?? f.home);
    parent.set(f.away, parent.get(f.away) ?? f.away);
    const a = find(f.home),
      b = find(f.away);
    if (a !== b) parent.set(a, b);
  }
  const groups = new Map<string, string[]>();
  for (const id of t.clubs)
    if (parent.has(id)) {
      const root = find(id);
      groups.set(root, [...(groups.get(root) || []), id]);
    }
  return [...groups.values()];
}
function play(w: World, t: EuropeTournament, f: Fixture, settlement?: Settlement, observe = true) {
  const p = playFixture(w, f, settlement, observe);
  if (!p || !f.score) return;
  if (!isKnockout(f.id))
    for (const [id, gf, ga] of [
      [f.home, f.score.home, f.score.away],
      [f.away, f.score.away, f.score.home],
    ] as [string, number, number][]) {
      const row = (t.standings[id] ||= emptyTable());
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
  const own = f.home === w.playerClub || f.away === w.playerClub;
  if (!own) return;
  if (!isKnockout(f.id)) {
    const ownWin =
      f.home === w.playerClub ? f.score.home > f.score.away : f.score.away > f.score.home;
    // Continental prizes keep their rule and grow with the football index (→EURO-7, →ECON-26).
    const prize = footballQuote(
      clubOf(w).country,
      w.year,
      35 + (f.score.home === f.score.away ? 10 : ownWin ? 25 : 0),
    );
    credit(w, prize);
    addEvent(w, 'europe-prize', `${t.name} 경기 수당`, `참가·결과 수당 · ${f.id}`, prize);
  }
  clubOf(w).reputation = clamp(clubOf(w).reputation + 0.2);
  settlement?.(w, p);
}
/** Draws knockout round `index` of `total` from `clubs` (seeded order) and schedules its legs. */
function drawRound(
  w: World,
  t: EuropeTournament,
  clubs: string[],
  total: number,
  seeded: boolean,
  qualifier = false,
) {
  const rounds = (t.rounds ||= []);
  const index = rounds.length,
    within = qualifier ? index : rounds.filter((r) => !r.label.startsWith('예선')).length;
  const { playing, byes } = within === 0 ? splitByes(clubs) : { playing: clubs, byes: [] };
  const final = !qualifier && within === total - 1;
  const label = qualifier
    ? `예선 ${index + 1}라운드`
    : byes.length && t.format !== 'knockout'
      ? '플레이오프'
      : roundLabel(clubs.length, within);
  const planned = qualifier
    ? EUROPE_CALENDAR.qualifier[Math.min(index, EUROPE_CALENDAR.qualifier.length - 1)]
    : knockoutLegs(t, w.year, within, total);
  // A save from before rules 1.14.0 may draw a round its old calendar had already reached: its
  // legs move past today, keeping their gap, so the two legs never share a day. Rounds drawn at
  // the season close are played out there and keep their dates.
  const today = Math.max(w.round, Math.floor((currentDay(w) + 3) / ROUND_INTERVAL_DAYS));
  const shift = Math.max(0, today + 1 - planned[0]);
  const legs = planned.at(-1)! + shift <= SEASON_ROUNDS ? planned.map((r) => r + shift) : planned;
  const round: KnockoutRound = {
    label,
    round: legs[0],
    legs: final ? 1 : 2,
    ties: seeded ? seededDraw(playing) : openDraw(w, playing, `${w.year}:${t.key}:${index}`),
    ...(byes.length ? { byes } : {}),
  };
  rounds.push(round);
  t.fixtures.push(...tieFixtures(w, t.key, 'europe', 'UEFA', index, round, legs[1]));
  t.stage = round.label;
}
/** Qualifiers of a finished phase, in seeding order (group winners first). */
function phaseQualifiers(w: World, t: EuropeTournament, marker: 'phase' | 'second') {
  if (t.format === 'league' && marker === 'phase') {
    const table = sorted(t, t.clubs);
    if (table.slice(24).includes(w.playerClub)) t.ownExit = '리그 페이즈 탈락';
    return table.slice(0, 24);
  }
  const groups = phaseGroups(t, marker).map((g) => sorted(t, g));
  const members = groups.flat();
  const perGroup =
    marker === 'second'
      ? 2
      : t.field === 40
        ? 3
        : t.key === 'ucl' && w.year <= 1992 && members.length === 8
          ? 1
          : t.field === 16 || t.field >= 32
            ? 2
            : 1;
  const qualified: string[] = [];
  for (let place = 0; place < perGroup; place++)
    qualified.push(...groups.map((g) => g[place]).filter(Boolean));
  // The 24-club Champions League also sent its two best runners-up through.
  if (marker === 'phase' && t.field === 24)
    qualified.push(...sorted(t, groups.map((g) => g[1]).filter(Boolean)).slice(0, 2));
  if (members.includes(w.playerClub) && !qualified.includes(w.playerClub))
    t.ownExit = '조별 단계 탈락';
  return qualified;
}
function phaseRows(w: World, t: EuropeTournament, ids: string[]) {
  return sorted(t, ids).map((id, i) => {
    const row = t.standings[id] || emptyTable();
    return [w.clubs.findIndex((c) => c.id === id), i + 1, row.played, row.points, row.gf, row.ga];
  });
}
/** Decides finished ties and moves the competition to its next stage once a stage is complete. */
function progressEurope(w: World, t: EuropeTournament) {
  if (t.winner) return false;
  const era = eraOf(w, t);
  // Only historical competitions (and the Super Cup's single tie) move through stages.
  if (!era && !t.rounds?.length) return false;
  const rounds = (t.rounds ||= []);
  let changed = false;
  const last = rounds.at(-1);
  if (last) {
    const index = rounds.length - 1;
    last.ties.forEach((tie, i) => {
      if (!decideTie(w, tie, legsOf(w, t.fixtures, t.key, index, i), w.year < 2021)) return;
      changed = true;
      if (tie.home !== w.playerClub && tie.away !== w.playerClub) return;
      const prize = footballQuote(clubOf(w).country, w.year, 60);
      credit(w, prize);
      addEvent(w, 'europe-prize', `${t.name} ${last.label} 수당`, `토너먼트 참가 수당`, prize);
      if (tie.winner !== w.playerClub) t.ownExit = `${last.label} 탈락`;
    });
    if (!roundDecided(last)) return changed;
  }
  const phase = t.fixtures.filter((f) => f.id.includes(':phase:'));
  const second = t.fixtures.filter((f) => f.id.includes(':second:'));
  const afterPhase = rounds.filter((r) => !r.label.startsWith('예선'));
  if (t.format === 'knockout') {
    const total = roundsFor(t.clubs.length);
    if (!last) drawRound(w, t, t.clubs, total, false);
    else if (survivors(last).length > 1) drawRound(w, t, survivors(last), total, false);
    else return crown(w, t, survivors(last)[0]);
    return true;
  }
  if (era?.qualifier && !phase.length) {
    const left = last ? survivors(last) : t.clubs;
    if (left.length > era.qualifier) {
      drawRound(w, t, left, 0, false, true);
      return true;
    }
    for (const id of left) t.standings[id] = emptyTable();
    schedulePhase(w, t, left, 'phase', EUROPE_CALENDAR.qualifiedPhase);
    t.stage = '조별 리그';
    return true;
  }
  if (!phase.length) {
    schedulePhase(w, t, t.clubs, 'phase');
    t.stage = t.format === 'league' ? '리그 페이즈' : '조별 리그';
    return true;
  }
  if (phase.some((f) => !f.score)) return changed;
  if (t.format === 'double-groups' && !second.length) {
    const members = [...new Set(phase.flatMap((f) => [f.home, f.away]))];
    t.firstStandings = phaseRows(w, t, members);
    const qualified = phaseQualifiers(w, t, 'phase');
    for (const id of qualified) t.standings[id] = emptyTable();
    schedulePhase(w, t, qualified, 'second', EUROPE_CALENDAR.second);
    t.stage = '2차 조별 리그';
    return true;
  }
  if (second.some((f) => !f.score)) return changed;
  if (!afterPhase.length) {
    const marker = second.length ? 'second' : 'phase';
    const members = [...new Set((second.length ? second : phase).flatMap((f) => [f.home, f.away]))];
    if (second.length) t.secondStandings = phaseRows(w, t, members);
    else t.firstStandings = phaseRows(w, t, members);
    const qualified = phaseQualifiers(w, t, marker);
    drawRound(w, t, qualified, roundsFor(qualified.length), true);
    return true;
  }
  const left = survivors(afterPhase.at(-1)!);
  if (left.length === 1) return crown(w, t, left[0]);
  const total = afterPhase.length + roundsFor(left.length);
  drawRound(w, t, left, total, false);
  return true;
}
function crown(w: World, t: EuropeTournament, winner: string) {
  t.winner = winner;
  t.stage = '우승 확정';
  if (t.format === 'knockout' && !t.firstStandings) {
    for (const id of t.clubs) t.standings[id] = emptyTable();
    for (const f of t.fixtures)
      if (f.score)
        for (const [id, gf, ga] of [
          [f.home, f.score.home, f.score.away],
          [f.away, f.score.away, f.score.home],
        ] as [string, number, number][]) {
          const row = t.standings[id];
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
    t.firstStandings = phaseRows(w, t, t.clubs);
  }
  if (winner === w.playerClub && t.key !== 'super') {
    const prize = footballQuote(clubOf(w).country, w.year, 500);
    credit(w, prize);
    clubOf(w).reputation = clamp(clubOf(w).reputation + 8);
    addEvent(
      w,
      'europe-honor',
      `${t.name} 우승`,
      `${w.year}/${String(w.year + 1).slice(2)} · 대륙의 정상`,
      prize,
    );
  }
  return true;
}
export function prepareEurope(w: World) {
  ensureRepresentatives(w);
  w.europe = [];
  const occupied = new Set<string>();
  for (const era of europeanEras(w.year).sort(
    (a, b) =>
      ['ucl', 'cwc', 'uel', 'uecl'].indexOf(a.key) - ['ucl', 'cwc', 'uel', 'uecl'].indexOf(b.key),
  )) {
    let eligible: string[] = [];
    for (const c of COUNTRIES) {
      const table = order(w, c.code),
        cup = w.lastChampions.find((ch) => ch.country === c.code)?.cup;
      if (era.key === 'ucl') eligible.push(...table.slice(0, w.year >= 1997 ? 2 : 1));
      else if (era.key === 'cwc') eligible.push(cup || table[1]);
      else if (era.key === 'uel')
        eligible.push(
          ...(w.year >= 1999 && cup ? [cup] : []),
          ...table.slice(w.year >= 1997 ? 2 : 1, w.year >= 1997 ? 4 : 3),
        );
      else eligible.push(...table.slice(4, 5));
    }
    const background = w.clubs
      .filter((c) => c.id.startsWith('euro:'))
      .sort(
        (a, b) =>
          random(`${w.seed}:${w.year}:${a.id}`)() - random(`${w.seed}:${w.year}:${b.id}`)() ||
          compareIds(a.id, b.id),
      )
      .map((c) => c.id);
    eligible = [...new Set([...eligible, ...background])]
      .filter((id) => id && !occupied.has(id))
      .slice(0, era.field);
    if (eligible.length !== era.field) throw new Error('유럽대회 참가팀 부족');
    eligible.forEach((id) => occupied.add(id));
    const t: EuropeTournament = {
      key: era.key,
      name: era.name,
      field: era.field,
      format: era.format,
      games: era.games,
      stage: era.format === 'knockout' ? '토너먼트' : '리그/조별 단계',
      clubs: eligible,
      fixtures: [],
      standings: Object.fromEntries(eligible.map((id) => [id, emptyTable()])),
      rounds: [],
    };
    w.europe.push(t);
    progressEurope(w, t);
    if (eligible.includes(w.playerClub))
      addEvent(
        w,
        'europe-qualification',
        `${t.name} 참가`,
        '지난 시즌 리그/컵 성적에 따른 데모 배분 · 실제 UEFA 접근 목록을 단순화했습니다.',
      );
  }
}
/** Plays the continental fixtures due today (or by the current round) and moves each stage on. */
export function advanceEurope(w: World, settlement?: Settlement, day?: number, observe = true) {
  for (const t of w.europe)
    for (let guard = 0; guard < 16; guard++) {
      let played = false;
      for (const f of t.fixtures)
        if (isDue(w, f, day)) {
          play(w, t, f, settlement, observe);
          played = true;
        }
      if (!progressEurope(w, t) && !played) break;
    }
}
/** Season close: plays out anything left (older saves) and the Super Cup between the winners. */
export function finishEurope(w: World) {
  for (const t of w.europe)
    for (let guard = 0; guard < 40 && !t.winner; guard++) {
      for (const f of t.fixtures) if (!f.score) play(w, t, f);
      progressEurope(w, t);
    }
  if (w.year >= 1973 && !w.europe.some((t) => t.key === 'super')) {
    const ucl = w.europe.find((t) => t.key === 'ucl')?.winner,
      other = w.europe.find((t) => t.key === (w.year < 1999 ? 'cwc' : 'uel'))?.winner;
    if (ucl && other && ucl !== other) {
      const t: EuropeTournament = {
        key: 'super',
        name: 'UEFA Super Cup',
        field: 2,
        format: 'knockout',
        games: 1,
        stage: '결승',
        clubs: [ucl, other],
        fixtures: [],
        standings: { [ucl]: emptyTable(), [other]: emptyTable() },
        rounds: [
          { label: '결승', round: SEASON_ROUNDS, legs: 1, ties: [{ home: ucl, away: other }] },
        ],
      };
      t.fixtures.push(...tieFixtures(w, 'super', 'europe', 'UEFA', 0, t.rounds![0]));
      w.europe.push(t);
      for (let guard = 0; guard < 4 && !t.winner; guard++) {
        for (const f of t.fixtures) if (!f.score) play(w, t, f);
        progressEurope(w, t);
      }
    }
  }
}
/** The final of a finished continental competition, for the season archive. */
export function europeFinal(w: World, t: EuropeTournament) {
  return t.rounds?.length ? finalOf(w, t.key, t.rounds, t.fixtures) : undefined;
}
export const continentalClub = findClub;

export function europeanCoefficient(w: World) {
  return w.ownMatches
    .filter((m) => m.kind === 'europe' && m.year >= w.year - 5)
    .reduce((sum, m) => {
      const own = m.home === w.playerClub ? m.score.home : m.score.away,
        opponent = m.home === w.playerClub ? m.score.away : m.score.home;
      return sum + (own > opponent ? 2 : own === opponent ? 1 : 0);
    }, 0);
}
