/**
 * The current season's complete aggregates (→HIST-3, HIST-17, MATCH-26/27): the one reducer that
 * every fixture-settling path feeds — league, cups, playoffs and Europe, the own club's matches on
 * the detailed engine and every other fixture on the aggregate path. Per competition it keeps each
 * club's totals and each named participant's per-club contributions under his stable identity
 * (→WORLD-6/11): an ID, a name and a position, never a Player object or a match trace.
 */
import { emptyPlayerDetail, emptyTeamDetail } from '../../contracts/src/detail';
import {
  activeMatchModel,
  type FullMatchRecord,
  type NpcClubTotals,
  type NpcCompetitionStats,
  type NpcContribution,
  type NpcPlayerTotals,
  type NpcSeasonStats,
  type TrackingBoundary,
} from '../../contracts/src/match-model';
import type { Fixture, MatchPlayback, Metrics, Player, World } from '../../contracts/src/types';
import { currentDay, SEASON_ROUNDS } from './calendar';
import { M } from './grid/record';
import { zeroMetrics } from './primitives';

/**
 * Where newly available counters start (→SAVE-23, HIST-17): the first game day and league round
 * not yet lived, so `{ day: 1, round: 1 }` is a season tracked whole. After the final round, before
 * the close, it names that round with the close's day.
 */
export function trackingBoundary(w: World): TrackingBoundary {
  return { year: w.year, day: currentDay(w) + 1, round: Math.min(w.round + 1, SEASON_ROUNDS) };
}

/**
 * Opens the season's empty aggregates under the world's active model, counting from `trackedFrom`:
 * the season's start at every season turn, the activation boundary in the season a career
 * activates.
 */
export function openNpcSeason(w: World, trackedFrom = trackingBoundary(w)): NpcSeasonStats {
  const model = activeMatchModel(w);
  if (model === undefined) throw new Error('경기 모델이 활성화되지 않은 세계입니다.');
  return (w.npcSeason = { year: w.year, model, trackedFrom, competitions: [] });
}

/** The competition scope of a fixture (→HIST-6), if anything of it was settled. */
export function npcCompetition(
  stats: NpcSeasonStats | undefined,
  scope: Pick<Fixture, 'kind' | 'groupKey'>,
): NpcCompetitionStats | undefined {
  return stats?.competitions.find((c) => c.kind === scope.kind && c.groupKey === scope.groupKey);
}

/** A participant's totals in one competition, his clubs' contributions summed; nothing changes. */
export function playerTotals(player: NpcPlayerTotals): Omit<NpcContribution, 'club'> {
  const total = { appearances: 0, metrics: zeroMetrics(), detail: emptyPlayerDetail() };
  for (const part of player.clubs) {
    total.appearances += part.appearances;
    add(total.metrics, part.metrics);
    add(total.detail, part.detail);
  }
  return total;
}

/**
 * Clubs and participants by ID per competition, kept beside the stats (never in the world) and
 * rebuilt whenever the lists were replaced or grew elsewhere, as after a load.
 */
interface CompetitionIndex {
  clubs: Map<string, NpcClubTotals>;
  players: Map<string, NpcPlayerTotals>;
}
const indexes = new WeakMap<NpcCompetitionStats, CompetitionIndex>();
function indexFor(c: NpcCompetitionStats): CompetitionIndex {
  let ix = indexes.get(c);
  if (!ix || ix.clubs.size !== c.clubs.length || ix.players.size !== c.players.length) {
    ix = {
      clubs: new Map(c.clubs.map((row) => [row.club, row])),
      players: new Map(c.players.map((row) => [row.id, row])),
    };
    indexes.set(c, ix);
  }
  return ix;
}

function add(into: Metrics, row: Metrics) {
  for (let i = 0; i < into.length; i++) into[i]! += row[i]!;
}

/**
 * Adds one settled full-model result to the season's aggregates, exactly once (→MATCH-27): the
 * settlement (season.ts `recordMatch`) calls it once per fixture behind the fixture's settled
 * identity — a scheduled fixture with a score is never played again, an own result already saved
 * is a no-op and the worker serializes commands — so it keeps no outcome list of its own and draws
 * nothing. Each side's club adds the match, its team row and its xG for and against; each line
 * that played adds an appearance and his counters to his contribution for that club (→HIST-13).
 * Results of the pre-feature model, of another season or with no open season are not counted:
 * untracked stays absent, never zero (→HIST-17).
 */
export function settleNpcSeason(w: World, playback: MatchPlayback): void {
  const r = playback.record;
  const stats = w.npcSeason;
  if (r.model === undefined || !stats || stats.year !== r.year || stats.model !== r.model) return;
  const full = r as FullMatchRecord;
  let competition = npcCompetition(stats, r);
  if (!competition) {
    competition = { kind: r.kind, groupKey: r.groupKey, clubs: [], players: [] };
    stats.competitions.push(competition);
  }
  const ix = indexFor(competition);
  const people = new Map<string, Player>();
  for (const squad of playback.squads) for (const p of squad) people.set(p.id, p);
  let line = 0;
  for (const side of [0, 1] as const) {
    const club = side === 0 ? r.home : r.away;
    let row = ix.clubs.get(club);
    if (!row) {
      row = { club, matches: 0, metrics: zeroMetrics(), detail: emptyTeamDetail(), xg: 0, xga: 0 };
      competition.clubs.push(row);
      ix.clubs.set(club, row);
    }
    row.matches++;
    add(row.metrics, full.metrics[side]);
    add(row.detail, full.detail[side]);
    row.xg += Math.round(full.xg[side] * 100);
    row.xga += Math.round(full.xg[side === 0 ? 1 : 0] * 100);
    for (const end = line + full.lineCounts[side]; line < end; line++) {
      const l = full.players[line]!;
      // An appearance is a line with minutes; a substitute who never came on has none.
      if (!(l.metrics[M.minutes]! > 0)) continue;
      const person = people.get(l.id);
      if (!person) throw new Error(`경기 기록의 선수가 경기 명단에 없습니다: ${l.id}`);
      let player = ix.players.get(l.id);
      if (!player) {
        player = { id: l.id, name: person.name, position: person.position, clubs: [] };
        competition.players.push(player);
        ix.players.set(l.id, player);
      }
      let part = player.clubs.find((c) => c.club === club);
      if (!part) {
        part = { club, appearances: 0, metrics: zeroMetrics(), detail: emptyPlayerDetail() };
        player.clubs.push(part);
      }
      part.appearances++;
      add(part.metrics, l.metrics);
      add(part.detail, l.detail);
    }
  }
}
