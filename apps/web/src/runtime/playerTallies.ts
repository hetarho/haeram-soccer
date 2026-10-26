import type { Incident, MatchRecord, World } from '../../../../packages/contracts/src/types';
import { heatMap, MATERIAL_LAYOUT, ownSideOf } from '../../../../packages/engine/src/material';

/**
 * The counts every view carries (→HIST-13, HIST-16, MATCH-19, LEAGUE-15): appearances, cards and
 * season heat from the lines and incidents of own matches, shared by the Worker host and the UI's
 * read models. Nothing here changes the world.
 */

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

export interface Cards {
  yellow: number;
  red: number;
}
/** A yellow card, a second yellow (it counts towards accumulation too) or a red. */
const card = (kind: Incident['kind']) =>
  kind === 'yellow' ? [1, 0] : kind === 'secondYellow' ? [1, 1] : kind === 'red' ? [0, 1] : null;

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

export interface Appearances {
  season: number;
  career: number;
  seasonSub: number;
  careerSub: number;
}
/**
 * Appearances by player (→HIST-13): one per own-match record whose line for him has minutes, a
 * starter or a substitute (his ID is the `other` of a `sub` incident); a line with 0 minutes gains
 * none. Season is the season in progress, career every own match.
 */
export const appearanceCounts = perOwnMatches((w: Matches) => {
  const counts = new Map<string, Appearances>();
  for (const m of w.ownMatches) {
    const subs = new Set(m.incidents?.flatMap((x) => (x.kind === 'sub' && x.other) || []));
    const season = m.year === w.year ? 1 : 0;
    for (const line of m.players) {
      if (!(line.metrics[10] > 0)) continue;
      let entry = counts.get(line.id);
      if (!entry)
        counts.set(line.id, (entry = { season: 0, career: 0, seasonSub: 0, careerSub: 0 }));
      const sub = subs.has(line.id) ? 1 : 0;
      entry.career++;
      entry.season += season;
      entry.careerSub += sub;
      entry.seasonSub += sub * season;
    }
  }
  return counts;
});
/** An own player's counts over every own match, season then career (→HIST-13, HIST-16). */
export interface PlayerTally {
  apps: [number, number];
  sub: [number, number];
  yellow: [number, number];
  red: [number, number];
  /** This season's touches per heat-map cell, while its matches keep their material (→MATCH-5). */
  heat?: number[];
}
/**
 * Counts every view carries: the client keeps only the latest own matches, so the host derives them
 * from all of them, again only when an own match is added or the season turns.
 */
export interface Tallies {
  /** Own players, past and present, with an appearance, a card or a touch; absent is none. */
  players: Record<string, PlayerTally>;
  /** This season's league reds by player, either side of every own match (→LEAGUE-15). */
  leagueReds: Record<string, number>;
}
export const tallies = perOwnMatches(
  (w: Pick<World, 'ownMatches' | 'year' | 'players' | 'playerClub'>): Tallies => {
    const apps = appearanceCounts(w),
      cards = cardCounts(w);
    const heat: Record<string, number[]> = {};
    for (const m of w.ownMatches) {
      if (m.year !== w.year || !m.material) continue;
      const own = ownSideOf(m, w.playerClub);
      for (const line of m.players) {
        const map = heatMap(m, line.id, own);
        if (!map?.touches) continue;
        const sum = (heat[line.id] ??= Array<number>(MATERIAL_LAYOUT.cells).fill(0));
        map.cells.forEach((n, i) => (sum[i] += n));
      }
    }
    const players: Record<string, PlayerTally> = {};
    for (const p of w.players) {
      const a = apps.get(p.id),
        c = cards.get(p.id);
      if (!a && !c && !heat[p.id]) continue;
      players[p.id] = {
        apps: [a?.season ?? 0, a?.career ?? 0],
        sub: [a?.seasonSub ?? 0, a?.careerSub ?? 0],
        yellow: [c?.season.yellow ?? 0, c?.career.yellow ?? 0],
        red: [c?.season.red ?? 0, c?.career.red ?? 0],
        ...(heat[p.id] ? { heat: heat[p.id] } : {}),
      };
    }
    return { players, leagueReds: leagueReds(w) };
  },
);
