import type { Club, CupFinal, SeasonArchive } from '../../../../../../packages/contracts/src/types';
import { seasonAfter } from '../../../../../../packages/engine/src/season-years';
import { nationName } from './cupRoute';

/** One season's final of the competition, with the name it carried that season. */
export interface FinalRow {
  year: number;
  /** The continental competition's name that season; empty for the domestic cup. */
  name: string;
  winner: string;
  final?: CupFinal;
  /** Titles in a row the winner has reached with this one. */
  streak: number;
}
export interface ClubRecord {
  club: string;
  titles: number;
  runnerUps: number;
  finals: number;
  lastTitle?: number;
}
export interface NationRecord {
  code: string;
  name: string;
  titles: number;
  runnerUps: number;
  /** Different clubs of the nation that won it. */
  clubs: number;
}
/** A run of titles in consecutive seasons. */
export interface Streak {
  club: string;
  length: number;
  from: number;
  to: number;
}
export interface Feat {
  year: number;
  club: string;
}
export interface CupHonours {
  /** Latest first. */
  finals: FinalRow[];
  /** Most titles first, then runners-up, then the latest title. */
  clubs: ClubRecord[];
  /** Continental competitions only. */
  nations: NationRecord[];
  /** Every run of the longest title streak, when it is two seasons or more. */
  streaks: Streak[];
  /** Our country's league champions that also won the cup (the domestic cup only), latest first. */
  doubles: Feat[];
  /** League champions that also won their cup and the European Cup (that competition only). */
  trebles: Feat[];
  /** Finals the archive keeps no score for: their beaten finalist is unknown. */
  unrecorded: number;
}

type History = readonly Pick<SeasonArchive, 'year' | 'champions' | 'europe'>[];

/**
 * Honours of one competition from the season archive (→HIST-12): `cup` reads our country's cup
 * winners and finals, any other key that continental lineage, which keeps one key across names
 * (European Cup → Champions League, UEFA Cup → Europa League). Only recorded facts are counted:
 * a final without a score names no runner-up.
 */
export function cupHonours(
  history: History,
  clubs: readonly Pick<Club, 'id' | 'country'>[],
  country: string,
  key: string,
): CupHonours {
  const chronological: FinalRow[] = [],
    runs: Streak[] = [];
  for (const h of [...history].sort((a, b) => a.year - b.year)) {
    let row: Omit<FinalRow, 'streak'> | undefined;
    if (key === 'cup') {
      const entry = h.champions.find((ch) => ch.country === country);
      if (entry?.cup) row = { year: h.year, name: '', winner: entry.cup, final: entry.cupFinal };
    } else {
      const e = h.europe.find((entry) => entry.kind === key);
      if (e) row = { year: h.year, name: e.name, winner: e.winner, final: e.final };
    }
    if (!row) continue;
    const previous = chronological.at(-1);
    if (previous && previous.winner === row.winner && seasonAfter(previous.year) === row.year) {
      const run = runs.at(-1)!;
      run.length++;
      run.to = row.year;
    } else runs.push({ club: row.winner, length: 1, from: row.year, to: row.year });
    chronological.push({ ...row, streak: runs.at(-1)!.length });
  }

  const records = new Map<string, ClubRecord>();
  const record = (club: string) => {
    let entry = records.get(club);
    if (!entry) records.set(club, (entry = { club, titles: 0, runnerUps: 0, finals: 0 }));
    return entry;
  };
  for (const row of chronological) {
    const winner = record(row.winner);
    winner.titles++;
    winner.finals++;
    winner.lastTitle = row.year;
    if (row.final) {
      const beaten = record(row.final.runnerUp);
      beaten.runnerUps++;
      beaten.finals++;
    }
  }
  const byRecord = (a: ClubRecord, b: ClubRecord) =>
    b.titles - a.titles ||
    b.runnerUps - a.runnerUps ||
    (b.lastTitle ?? 0) - (a.lastTitle ?? 0) ||
    (a.club < b.club ? -1 : a.club > b.club ? 1 : 0);

  const nations = new Map<string, NationRecord>(),
    winners = new Map<string, Set<string>>();
  if (key !== 'cup') {
    const countryOf = new Map(clubs.map((club) => [club.id, club.country]));
    const nation = (club: string) => {
      const code = countryOf.get(club) ?? '';
      let entry = nations.get(code);
      if (!entry)
        nations.set(
          code,
          (entry = { code, name: nationName(code), titles: 0, runnerUps: 0, clubs: 0 }),
        );
      return entry;
    };
    for (const row of chronological) {
      const winner = nation(row.winner),
        names = winners.get(winner.code) || new Set();
      winner.titles++;
      winners.set(winner.code, names.add(row.winner));
      winner.clubs = names.size;
      if (row.final) nation(row.final.runnerUp).runnerUps++;
    }
  }

  const longest = Math.max(0, ...runs.map((run) => run.length));
  const latestFirst = [...history].sort((a, b) => b.year - a.year);
  return {
    finals: [...chronological].reverse(),
    clubs: [...records.values()].sort(byRecord),
    nations: [...nations.values()].sort(
      (a, b) =>
        b.titles - a.titles ||
        b.runnerUps - a.runnerUps ||
        b.clubs - a.clubs ||
        a.name.localeCompare(b.name),
    ),
    streaks: longest < 2 ? [] : runs.filter((run) => run.length === longest),
    doubles:
      key === 'cup'
        ? latestFirst.flatMap((h) => {
            const entry = h.champions.find((ch) => ch.country === country);
            return entry?.cup && entry.club === entry.cup
              ? [{ year: h.year, club: entry.club }]
              : [];
          })
        : [],
    trebles:
      key === 'ucl'
        ? latestFirst.flatMap((h) => {
            const winner = h.europe.find((e) => e.kind === 'ucl')?.winner;
            return winner && h.champions.some((ch) => ch.club === winner && ch.cup === winner)
              ? [{ year: h.year, club: winner }]
              : [];
          })
        : [],
    unrecorded: chronological.filter((row) => !row.final).length,
  };
}
