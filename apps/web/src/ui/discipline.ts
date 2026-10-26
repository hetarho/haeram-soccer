import type { Ban, World } from '../../../../packages/contracts/src/types';
import { squad } from '../../../../packages/engine/src/world';

/**
 * Display read models of cards and bans (→MATCH-19, CLUB-45, LEAGUE-15): counts from the incidents
 * of own matches (the shared tallies), bans and yellow counts from `w.discipline`. Nothing here
 * changes the world.
 */
export { cardCounts, leagueReds, perOwnMatches, type Cards } from '../runtime/playerTallies';

/** Where a ban counts, as the squad and the league tables say it. */
export const banScope = (scope: Ban['scope']) =>
  scope === 'domestic' ? '국내' : scope === 'league' ? '리그' : scope === 'europe' ? '유럽' : '컵';
export const banText = (ban: Pick<Ban, 'matches' | 'scope'>) =>
  `출장 정지 · ${ban.matches}경기 (${banScope(ban.scope)})`;
/** A player's bans still to serve. */
export const bansOf = (w: Pick<World, 'discipline'>, id: string) =>
  w.discipline?.bans.filter((ban) => ban.player === id) ?? [];

export interface DisciplineRow {
  id: string;
  name: string;
  club: string;
  /** League yellows this season. */
  yellows: number;
  reds: number;
  bans: Ban[];
}
/**
 * The league's 징계 table for the season in progress (→WEB-40, LEAGUE-15): every player of its clubs
 * with a league yellow, a league red or a ban, most reds then most yellows first. Yellows and bans
 * come from `w.discipline`, reds from this season's records (`reds`, see `leagueReds`).
 */
export function leagueDiscipline(
  w: World,
  clubIds: string[],
  reds: Record<string, number>,
): DisciplineRow[] {
  const d = w.discipline;
  const ids = [
    ...new Set([
      ...Object.keys(d?.yellows ?? {}).filter((id) => d!.yellows[id]!.league),
      ...(d?.bans ?? []).map((ban) => ban.player),
      ...Object.keys(reds),
    ]),
  ];
  if (!ids.length) return [];
  const people = new Map<string, { name: string; club: string }>();
  for (const s of w.scorerSeason?.players ?? []) people.set(s.id, { name: s.name, club: s.club });
  for (const p of w.players)
    if (p.status === 'active') people.set(p.id, { name: p.name, club: w.playerClub });
  // Other clubs' squads are generated only when someone is still unnamed.
  if (ids.some((id) => !people.has(id)))
    for (const id of clubIds) {
      const club = w.clubs.find((c) => c.id === id);
      if (club && id !== w.playerClub)
        for (const p of squad(w, club)) people.set(p.id, { name: p.name, club: id });
    }
  const members = new Set(clubIds);
  const rows: DisciplineRow[] = [];
  for (const id of ids) {
    const bans = d?.bans.filter((ban) => ban.player === id) ?? [];
    const who = people.get(id) ?? (bans[0] && { name: '선수 정보 없음', club: bans[0].club });
    if (who && members.has(who.club))
      rows.push({ id, ...who, yellows: d?.yellows[id]?.league ?? 0, reds: reds[id] ?? 0, bans });
  }
  return rows.sort(
    (a, b) => b.reds - a.reds || b.yellows - a.yellows || a.name.localeCompare(b.name, 'ko'),
  );
}
