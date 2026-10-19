import { useEffect, useState } from 'react';
import type {
  Event,
  MatchRecord,
  SeasonArchive,
  StandingSnapshot,
  World,
} from '../../../../packages/contracts/src/types';
import { country } from '../../../../packages/catalogs/src/index';
import { compareIds } from '../../../../packages/engine/src/primitives';
import { clubOf } from '../../../../packages/engine/src/world';
import type { GameClient } from '../runtime/client';

/** What a closed season's tabs read from the worker: the full archive and our own matches. */
export interface SeasonFiles {
  /** The archive with the standings and scorers the per-tick view leaves out. */
  season?: SeasonArchive;
  matches: MatchRecord[];
  events: Event[];
}

/**
 * The last seasons read, by their archive entry in the view: a season replayed after an import
 * is a new entry, so it is read again. A few seasons cover stepping back and forth in the list.
 */
const recent = new Map<SeasonArchive, SeasonFiles>();
function remember(season: SeasonArchive, files: SeasonFiles) {
  recent.delete(season);
  recent.set(season, files);
  if (recent.size > 6) recent.delete(recent.keys().next().value!);
}

/**
 * A closed season's archive, read once and shared by its tabs: the files once read, `failed` when
 * the read failed (reopening the season reads again), undefined while it loads.
 */
export function useSeasonFiles(
  client: GameClient,
  season: SeasonArchive | undefined,
): { files?: SeasonFiles; failed?: boolean } | undefined {
  const [read, setRead] = useState<{ season: SeasonArchive; files?: SeasonFiles }>();
  useEffect(() => {
    if (!season || recent.has(season)) return;
    let valid = true;
    client.archive(season.year).then(
      (data) => {
        const files = data && { season: data.season, matches: data.matches, events: data.events };
        if (files) remember(season, files);
        if (valid) setRead({ season, files });
      },
      () => valid && setRead({ season }),
    );
    return () => {
      valid = false;
    };
  }, [client, season]);
  if (!season) return undefined;
  const files = recent.get(season) ?? (read?.season === season ? read.files : undefined);
  return files ? { files } : read?.season === season ? { failed: true } : undefined;
}

/** A row of a closed league's final table: club index, points, goals for, goals against. */
export type FinalRow = [number, number, number, number];

/** A season's standings snapshots of our league after each played round, by round. */
export function seasonSnapshots(w: World, season: SeasonArchive): StandingSnapshot[] {
  return (w.rankHistory || [])
    .filter(
      (s) =>
        s.year === season.year &&
        s.round > 0 &&
        s.tier === season.tier &&
        s.group === season.group &&
        s.rows.some(([index]) => w.clubs[index]?.id === w.playerClub),
    )
    .sort((a, b) => a.round - b.round);
}

/**
 * Our league's final table of a closed season: its last standings snapshot (kept for ten seasons,
 * and the only record of an amateur league, whose clubs the archived standings leave out), else
 * the archived standings of the professional division it was played in.
 */
export function finalRows(
  w: World,
  season: SeasonArchive,
  standings?: number[][],
): FinalRow[] | undefined {
  const last = seasonSnapshots(w, season).at(-1);
  if (last) return last.rows.map(([club, points, gf, ga]) => [club, points, gf, ga]);
  return leagueRows(w, standings, {
    code: clubOf(w).country,
    tier: season.tier,
    group: season.group,
  });
}
/**
 * Any professional league's final table from a closed season's archived standings (→WEB-65):
 * points, then goal difference, then goals. Amateur leagues kept none.
 */
export function leagueRows(
  w: World,
  standings: number[][] | undefined,
  league: { code: string; tier: number; group: number },
): FinalRow[] | undefined {
  const id = (index: number) => w.clubs[index]?.id ?? '';
  if (!standings || league.tier >= country(league.code).groups.length) return undefined;
  const rows = standings
    .filter(
      (row) =>
        w.clubs[row[0]]?.country === league.code &&
        row[1] === league.tier &&
        row[2] === league.group,
    )
    .sort(
      (a, b) =>
        b[3] - a[3] || b[4] - b[5] - (a[4] - a[5]) || b[4] - a[4] || compareIds(id(a[0]), id(b[0])),
    )
    .map((row): FinalRow => [row[0], row[3], row[4], row[5]]);
  return rows.length ? rows : undefined;
}
