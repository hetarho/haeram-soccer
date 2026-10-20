import type { Ban, Incident, MatchRecord, World } from '../../../../packages/contracts/src/types';
import { squad } from '../../../../packages/engine/src/world';

/**
 * Display read models of cards and bans (→MATCH-19, CLUB-45, LEAGUE-15): counts from the incidents
 * of own matches, bans and yellow counts from `w.discipline`. Nothing here changes the world.
 */

/** Where a ban counts, as the squad and the league tables say it. */
export const banScope = (scope: Ban['scope']) =>
  scope === 'domestic' ? '국내' : scope === 'league' ? '리그' : scope === 'europe' ? '유럽' : '컵';
export const banText = (ban: Pick<Ban, 'matches' | 'scope'>) =>
  `출장 정지 · ${ban.matches}경기 (${banScope(ban.scope)})`;
/** A player's bans still to serve. */
export const bansOf = (w: Pick<World, 'discipline'>, id: string) =>
  w.discipline?.bans.filter((ban) => ban.player === id) ?? [];

export interface Cards {
  yellow: number;
  red: number;
}
/** A yellow card, a second yellow (it counts towards accumulation too) or a red. */
const card = (kind: Incident['kind']) =>
  kind === 'yellow' ? [1, 0] : kind === 'secondYellow' ? [1, 1] : kind === 'red' ? [0, 1] : null;

type Matches = Pick<World, 'ownMatches' | 'year'>;
/**
 * One pass over the own matches, kept while the season and the number of own matches stay: they are
 * only ever appended to (and lose their material at the close, when the season turns), so the world's
 * daily revisions reuse it and only a match day rescans.
 */
export function perOwnMatches<W extends Matches, T>(build: (w: W) => T) {
  const cache = new WeakMap<MatchRecord[], { key: string; value: T }>();
  return (w: W): T => {
    const key = `${w.year}:${w.ownMatches.length}`;
    const hit = cache.get(w.ownMatches);
    if (hit?.key === key) return hit.value;
    const value = build(w);
    cache.set(w.ownMatches, { key, value });
    return value;
  };
}

/** Season and career cards of every player booked in an own match, either side. */
export const cardCounts = perOwnMatches((w: Matches) => {
  const counts = new Map<string, { season: Cards; career: Cards }>();
  for (const m of w.ownMatches)
    for (const incident of m.incidents ?? []) {
      const [yellow, red] = card(incident.kind) ?? [];
      if (yellow === undefined) continue;
      let entry = counts.get(incident.player);
      if (!entry)
        counts.set(
          incident.player,
          (entry = { season: { yellow: 0, red: 0 }, career: { yellow: 0, red: 0 } }),
        );
      entry.career.yellow += yellow;
      entry.career.red += red!;
      if (m.year === w.year) {
        entry.season.yellow += yellow;
        entry.season.red += red!;
      }
    }
  return counts;
});

/** Red cards of this season's league matches by player, either side of every own match. */
export const leagueReds = perOwnMatches((w: Matches) => {
  const reds: Record<string, number> = {};
  for (const m of w.ownMatches)
    if (m.year === w.year && (m.kind === 'league' || m.kind === 'lower'))
      for (const incident of m.incidents ?? [])
        if (card(incident.kind)?.[1]) reds[incident.player] = (reds[incident.player] ?? 0) + 1;
  return reds;
});

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
