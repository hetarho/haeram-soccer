/**
 * What the start shows of each season the world's generation reaches (→WEB-115, WORLD-13): the
 * season, the Club Elo world top 10, the league champions, the European winners, the 발롱도르 and
 * the season's greatest feat. A read leaf (→ARCH-4): it reads the clubs' Elo and the season
 * archives only — no simulation, no new state, nothing saved — so only facts the seasons played
 * archived appear (→WORLD-8).
 */
import type {
  Club,
  DigestClub,
  GenerationDigest,
  GenerationFeat,
  GenerationFeatKind,
  SeasonArchive,
  World,
} from '../../contracts/src/types';
import { BALLON_DOR_CONFIG } from './ballon-dor';
import { eloOf } from './elo';

/** The feats of WEB-115, greatest first: a season with several shows the first. */
export const FEAT_ORDER: readonly GenerationFeatKind[] = [
  'war',
  'treble',
  'europe-three',
  'ballon-three',
  'europe-two',
  'europe-first',
  'league-run',
];
/** The European Cup lineage: European Cup, Champions League from 1992 (→EURO-1/9). */
const LINEAGE = 'ucl';
/** The background's continental order; the Super Cup is a summarised tie, not a competition run. */
const EUROPE_ORDER = ['ucl', 'cwc', 'uel', 'uecl'];
/** Clubs on the Elo list (→HIST-12). */
const ELO_TOP = 10;
/** A league run is carded at its fifth title, then only when it becomes its country's longest. */
const LEAGUE_RUN = 5;

type DigestWorld = Pick<World, 'year' | 'clubs' | 'history'>;

/**
 * The digest of the season just closed, once `w` stands on the next season's first day; nothing
 * before the first close.
 */
export function seasonDigest(w: DigestWorld): GenerationDigest | undefined {
  const archives = w.history,
    last = archives.at(-1);
  if (!last) return undefined;
  const clubs = new Map(w.clubs.map((club) => [club.id, club]));
  const named = (id: string): DigestClub => {
    const club = clubs.get(id);
    return { id, name: club?.name ?? id, country: club?.country ?? '' };
  };
  const winner = last.year >= BALLON_DOR_CONFIG.first ? last.ballonDor?.[0] : undefined;
  const feat = greatestFeat(w.year, archives, named);
  return {
    season: w.year,
    closed: last.year,
    elo: eloTop(w.clubs),
    champions: last.champions.map(({ country, club }) => ({ country, club: named(club) })),
    europe: last.europe
      .filter((entry) => EUROPE_ORDER.includes(entry.kind))
      .sort((a, b) => EUROPE_ORDER.indexOf(a.kind) - EUROPE_ORDER.indexOf(b.kind))
      .map(({ kind, name, winner }) => ({ kind, name, club: named(winner) })),
    ...(winner ? { ballonDor: { name: winner.name, club: named(winner.club) } } : {}),
    ...(feat ? { feat } : {}),
  };
}

/** The world's best clubs by Club Elo, best first; equal ratings keep the world's club order. */
function eloTop(clubs: Club[]) {
  return clubs
    .map((club, index) => ({ club, index, elo: Math.round(eloOf(club)) }))
    .sort((a, b) => b.elo - a.elo || a.index - b.index)
    .slice(0, ELO_TOP)
    .map(({ club, elo }) => ({ id: club.id, name: club.name, country: club.country, elo }));
}

/** The archives' last `get` value and how many consecutive archives, ending with the last, hold it. */
function runAtEnd(archives: SeasonArchive[], get: (a: SeasonArchive) => string | undefined) {
  const value = get(archives.at(-1)!);
  let count = 0;
  if (value !== undefined)
    while (count < archives.length && get(archives[archives.length - 1 - count]!) === value)
      count++;
  return { value, count };
}

/** The longest run of one value among `archives`, consecutive archives counting as consecutive. */
function longestRun(archives: SeasonArchive[], get: (a: SeasonArchive) => string | undefined) {
  let best = 0,
    count = 0,
    previous: string | undefined;
  for (const archive of archives) {
    const value = get(archive);
    count = value !== undefined && value === previous ? count + 1 : value === undefined ? 0 : 1;
    previous = value;
    best = Math.max(best, count);
  }
  return best;
}

/**
 * The season's greatest feat in FEAT_ORDER (→WEB-115). Consecutive means consecutive archives, so
 * the war's gap breaks no run; within one kind the first association in WORLD-1's order (the
 * archive's champion order) wins.
 */
function greatestFeat(
  season: number,
  archives: SeasonArchive[],
  named: (id: string) => DigestClub,
): GenerationFeat | undefined {
  const last = archives.at(-1)!,
    earlier = archives.slice(0, -1),
    found: GenerationFeat[] = [];
  // The 1946 restart is the first season reached after the 1938/39 close (→WORLD-14).
  if (season > last.year + 1) found.push({ kind: 'war' });
  const lineageOf = (a: SeasonArchive) => a.europe.find((entry) => entry.kind === LINEAGE)?.winner;
  const lineage = last.europe.find((entry) => entry.kind === LINEAGE);
  if (lineage) {
    const club = named(lineage.winner),
      competition = lineage.name,
      { count } = runAtEnd(archives, lineageOf);
    const treble = last.champions.find(
      (entry) => entry.club === lineage.winner && entry.cup === lineage.winner,
    );
    if (treble) found.push({ kind: 'treble', club, competition });
    if (count >= 3) found.push({ kind: 'europe-three', club, competition, count });
    else if (count === 2) found.push({ kind: 'europe-two', club, competition, count });
    if (!earlier.some((a) => lineageOf(a) === lineage.winner))
      found.push({ kind: 'europe-first', club, competition });
  }
  const ballonOf = (a: SeasonArchive) =>
    a.year >= BALLON_DOR_CONFIG.first ? a.ballonDor?.[0]?.id : undefined;
  const ballon = runAtEnd(archives, ballonOf);
  if (ballon.count >= 3) {
    const winner = last.ballonDor![0]!;
    found.push({
      kind: 'ballon-three',
      player: winner.name,
      club: named(winner.club),
      count: ballon.count,
    });
  }
  for (const { country, club } of last.champions) {
    const championOf = (a: SeasonArchive) =>
      a.champions.find((entry) => entry.country === country)?.club;
    const { count } = runAtEnd(archives, championOf);
    if (count < LEAGUE_RUN) continue;
    const record = longestRun(archives.slice(0, archives.length - count), championOf);
    if (count === LEAGUE_RUN || count === record + 1)
      found.push({ kind: 'league-run', club: named(club), count });
  }
  return found.sort((a, b) => FEAT_ORDER.indexOf(a.kind) - FEAT_ORDER.indexOf(b.kind))[0];
}
