import type { World } from '../../contracts/src/types';
import type { CareerReads, PlayerRead } from '../../contracts/src/career-reads';
import { heatMap, MATERIAL_LAYOUT, ownSideOf } from './material';
import { clubOf, isOwnSeason } from './player-state';

function playerRow(s: CareerReads, id: string, year: number): PlayerRead {
  let p = s.players[id];
  if (!p)
    p = s.players[id] = {
      year,
      apps: [0, 0],
      sub: [0, 0],
      yellow: [0, 0],
      red: [0, 0],
      leagueReds: 0,
    };
  if (p.year !== year) {
    p.year = year;
    p.apps[0] = 0;
    p.sub[0] = 0;
    p.yellow[0] = 0;
    p.red[0] = 0;
    p.leagueReds = 0;
    delete p.heat;
  }
  return p;
}
export function initializeCareerReads(w: World) {
  if (w.careerReads) return;
  w.careerReads = {
    format: 1,
    year: w.year,
    matches: 0,
    events: 0,
    history: 0,
    wins: 0,
    promoted: false,
    bestPlayed: 0,
    bestFans: 0,
    heatPlayers: [],
    bestWon: 0,
    players: {},
    europe: {},
  };
  refreshCareerReads(w);
}
/** Only newly appended facts are consumed. Per-player season totals reset lazily by year. */
export function refreshCareerReads(w: World) {
  const s = w.careerReads;
  if (!s) return;
  if (s.year !== w.year) {
    for (const id of s.heatPlayers) delete s.players[id]?.heat;
    s.heatPlayers = [];
    s.year = w.year;
  }
  while (s.matches < w.ownMatches.length) {
    const m = w.ownMatches[s.matches++];
    const own = m.home === w.playerClub ? m.score.home : m.score.away;
    const other = m.home === w.playerClub ? m.score.away : m.score.home;
    if (own > other) s.wins++;
    if (m.kind === 'europe')
      s.europe[m.year] = (s.europe[m.year] ?? 0) + (own > other ? 2 : own === other ? 1 : 0);
    const substitutes = new Set(
      m.incidents?.flatMap((i) => (i.kind === 'sub' && i.other ? [i.other] : [])),
    );
    for (const line of m.players) {
      if (line.metrics[10] <= 0) continue;
      const p = playerRow(s, line.id, m.year);
      p.apps[0]++;
      p.apps[1]++;
      if (substitutes.has(line.id)) {
        p.sub[0]++;
        p.sub[1]++;
      }
    }
    for (const incident of m.incidents ?? []) {
      const yellow = incident.kind === 'yellow' || incident.kind === 'secondYellow' ? 1 : 0;
      const red = incident.kind === 'red' || incident.kind === 'secondYellow' ? 1 : 0;
      if (!yellow && !red) continue;
      const p = playerRow(s, incident.player, m.year);
      p.yellow[0] += yellow;
      p.yellow[1] += yellow;
      p.red[0] += red;
      p.red[1] += red;
      if (m.kind === 'league') p.leagueReds += red;
    }
    if (m.year === w.year && m.material) {
      const side = ownSideOf(m, w.playerClub);
      for (const line of m.players) {
        const map = heatMap(m, line.id, side);
        if (!map?.touches) continue;
        const p = playerRow(s, line.id, m.year);
        if (!p.heat) s.heatPlayers.push(line.id);
        const heat = (p.heat ??= Array<number>(MATERIAL_LAYOUT.cells).fill(0));
        map.cells.forEach((n, i) => (heat[i] += n));
      }
    }
  }
  while (s.events < w.events.length)
    if (w.events[s.events++].kind === 'promotion') s.promoted = true;
  while (s.history < w.history.length) {
    const h = w.history[s.history++];
    // The world's seasons before the takeover are the club's past, not the owner's (→HIST-21).
    if (!isOwnSeason(w, h)) continue;
    if (s.lastTier !== undefined && s.lastTier > h.tier) s.promoted = true;
    s.lastTier = h.tier;
    s.bestFans = Math.max(s.bestFans, h.fans);
    s.bestPlayed = Math.max(s.bestPlayed, h.played);
    s.bestWon = Math.max(s.bestWon, h.won);
  }
}
/** The window deliberately includes the current season and five preceding seasons. */
export function careerEuropeanCoefficient(w: Pick<World, 'careerReads' | 'year'>): number {
  let total = 0;
  for (let y = w.year - 5; y <= w.year; y++) total += w.careerReads?.europe[y] ?? 0;
  return total;
}
export function careerPromotion(w: World) {
  const s = w.careerReads;
  return !!s && (s.promoted || (s.lastTier !== undefined && s.lastTier > clubOf(w).tier));
}
