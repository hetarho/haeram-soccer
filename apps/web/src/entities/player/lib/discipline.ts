import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import type { Ban, World } from '../../../../../../packages/contracts/src/types';
import type { FullStatsRead } from '../../../../../../packages/contracts/src/match-model';
import { PD } from '../../../../../../packages/contracts/src/detail';
import type { ProjectedWorld } from '../../../runtime/protocol';

/**
 * Display read models of cards and bans (→MATCH-19, CLUB-45, LEAGUE-15): shared own-match
 * tallies and complete competition reads, with bans and yellows from `w.discipline`. Pure reads.
 */
export { cardCounts, leagueReds, perOwnMatches, type Cards } from '../../../runtime/playerTallies';

/** Where a ban counts, as the squad and the league tables say it. */
export const banScope = (scope: Ban['scope']) =>
  scope === 'domestic'
    ? sourceMessage('copy.discipline.1583262fcc')
    : scope === 'league'
      ? sourceMessage('navigation.league')
      : scope === 'europe'
        ? sourceMessage('copy.discipline.4e0665502d')
        : sourceMessage('navigation.short.europe');
export const banText = (ban: Pick<Ban, 'matches' | 'scope'>) =>
  sourceMessage('copy.discipline.f893e30ca2', { p0: ban.matches, p1: banScope(ban.scope) });
/** A player's bans still to serve. */
export const bansOf = (w: Pick<World, 'discipline'>, id: string) =>
  w.discipline?.bans.filter((ban) => ban.player === id) ?? [];

export interface DisciplineRow {
  id: string;
  name: string;
  /** Known affiliation, omitted when the read only supplies a multi-club contribution set. */
  club?: string;
  clubs: string[];
  /** League yellows this season. */
  yellows: number;
  reds: number | undefined;
  bans: Ban[];
}
/**
 * The league's 징계 table for the season in progress (→WEB-40, LEAGUE-15): every player of its clubs
 * with a league yellow, a league red or a ban, most reds then most yellows first. Yellows and bans
 * come from `w.discipline`. A supplied tracked read replaces legacy own-match `reds`; null means
 * unavailable reds. Omitting the fourth argument preserves the legacy three-argument read.
 */
export function leagueDiscipline(
  w: World & Pick<ProjectedWorld, 'disciplineNames'>,
  clubIds: string[],
  reds: Record<string, number>,
  read?: FullStatsRead | null,
): DisciplineRow[] {
  const d = w.discipline;
  const members = new Set(clubIds);
  const recorded = read?.year === w.year ? read.competition.players : [];
  // A tracked sample is authoritative, including partial samples. Never add own-match incidents.
  if (read !== undefined)
    reds = Object.fromEntries(
      recorded.map((player) => [
        player.id,
        player.clubs.reduce(
          (n, part) => n + (members.has(part.club) ? part.detail[PD.redCards]! : 0),
          0,
        ),
      ]),
    );
  const ids = [
    ...new Set([
      ...Object.keys(d?.yellows ?? {}).filter((id) => d!.yellows[id]!.league),
      ...(d?.bans ?? []).map((ban) => ban.player),
      ...(read === undefined ? Object.keys(reds) : Object.keys(reds).filter((id) => reds[id]! > 0)),
    ]),
  ];
  if (!ids.length) return [];
  const people = new Map<string, { name: string; club?: string; clubs: string[] }>();
  for (const player of recorded) {
    const clubs = player.clubs.map((part) => part.club).filter((id) => members.has(id));
    if (clubs.length)
      people.set(player.id, {
        name: player.name,
        club: clubs.length === 1 ? clubs[0] : undefined,
        clubs,
      });
  }
  for (const s of w.scorerSeason?.players ?? [])
    people.set(s.id, { name: s.name, club: s.club, clubs: people.get(s.id)?.clubs ?? [s.club] });
  for (const p of w.players)
    if (p.status === 'active')
      people.set(p.id, {
        name: p.name,
        club: w.playerClub,
        clubs: people.get(p.id)?.clubs ?? [w.playerClub],
      });
  for (const [id, person] of Object.entries(w.disciplineNames ?? {}))
    if (!people.has(id)) people.set(id, { ...person, clubs: [person.club] });
  const rows: DisciplineRow[] = [];
  for (const id of ids) {
    const bans = d?.bans.filter((ban) => ban.player === id) ?? [];
    const who =
      people.get(id) ??
      (bans[0] && {
        name: sourceMessage('copy.EventCenter.5a281e7e95'),
        club: bans[0].club,
        clubs: [bans[0].club],
      });
    if (
      who &&
      (read !== undefined ? who.clubs.some((id) => members.has(id)) : members.has(who.club!))
    )
      rows.push({
        id,
        ...who,
        yellows: d?.yellows[id]?.league ?? 0,
        reds: read === null || (read && read.year !== w.year) ? undefined : (reds[id] ?? 0),
        bans,
      });
  }
  return rows.sort(
    (a, b) =>
      (b.reds ?? 0) - (a.reds ?? 0) || b.yellows - a.yellows || a.name.localeCompare(b.name, 'ko'),
  );
}
