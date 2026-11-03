/**
 * The bought club's past before its owner (→HIST-21, HIST-2): pure reads of the world's season
 * archive, which keeps every club's league row, each country's champions and cup finals and the
 * continental competitions' finals, brackets and group tables.
 */
import type { BracketArchive, CupRun, SeasonArchive, World } from '../../contracts/src/types';
import type { PreOwnerSeason } from '../../contracts/src/owner';
import { domesticCupName } from './competition-keys';
import { isOwnSeason } from './player-state';
import { compareIds } from './primitives';

/**
 * A club's place in its division of an archived season (→HIST-2): its row among the rows of its
 * country, division and group, by points, goal difference, goals and club ID — the order the
 * archive's tables are read in. Undefined without a row for it.
 */
export function archivedFinish(
  w: Pick<World, 'clubs'>,
  standings: readonly number[][],
  index: number,
) {
  const row = standings.find((entry) => entry[0] === index);
  if (!row) return undefined;
  const code = w.clubs[index]?.country;
  const division = standings
    .filter((entry) => w.clubs[entry[0]!]?.country === code && entry[1] === row[1])
    .filter((entry) => entry[2] === row[2])
    .sort(
      (a, b) =>
        b[3]! - a[3]! ||
        b[4]! - b[5]! - (a[4]! - a[5]!) ||
        b[4]! - a[4]! ||
        compareIds(w.clubs[a[0]!]?.id ?? '', w.clubs[b[0]!]?.id ?? ''),
    );
  return { tier: row[1]!, group: row[2]!, place: division.indexOf(row) + 1 };
}

/** The last round of a knockout bracket the club played a tie in. */
function bracketReached(bracket: BracketArchive | undefined, index: number) {
  let reached: string | undefined;
  for (const round of bracket?.rounds ?? [])
    if (round.ties.some((tie) => tie[0] === index || tie[1] === index)) reached = round.label;
  return reached;
}

/**
 * How far the club went in each competition of an archived season, as far as the archive shows:
 * the domestic cup only in its final (other countries' cups keep winner and final alone), each
 * continental competition by its final, its bracket's last round or its group tables (the Super
 * Cup, a final alone, by its final).
 */
function archivedRuns(season: SeasonArchive, id: string, index: number, code: string) {
  const runs: CupRun[] = [];
  const champion = season.champions.find((entry) => entry.country === code);
  if (champion && (champion.cup === id || champion.cupFinal?.runnerUp === id))
    runs.push({
      key: 'cup',
      name: domesticCupName(code),
      reached: '결승',
      ...(champion.cup === id ? { champion: true } : {}),
    });
  for (const entry of season.europe) {
    const inTable = (rows?: number[][]) => !!rows?.some((row) => row[0] === index);
    const reached =
      entry.winner === id || entry.final?.runnerUp === id
        ? '결승'
        : (bracketReached(
            season.brackets?.find((bracket) => bracket.key === entry.kind),
            index,
          ) ??
          (inTable(entry.secondStandings)
            ? '2차 조별 리그'
            : inTable(entry.standings)
              ? '조별 리그'
              : undefined));
    if (reached)
      runs.push({
        key: entry.kind,
        name: entry.name,
        reached,
        ...(entry.winner === id ? { champion: true } : {}),
      });
  }
  return runs;
}

/**
 * The seasons the bought club played before the takeover, oldest first (→HIST-21): its league
 * finish, its country's title and its cup runs from each season the world archived before the
 * owner. A founded career has none.
 */
export function seasonsBeforeOwner(
  w: Pick<World, 'clubs' | 'history' | 'playerClub' | 'owner'>,
): PreOwnerSeason[] {
  const id = w.owner?.takeover.clubId,
    index = w.clubs.findIndex((club) => club.id === id),
    code = w.clubs[index]?.country;
  if (!id || !code) return [];
  return w.history
    .filter((season) => !isOwnSeason(w, season))
    .map((season) => {
      const finish = archivedFinish(w, season.standings, index);
      const title = season.champions.some((entry) => entry.country === code && entry.club === id);
      return {
        year: season.year,
        ...(finish ? { finish } : {}),
        ...(title ? { title: true as const } : {}),
        runs: archivedRuns(season, id, index, code),
      };
    });
}

/** Honours before the owner: top-flight titles, domestic cups and continental titles. */
export function honoursBeforeOwner(seasons: readonly PreOwnerSeason[]) {
  let league = 0,
    cup = 0,
    europe = 0;
  for (const season of seasons) {
    if (season.title) league++;
    for (const run of season.runs)
      if (run.champion) {
        if (run.key === 'cup') cup++;
        else europe++;
      }
  }
  return { league, cup, europe };
}
