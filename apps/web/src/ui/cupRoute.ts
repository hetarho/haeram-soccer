import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import type {
  CupRun,
  MatchRecord,
  SeasonArchive,
  World,
} from '../../../../packages/contracts/src/types';
import { COUNTRIES } from '../../../../packages/catalogs/src/index';
import { knockoutStage } from '../../../../packages/engine/src/stages';
import { ABROAD } from './league';

/** A nation as Korean media name it: the eight league countries, then the representatives'. */
export function nationName(code: string) {
  return COUNTRIES.find((c) => c.code === code)?.name ?? ABROAD[code] ?? code;
}

/** How far we went in one competition of a season, in a word: 우승, 준우승 or "8강 탈락". */
export function runResult(run: CupRun) {
  return run.champion
    ? sourceMessage('copy.CupHistory.31e52393f3')
    : run.reached === sourceMessage('copy.CupHistory.d7f030913a')
      ? sourceMessage('copy.CupHistory.adbe7b40f8')
      : sourceMessage('copy.CupsView.9f7893bf1b', { p0: run.reached });
}

/** Our line under a season's final: our result, or that we were not in it. */
export function runLine(season: Pick<SeasonArchive, 'runs'>, key: string) {
  if (!season.runs) return sourceMessage('copy.cupRoute.205db39c16');
  const run = season.runs.find((entry) => entry.key === key);
  return run
    ? sourceMessage('copy.TransferRecords.5ddc097395', { p0: runResult(run) })
    : sourceMessage('copy.CupHistory.c594d0de0f');
}

export interface RouteLeg {
  match: MatchRecord;
  /** 1차전 or 2차전; single matches have none. */
  leg?: 1 | 2;
  home: boolean;
  /** Goals, ours first. */
  score: [number, number];
  /** Our scorers in goal order with their minutes, "Arthur Brooks 26′ 58′ · Henry Turner 37′". */
  scorers: string;
}
export interface PhaseRow {
  kind: 'phase';
  label: string;
  matches: MatchRecord[];
  /** "4승 1무 1패 · 12득점 5실점". */
  record: string;
  /** "11위 · 36팀 · 승점 14", "조 2위 · 4팀 · 승점 10", or the points alone without a table. */
  standing: string;
  result: '진출' | '탈락';
}
export interface TieRow {
  kind: 'tie';
  label: string;
  opponent: string;
  /** The opponent's division that season (2부) or, abroad, its nation. */
  tag?: string;
  legs: RouteLeg[];
  /** "홈 2–1" or "1차전 원정 1–0 · 2차전 홈 1–2 · 합계 2–2". */
  summary: string;
  /** "xG 1.8–0.9", when every leg recorded it. */
  xg?: string;
  result: '진출' | '탈락' | '우승' | '준우승';
  /** How a level tie went through: 승부차기 승/패 or 원정 다득점 승/패. */
  decided?: string;
}
export type RouteRow = PhaseRow | TieRow;

/** What a closed season's archive request returns that the route reads (→HIST-13). */
export interface RouteArchive {
  season?: Pick<SeasonArchive, 'standings' | 'europe' | 'runs'>;
  matches: readonly MatchRecord[];
}

const firstRound = (row: RouteRow) =>
  Math.min(
    ...(row.kind === 'tie' ? row.legs.map((leg) => leg.match) : row.matches).map((m) => m.round),
  );

/** Our goals and theirs in one match. */
function goals(m: MatchRecord, own: string): [number, number] {
  return m.home === own ? [m.score.home, m.score.away] : [m.score.away, m.score.home];
}

/** Our scorers of one match from its highlights, each name once with every minute he scored. */
function scorersOf(m: MatchRecord, own: string) {
  const side = m.home === own ? 0 : 1,
    minutes = new Map<string, number[]>();
  for (const h of [...m.highlights].sort((a, b) => a.minute - b.minute))
    if (h.action === sourceMessage('copy.summary.68a6cf8ed8') && h.side === side)
      minutes.set(h.player, [...(minutes.get(h.player) || []), h.minute]);
  return [...minutes]
    .map(([player, at]) => `${player} ${at.map((minute) => `${minute}′`).join(' ')}`)
    .join(' · ');
}

/**
 * A group-stage or league-phase line: our record from our own matches and our place from the
 * table the season kept. Groups were not stored, so ours is us and the clubs we met, ordered by
 * their place in the whole stage.
 */
function phaseRow(
  w: Pick<World, 'clubs' | 'playerClub'>,
  key: string,
  label: string,
  matches: MatchRecord[],
  advanced: boolean,
  season?: RouteArchive['season'],
): PhaseRow {
  const own = w.playerClub;
  let won = 0,
    drawn = 0,
    lost = 0,
    gf = 0,
    ga = 0;
  for (const m of matches) {
    const [ours, theirs] = goals(m, own);
    gf += ours;
    ga += theirs;
    if (ours > theirs) won++;
    else if (ours === theirs) drawn++;
    else lost++;
  }
  const entry = season?.europe.find((e) => e.kind === key);
  const table =
    (label === sourceMessage('copy.cupRoute.be35e01438')
      ? entry?.secondStandings
      : entry?.standings) || [];
  const rowOf = (id: string) => table.find((row) => w.clubs[row[0]]?.id === id);
  const ours = rowOf(own);
  let standing: string = sourceMessage('copy.ClubHub.7776cad992', { p0: won * 3 + drawn });
  if (ours && label === sourceMessage('copy.competitionLabels.6b9ab4d59c'))
    standing = sourceMessage('copy.cupRoute.122bf0a87f', {
      p0: ours[1],
      p1: table.length,
      p2: ours[3],
    });
  else if (ours) {
    const members = [...new Set([own, ...matches.map((m) => (m.home === own ? m.away : m.home))])];
    const rows = members.map(rowOf);
    if (rows.every((row) => row)) {
      const place = rows.sort((a, b) => a![1] - b![1]).findIndex((row) => row === ours) + 1;
      standing = sourceMessage('copy.cupRoute.9d8759a693', {
        p0: place,
        p1: members.length,
        p2: ours[3],
      });
    }
  }
  return {
    kind: 'phase',
    label,
    matches,
    record: sourceMessage('copy.cupRoute.e6ab2ce2a7', {
      p0: won,
      p1: drawn,
      p2: lost,
      p3: gf,
      p4: ga,
    }),
    standing,
    result: advanced
      ? sourceMessage('copy.cupRoute.e030088bf0')
      : sourceMessage('copy.CupsView.4084035433'),
  };
}

/**
 * Our road through one competition of a closed season, in playing order (→WEB-40): a line per
 * group stage or league phase and a card per tie, read only from our recorded matches and the
 * tables that season kept. A level tie's winner follows knockout.ts decideTie: away goals in
 * two-legged continental ties before 2021, else the shoot-out recorded on the deciding leg.
 */
export function cupRoute(
  w: Pick<World, 'clubs' | 'playerClub'>,
  year: number,
  key: string,
  archive: RouteArchive,
): RouteRow[] {
  const own = w.playerClub;
  const phases = new Map<string, MatchRecord[]>(),
    ties = new Map<string, { label: string; legs: RouteLeg[] }>();
  for (const match of archive.matches) {
    const stage = match.year === year ? knockoutStage(match, year) : undefined;
    if (!stage || stage.competition !== key) continue;
    if (stage.phase) phases.set(stage.label, [...(phases.get(stage.label) || []), match]);
    else {
      // A return leg is its tie's ID plus `:2` (the tie number itself may be 2).
      const id = stage.leg === 2 ? match.id.slice(0, -2) : match.id,
        tie = ties.get(id) || { label: stage.label, legs: [] };
      tie.legs.push({
        match,
        leg: stage.leg,
        home: match.home === own,
        score: goals(match, own),
        scorers: scorersOf(match, own),
      });
      ties.set(id, tie);
    }
  }
  // A stage we played after another means we went through it.
  const played = [
      ...phases.values(),
      ...[...ties.values()].map((tie) => tie.legs.map((leg) => leg.match)),
    ],
    lastPlayed = Math.max(0, ...played.flat().map((m) => m.round)),
    after = (matches: MatchRecord[]) => lastPlayed > Math.max(...matches.map((m) => m.round)),
    champion = !!archive.season?.runs?.find((run) => run.key === key)?.champion;
  const rows: RouteRow[] = [...phases].map(([label, matches]) =>
    phaseRow(w, key, label, matches, after(matches), archive.season),
  );
  for (const { label, legs } of ties.values()) {
    legs.sort((a, b) => a.match.round - b.match.round);
    const first = legs[0].match,
      opponent = first.home === own ? first.away : first.home,
      club = w.clubs.find((c) => c.id === opponent),
      final = label === sourceMessage('copy.CupHistory.d7f030913a');
    let tag: string | undefined;
    if (key !== 'cup') tag = club && nationName(club.country);
    else if (archive.season?.standings.length) {
      // Every cup entrant is a professional club in that season's standings (→LEAGUE-5).
      const row = archive.season.standings.find((entry) => w.clubs[entry[0]]?.id === opponent);
      tag = row && sourceMessage('copy.cupRoute.3d1e4a6467', { p0: row[1] + 1 });
    }
    const venue = (leg: RouteLeg) =>
      `${leg.home ? sourceMessage('fixture.home') : sourceMessage('fixture.away')} ${leg.score[0]}–${leg.score[1]}`;
    const [ours, theirs] = legs.reduce<[number, number]>(
      (sum, leg) => [sum[0] + leg.score[0], sum[1] + leg.score[1]],
      [0, 0],
    );
    let won = ours > theirs,
      decided: string | undefined;
    if (ours === theirs) {
      // Away goals: ours where we were the visitors against theirs where they were.
      const away = legs.reduce<[number, number]>(
        (sum, leg) =>
          leg.home ? [sum[0], sum[1] + leg.score[1]] : [sum[0] + leg.score[0], sum[1]],
        [0, 0],
      );
      if (legs.length === 2 && key !== 'cup' && year < 2021 && away[0] !== away[1]) {
        won = away[0] > away[1];
        decided = sourceMessage('copy.Bracket.76f88f090f');
      } else {
        const last = legs.at(-1)!,
          shootout = last.match.highlights.find(
            (h) => h.player === sourceMessage('copy.headToHead.16fa957ea6'),
          );
        // The deciding leg keeps the shoot-out; without it, the title or a later round says who
        // went through.
        won = shootout
          ? shootout.side === (last.home ? 0 : 1)
          : final
            ? champion
            : after(legs.map((leg) => leg.match));
        decided = sourceMessage('copy.headToHead.16fa957ea6');
      }
    }
    const xg = legs.every((leg) => leg.match.xg)
      ? legs.reduce<[number, number]>(
          (sum, { match, home }) => [
            sum[0] + match.xg![home ? 0 : 1],
            sum[1] + match.xg![home ? 1 : 0],
          ],
          [0, 0],
        )
      : undefined;
    rows.push({
      kind: 'tie',
      label,
      opponent,
      ...(tag ? { tag } : {}),
      legs,
      summary:
        legs.length === 1
          ? venue(legs[0])
          : sourceMessage('copy.cupRoute.968d2d1647', {
              p0: legs
                .map((leg) =>
                  sourceMessage('copy.cupRoute.dea0454473', { p0: leg.leg, p1: venue(leg) }),
                )
                .join(' · '),
              p1: ours,
              p2: theirs,
            }),
      ...(xg ? { xg: `xG ${xg[0].toFixed(1)}–${xg[1].toFixed(1)}` } : {}),
      result: final
        ? won
          ? sourceMessage('copy.CupHistory.31e52393f3')
          : sourceMessage('copy.CupHistory.adbe7b40f8')
        : won
          ? sourceMessage('copy.cupRoute.e030088bf0')
          : sourceMessage('copy.CupsView.4084035433'),
      ...(decided
        ? {
            decided: `${decided} ${won ? sourceMessage('result.win') : sourceMessage('result.loss')}`,
          }
        : {}),
    });
  }
  return rows.sort((a, b) => firstRound(a) - firstRound(b));
}
