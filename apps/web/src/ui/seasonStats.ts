import type { MatchRecord, World } from '../../../../packages/contracts/src/types';
import { PD, PLAYER_DETAIL_SIZE, TD } from '../../../../packages/contracts/src/detail';

/** League fixtures decide the table, so the review measures the season on them. */
const LEAGUE = new Set(['league', 'lower']);

function poisson(lambda: number, goals: number) {
  let p = Math.exp(-lambda);
  for (let k = 1; k <= goals; k++) p *= lambda / k;
  return p;
}
/**
 * Expected points from both sides' total xG: each side's goals as an independent Poisson count,
 * three points for a win and one for a draw (the common xPTS method; grid truncated at 10).
 */
export function expectedPoints(own: number, other: number) {
  let win = 0,
    draw = 0;
  for (let a = 0; a <= 10; a++) {
    const pa = poisson(own, a);
    for (let b = 0; b <= 10; b++) {
      const p = pa * poisson(other, b);
      if (a > b) win += p;
      else if (a === b) draw += p;
    }
  }
  return 3 * win + draw;
}

interface Split {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
}
const emptySplit = (): Split => ({ played: 0, won: 0, drawn: 0, lost: 0, points: 0 });
export interface Leader {
  id: string;
  name: string;
  value: number;
}
export interface SeasonStats {
  played: number;
  points: number;
  ppg: number;
  gf: number;
  ga: number;
  /** Matches that recorded xG; older rules did not. */
  xgMatches: number;
  xg?: number;
  xga?: number;
  xpts?: number;
  shots: number;
  shotsAgainst: number;
  onTarget: number;
  onTargetAgainst: number;
  saves: number;
  cleanSheets: number;
  possession: number;
  passAccuracy?: number;
  passesPerGame: number;
  /** Tackles and interceptions per match. */
  defensiveActions: number;
  /** Opponent passes per own tackle or interception, over the whole pitch. */
  ppda?: number;
  /** Matches that recorded advanced counters (rules 1.6.0); the figures below cover them only. */
  detailMatches: number;
  /** Opponent build-up passes per own press action (MATCH-13), when every match has detail. */
  pressPpda?: number;
  bigChances: number;
  bigChancesScored: number;
  keyPasses: number;
  finalThirdPasses: number;
  finalThirdCompleted: number;
  /** Own share of both sides' final-third passes. */
  fieldTilt?: number;
  highTurnovers: number;
  home: Split;
  away: Split;
  longestUnbeaten: number;
  longestWinning: number;
  biggestWin?: { score: string; opponent: string };
  heaviestDefeat?: { score: string; opponent: string };
  /** Cumulative points and expected points after each league match, in calendar order. */
  progression: { points: number; xpts?: number }[];
  leaders: {
    goals: Leader[];
    assists: Leader[];
    minutes: Leader[];
    defending: Leader[];
    saves: Leader[];
    xa: Leader[];
    keyPasses: Leader[];
  };
}

const ratio = (part: number, whole: number) => (whole ? part / whole : undefined);

/** A closed season's league matches as football-analytics numbers, from recorded facts only. */
export function seasonStats(
  w: Pick<World, 'playerClub' | 'clubs' | 'players'>,
  matches: readonly MatchRecord[],
): SeasonStats {
  const league = matches
    .filter((m) => LEAGUE.has(m.kind))
    .sort((a, b) => a.round - b.round || (a.id < b.id ? -1 : 1));
  const name = (id: string) => w.clubs.find((c) => c.id === id)?.name || id;
  const stats: SeasonStats = {
    played: league.length,
    points: 0,
    ppg: 0,
    gf: 0,
    ga: 0,
    xgMatches: 0,
    shots: 0,
    shotsAgainst: 0,
    onTarget: 0,
    onTargetAgainst: 0,
    saves: 0,
    cleanSheets: 0,
    possession: 0,
    passesPerGame: 0,
    defensiveActions: 0,
    home: emptySplit(),
    away: emptySplit(),
    longestUnbeaten: 0,
    longestWinning: 0,
    progression: [],
    detailMatches: 0,
    bigChances: 0,
    bigChancesScored: 0,
    keyPasses: 0,
    finalThirdPasses: 0,
    finalThirdCompleted: 0,
    highTurnovers: 0,
    leaders: {
      goals: [],
      assists: [],
      minutes: [],
      defending: [],
      saves: [],
      xa: [],
      keyPasses: [],
    },
  };
  let opponentBuildUp = 0,
    pressActions = 0,
    opponentFinalThird = 0;
  const detailTotals = new Map<string, number[]>();
  let xg = 0,
    xga = 0,
    xpts = 0,
    possession = 0,
    passes = 0,
    completed = 0,
    opponentPasses = 0,
    defending = 0,
    unbeaten = 0,
    winning = 0,
    bestMargin = 0,
    worstMargin = 0;
  const totals = new Map<string, number[]>();
  for (const m of league) {
    const side = m.home === w.playerClub ? 0 : 1,
      other = side === 0 ? 1 : 0;
    const own = m.metrics[side],
      opp = m.metrics[other];
    const goals = side === 0 ? m.score.home : m.score.away,
      against = side === 0 ? m.score.away : m.score.home;
    const result = goals > against ? 3 : goals === against ? 1 : 0;
    const split = side === 0 ? stats.home : stats.away;
    split.played++;
    split.points += result;
    if (result === 3) split.won++;
    else if (result === 1) split.drawn++;
    else split.lost++;
    stats.points += result;
    stats.gf += goals;
    stats.ga += against;
    stats.shots += own[4];
    stats.shotsAgainst += opp[4];
    stats.onTarget += own[5];
    stats.onTargetAgainst += opp[5];
    stats.saves += own[9];
    if (!against) stats.cleanSheets++;
    possession += (own[11] / Math.max(1, own[11] + opp[11])) * 100;
    passes += own[2];
    completed += own[3];
    opponentPasses += opp[2];
    defending += own[6] + own[7];
    unbeaten = result ? unbeaten + 1 : 0;
    winning = result === 3 ? winning + 1 : 0;
    stats.longestUnbeaten = Math.max(stats.longestUnbeaten, unbeaten);
    stats.longestWinning = Math.max(stats.longestWinning, winning);
    const margin = goals - against,
      opponent = name(side === 0 ? m.away : m.home);
    if (margin > bestMargin) {
      bestMargin = margin;
      stats.biggestWin = { score: `${goals}–${against}`, opponent };
    }
    if (margin < worstMargin) {
      worstMargin = margin;
      stats.heaviestDefeat = { score: `${goals}–${against}`, opponent };
    }
    if (m.detail) {
      const t = m.detail[side],
        o = m.detail[other];
      stats.detailMatches++;
      stats.bigChances += t[TD.bigChances];
      stats.bigChancesScored += t[TD.bigChancesScored];
      stats.keyPasses += t[TD.keyPasses];
      stats.finalThirdPasses += t[TD.finalThirdPasses];
      stats.finalThirdCompleted += t[TD.finalThirdCompleted];
      stats.highTurnovers += t[TD.highTurnovers];
      opponentFinalThird += o[TD.finalThirdPasses];
      opponentBuildUp += o[TD.buildUpPasses];
      pressActions += t[TD.pressActions];
      for (const player of m.players) {
        if (!player.detail || !w.players.some((p) => p.id === player.id)) continue;
        const row = detailTotals.get(player.id) || Array<number>(PLAYER_DETAIL_SIZE).fill(0);
        player.detail.forEach((value, index) => (row[index] += value));
        detailTotals.set(player.id, row);
      }
    }
    if (m.xg) {
      stats.xgMatches++;
      xg += m.xg[side];
      xga += m.xg[other];
      xpts += expectedPoints(m.xg[side], m.xg[other]);
    }
    stats.progression.push({
      points: stats.points,
      xpts: stats.xgMatches === stats.progression.length + 1 ? xpts : undefined,
    });
    const squad = side === 0 ? m.players.slice(0, 11) : m.players.slice(11);
    for (const player of squad.length ? squad : m.players) {
      if (!w.players.some((p) => p.id === player.id)) continue;
      const row = totals.get(player.id) || Array<number>(12).fill(0);
      player.metrics.forEach((value, index) => (row[index] += value));
      totals.set(player.id, row);
    }
  }
  const played = stats.played;
  stats.ppg = played ? stats.points / played : 0;
  stats.possession = played ? possession / played : 0;
  stats.passAccuracy = ratio(completed, passes);
  stats.passesPerGame = played ? passes / played : 0;
  stats.defensiveActions = played ? defending / played : 0;
  stats.ppda = defending ? opponentPasses / defending : undefined;
  if (stats.detailMatches) {
    stats.fieldTilt = ratio(stats.finalThirdPasses, stats.finalThirdPasses + opponentFinalThird);
    if (stats.detailMatches === played && pressActions)
      stats.pressPpda = opponentBuildUp / pressActions;
  }
  if (stats.xgMatches) {
    stats.xg = xg;
    stats.xga = xga;
    stats.xpts = xpts;
  }
  const leaders = (value: (row: number[]) => number, minimum = 1): Leader[] =>
    [...totals.entries()]
      .map(([id, row]) => ({
        id,
        name: w.players.find((p) => p.id === id)?.name || id,
        value: value(row),
      }))
      .filter((leader) => leader.value >= minimum)
      .sort((a, b) => b.value - a.value || (a.id < b.id ? -1 : 1))
      .slice(0, 3);
  const detailLeaders = (value: (row: number[]) => number): Leader[] =>
    [...detailTotals.entries()]
      .map(([id, row]) => ({
        id,
        name: w.players.find((p) => p.id === id)?.name || id,
        value: value(row),
      }))
      .filter((leader) => leader.value > 0)
      .sort((a, b) => b.value - a.value || (a.id < b.id ? -1 : 1))
      .slice(0, 3);
  stats.leaders = {
    goals: leaders((row) => row[0]),
    assists: leaders((row) => row[1]),
    minutes: leaders((row) => row[10]),
    defending: leaders((row) => row[6] + row[7]),
    saves: leaders((row) => row[9]),
    xa: detailLeaders((row) => row[PD.xa] / 100),
    keyPasses: detailLeaders((row) => row[PD.keyPasses]),
  };
  return stats;
}

/** Share with one decimal, or a dash when the denominator is empty. */
export function share(part: number, whole: number) {
  return whole ? `${Math.round((part / whole) * 1000) / 10}%` : '—';
}
