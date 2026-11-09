import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { useEffect, useState } from 'react';
import { PD, TD } from '../../../../../../packages/contracts/src/detail';
import {
  activeMatchModel,
  type FullStatsRead,
  type FullStatsScope,
} from '../../../../../../packages/contracts/src/match-model';
import type { Metrics, Position, World } from '../../../../../../packages/contracts/src/types';
import { seasonDayLabel } from '../../../../../../packages/engine/src/calendar';
import { playerTotals } from '../../../../../../packages/engine/src/npc-stats';
import type { GameClient } from '../../../runtime/client';
import { per90 as per90Text, type PlayerAdvanced } from '../../match/@x/league';
import { decimal, number, seasonName } from '../../../presentation/format';
import { ownLeague, type LeagueChoice } from './league';
import { performanceRows } from '../../player/@x/league';

/**
 * Shared presentation of the season's complete statistics (→WEB-89, HIST-6, HIST-17): coverage,
 * club and player rows, leaders and comparison values for the league lens and the player
 * comparison, in the units and denominators own-club views use (Metrics, TD/PD, per-90 over actual
 * minutes, appearances as starts plus substitute appearances). Every counter of a full-model match
 * is an ordinary recorded fact, whichever engine settled it. Pure reads: nothing here changes a
 * read or the world.
 */

/** Metric slots (→MATCH-3), as the record and `Player.season` hold them. */
const GOALS = 0,
  ASSISTS = 1,
  PASSES = 2,
  COMPLETED = 3,
  SHOTS = 4,
  ON_TARGET = 5,
  TACKLES = 6,
  INTERCEPTIONS = 7,
  SAVES = 9,
  MINUTES = 10;

/** The league a lens shows as a read scope: ours or any chosen one. */
export function leagueStatsScope(w: World, league?: LeagueChoice): FullStatsScope {
  const chosen = league ?? ownLeague(w);
  return { kind: 'league', groupKey: `${chosen.code}:${chosen.tier}:${chosen.group}` };
}

/** Settled matches a read counts: each adds one match to both of its clubs. */
const trackedMatches = (read: FullStatsRead) =>
  read.competition.clubs.reduce((n, club) => n + club.matches, 0) / 2;

export type FullStatsCoverage =
  | { status: 'unavailable'; text: string }
  | { status: 'whole' | 'partial'; text: string; matches: number; untracked: number };
/**
 * How much of the season a read covers (→HIST-17, WEB-89): unavailable without a ledger for the
 * season in progress, whole when no fixture of the competition settled before counting started,
 * else partial from the boundary's day with the sample counted and the earlier matches left out —
 * never a full season, never zeros. The day tells the boundary apart even after the final round.
 */
export function fullStatsCoverage(
  read: FullStatsRead | undefined,
  year: number,
): FullStatsCoverage {
  if (!read || read.year !== year)
    return {
      status: 'unavailable',
      text: sourceMessage('copy.fullStatsView.bacdff45b0'),
    };
  const matches = trackedMatches(read),
    untracked = read.untracked;
  if (!untracked)
    return {
      status: 'whole',
      text: sourceMessage('copy.fullStatsView.6c28580244', {
        p0: seasonName(read.year),
        p1: number(matches),
      }),
      matches,
      untracked,
    };
  return {
    status: 'partial',
    text: sourceMessage('copy.fullStatsView.cca4f99bee', {
      p0: seasonDayLabel(read.year, read.trackedFrom.day),
      p1: number(matches),
      p2: number(untracked),
    }),
    matches,
    untracked,
  };
}

/** One participant of the read competition, his clubs' contributions summed (→HIST-13). */
export interface FullStatsPlayer {
  id: string;
  name: string;
  position: Position;
  /** Every club he played for in it, in recorded order; the last is the latest. */
  clubs: string[];
  /** One of our players, past or present: his name opens our player sheet (→WEB-59). */
  ours: boolean;
  appearances: number;
  starts: number;
  minutes: number;
  metrics: Metrics;
  detail: Metrics;
}
export function fullStatsPlayers(
  read: FullStatsRead,
  w: Pick<World, 'players'>,
): FullStatsPlayer[] {
  const ours = new Set(w.players.map((p) => p.id));
  return read.competition.players.map((player) => {
    const total = playerTotals(player);
    return {
      id: player.id,
      name: player.name,
      position: player.position,
      clubs: player.clubs.map((part) => part.club),
      ours: ours.has(player.id),
      appearances: total.appearances,
      starts: total.starts,
      minutes: total.metrics[MINUTES]!,
      metrics: total.metrics,
      detail: total.detail,
    };
  });
}
/** "12경기", or "12경기 · 교체 3", as own players' appearances read (→HIST-13). */
export function fullStatsAppearances(row: Pick<FullStatsPlayer, 'appearances' | 'starts'>) {
  const apps = row.appearances,
    sub = apps - row.starts;
  return sourceMessage('copy.managerHistoryView.8afd61210f', {
    p0: number(apps),
    p1: sub ? sourceMessage('copy.playerAnalysis.513b0ff3fd', { p0: number(sub) }) : '',
  });
}
/**
 * A participant's per-90 rates as comparisons print them: own players' production rows
 * (`performanceRows`), then xG, xA and key passes, each over his actual minutes (→MATCH-4).
 */
export function fullStatsRates(row: FullStatsPlayer): { label: string; text: string }[] {
  const advanced = [
    ['xG', PD.xg, 100],
    ['xA', PD.xa, 100],
    [sourceMessage('copy.MatchReport.532ac6f371'), PD.keyPasses, 1],
  ] as const;
  return [
    ...performanceRows(row.metrics).map(({ label, per90 }) => ({
      label,
      text: per90 === undefined ? '—' : decimal(per90, 2),
    })),
    ...advanced.map(([label, index, scale]) => ({
      label,
      text: per90Text(row.detail[index]! / scale, row.minutes),
    })),
  ];
}
/**
 * A participant's advanced production in `PlayerAdvancedStats`' shape: a full-model match carries
 * every counter on either engine, the spatial ones included, so all his matches count for all.
 */
export const fullStatsAdvanced = (row: FullStatsPlayer): PlayerAdvanced => ({
  matches: row.appearances,
  minutes: row.minutes,
  totals: row.detail,
  spatialMatches: row.appearances,
  spatialMinutes: row.minutes,
});

/** One club of the competition; a club with no tracked match yet is a real zero. */
export interface FullStatsClub {
  club: string;
  matches: number;
  goals: number;
  /** Expected goals for and against, in hundredths as the ledger keeps them. */
  xg: number;
  xga: number;
  shots: number;
  onTarget: number;
  passes: number;
  completed: number;
  bigChances: number;
}
/** The clubs `ids` names, ledger rows first-come, each with its totals or a tracked zero. */
export function fullStatsClubs(read: FullStatsRead, ids: readonly string[]): FullStatsClub[] {
  const rows = new Map(read.competition.clubs.map((row) => [row.club, row]));
  const members = [...new Set([...ids, ...rows.keys()])];
  return members.map((club) => {
    const row = rows.get(club);
    const m = row?.metrics,
      d = row?.detail;
    return {
      club,
      matches: row?.matches ?? 0,
      goals: m?.[GOALS] ?? 0,
      xg: row?.xg ?? 0,
      xga: row?.xga ?? 0,
      shots: m?.[SHOTS] ?? 0,
      onTarget: m?.[ON_TARGET] ?? 0,
      passes: m?.[PASSES] ?? 0,
      completed: m?.[COMPLETED] ?? 0,
      bigChances: d?.[TD.bigChances] ?? 0,
    };
  });
}
/** A per-match figure with its match denominator respected; no match means no figure. */
export const perMatch = (value: number, matches: number, digits = 2) =>
  matches > 0 ? decimal(value / matches, digits) : '—';

export type ClubOrder = 'xgd' | 'goals' | 'shots';
export const CLUB_ORDERS: readonly (readonly [ClubOrder, string])[] = [
  ['xgd', sourceMessage('copy.fullStatsView.abc2d9a4a3')],
  ['goals', sourceMessage('copy.summary.eb4e291be3')],
  ['shots', sourceMessage('copy.summary.da1cc31972')],
];
const clubValue: Record<ClubOrder, (row: FullStatsClub) => number> = {
  xgd: (row) => (row.matches ? (row.xg - row.xga) / row.matches : -Infinity),
  goals: (row) => row.goals,
  shots: (row) => row.shots,
};
export function orderClubs(rows: readonly FullStatsClub[], order: ClubOrder) {
  const value = clubValue[order];
  return [...rows].sort((a, b) => value(b) - value(a) || a.club.localeCompare(b.club));
}

export type LeaderKey = 'goals' | 'assists' | 'xg' | 'xa' | 'key-pass' | 'defence' | 'saves';
/** Leader tables over the read competition: label, glossary entry and the recorded total. */
export const LEADERS: readonly {
  key: LeaderKey;
  label: string;
  term?: string;
  value: (row: FullStatsPlayer) => number;
  /** xG and xA are kept in hundredths and shown with two decimals. */
  scale?: 100;
}[] = [
  {
    key: 'goals',
    label: sourceMessage('copy.summary.68a6cf8ed8'),
    value: (row) => row.metrics[GOALS]!,
  },
  {
    key: 'assists',
    label: sourceMessage('copy.BallonDorView.8d901cc28d'),
    value: (row) => row.metrics[ASSISTS]!,
  },
  { key: 'xg', label: 'xG', term: 'xg', value: (row) => row.detail[PD.xg]!, scale: 100 },
  { key: 'xa', label: 'xA', term: 'xa', value: (row) => row.detail[PD.xa]!, scale: 100 },
  {
    key: 'key-pass',
    label: sourceMessage('copy.MatchReport.532ac6f371'),
    term: 'key-pass',
    value: (row) => row.detail[PD.keyPasses]!,
  },
  {
    key: 'defence',
    label: sourceMessage('copy.fullStatsView.3cef0459ef'),
    value: (row) => row.metrics[TACKLES]! + row.metrics[INTERCEPTIONS]!,
  },
  {
    key: 'saves',
    label: sourceMessage('copy.RecordsRoom.2a022bd612'),
    value: (row) => row.metrics[SAVES]!,
  },
];
export interface LeaderRow {
  player: FullStatsPlayer;
  total: string;
  rate: string;
  /** The minutes the rate divides, shown beside it on every width (→HIST-6). */
  sample: string;
}
/**
 * The leaders of one counter: recorded totals above zero, most first; equal totals go to fewer
 * minutes, then the ID. A rate is per 90 actual minutes, as own players' rates are, and travels
 * with its sample.
 */
export function leaders(rows: readonly FullStatsPlayer[], key: LeaderKey, limit = 10): LeaderRow[] {
  const leader = LEADERS.find((entry) => entry.key === key)!;
  const scale = leader.scale ?? 1,
    digits = scale === 100 ? 2 : 0;
  return rows
    .filter((row) => leader.value(row) > 0)
    .sort(
      (a, b) =>
        leader.value(b) - leader.value(a) || a.minutes - b.minutes || a.id.localeCompare(b.id),
    )
    .slice(0, limit)
    .map((player) => ({
      player,
      total: decimal(leader.value(player) / scale, digits),
      rate: per90Text(leader.value(player) / scale, player.minutes),
      sample: sourceMessage('copy.LabPage.be847e9e64', { p0: number(player.minutes) }),
    }));
}

/**
 * Where a lens stands with its read: off for the pre-feature model, which tracks nothing new;
 * failed when the worker could not answer, which is no statement about tracking and can be retried.
 */
export type FullStatsState =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'failed'; retry: () => void }
  | { status: 'ready'; read: FullStatsRead | undefined };
/** What a lens says when the read itself failed, beside its retry button. */
export const FULL_STATS_FAILED = sourceMessage('copy.fullStatsView.543d84eb22');
/**
 * One competition's complete statistics, requested when a lens opens and again once they can have
 * changed (→WEB-89): the daily view never carries them. A league's settle only on a league match
 * day, when the round moves on, so a league lens reads once a round rather than every shown day;
 * each read first shows the days computed ahead (→WEB-18). A world without a match model asks for
 * nothing; the previous read stays on screen until the next one lands unless keepPrevious is false.
 */
export function useFullStats(
  client: Pick<GameClient, 'fullStats'>,
  w: Pick<World, 'id' | 'year' | 'round' | 'revision' | 'matchModel'>,
  scope: FullStatsScope | undefined,
  { keepPrevious = true }: { keepPrevious?: boolean } = {},
): FullStatsState {
  const on = activeMatchModel(w) !== undefined && scope !== undefined;
  const [attempt, setAttempt] = useState(0);
  const settled = scope?.kind === 'league' ? w.round : w.revision;
  const name = on ? `${w.id}:${w.year}:${scope.kind}:${scope.groupKey}` : undefined,
    key = name && `${name}:${settled}:${attempt}`;
  const [held, setHeld] = useState<
    | { name: string; key: string; read: FullStatsRead | undefined }
    | { name: string; failed: string }
  >();
  useEffect(() => {
    if (!on || !scope || !name || !key) return;
    let valid = true;
    client.fullStats(scope).then(
      (read) => {
        if (!valid) return;
        if (
          !keepPrevious &&
          read &&
          (read.year !== w.year ||
            read.competition.kind !== scope.kind ||
            read.competition.groupKey !== scope.groupKey)
        ) {
          setHeld({ name, failed: key });
          return;
        }
        setHeld({ name, key, read });
      },
      () => valid && setHeld({ name, failed: key }),
    );
    return () => {
      valid = false;
    };
    // The name and key spell out the scope, so they are all the effect needs to follow.
  }, [client, name, key, keepPrevious]);
  if (!on) return { status: 'off' };
  if (!held || held.name !== name) return { status: 'loading' };
  if (!('failed' in held))
    return !keepPrevious && held.key !== key
      ? { status: 'loading' }
      : { status: 'ready', read: held.read };
  // A retry or a later world asks again; until it answers the lens is loading, not failed.
  return held.failed === key
    ? { status: 'failed', retry: () => setAttempt((n) => n + 1) }
    : { status: 'loading' };
}
