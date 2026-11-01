/**
 * The Ballon d'Or (→PLAYER-27): its rules and the reads of its archived podiums (→HIST-13). A read
 * leaf (→ARCH-4): types only, so the screens may read a player's honours and the contract premium
 * without the season's orchestration. The award itself is decided at the close (ballon-dor-award).
 */
import type { BallonDorHonour, SeasonArchive } from '../../contracts/src/types';

export const BALLON_DOR_CONFIG = {
  /** The season whose close awards the first Ballon d'Or: 1955/56, as France Football's 1956. */
  first: 1955,
  /** Points per goal and per assist over every competition of the season. */
  goals: 4,
  assists: 3,
  /** Class: (OVR at the close − `classFrom`) × `classWeight`, only above `classFrom`. */
  classFrom: 70,
  classWeight: 2,
  /** Team honours, each only when he played for the winning club in that competition. */
  honours: {
    europe: 40,
    'europe-final': 15,
    continental: 15,
    league: 25,
    cup: 10,
  } satisfies Record<BallonDorHonour, number>,
  /** Top-flight league appearances a candidate needs that season. */
  appearances: 15,
  places: 3,
  /** Closed seasons a podium place keeps raising his demand (→CLUB-26). */
  premiumSeasons: 3,
  premium: { winner: 1.2, podium: 1.1 },
  /**
   * The bonus clause (→CLUB-29): for players rated `ability`+ or with a podium place within
   * `premiumSeasons`; in `share` of their contracts (1-rated agent → 5-rated), sized from
   * `from` (1-rated) to `to` (5-rated) percent of the yearly wage.
   */
  clause: {
    ability: 80,
    share: [0.4, 0.9] as [number, number],
    from: [25, 50] as [number, number],
    to: [50, 100] as [number, number],
  },
};

/** How the media name each honour beside a podium place. */
export const BALLON_DOR_HONOUR_LABEL: Record<BallonDorHonour, string> = {
  europe: '유럽 정상',
  'europe-final': '유럽 준우승',
  continental: '대륙 대회 우승',
  league: '리그 우승',
  cup: '컵 우승',
};

/** A player's places on archived podiums, oldest first: place 1 is a win. */
export interface BallonDorRecord {
  wins: number[];
  podiums: { year: number; place: 2 | 3 }[];
}

type Podiums = readonly Pick<SeasonArchive, 'year' | 'ballonDor'>[];

/** Every archived place of one player by his stable identity (→HIST-13), derived on read. */
export function ballonDorRecord(history: Podiums, id: string): BallonDorRecord {
  const record: BallonDorRecord = { wins: [], podiums: [] };
  for (const season of [...history].sort((a, b) => a.year - b.year)) {
    const at = season.ballonDor?.findIndex((place) => place.id === id) ?? -1;
    if (at === 0) record.wins.push(season.year);
    else if (at > 0) record.podiums.push({ year: season.year, place: (at + 1) as 2 | 3 });
  }
  return record;
}

/**
 * The demand multiplier a podium place within the last `premiumSeasons` closed seasons before
 * `year` brings (→CLUB-26): a win ×1.20, a second or third place ×1.10, the larger applying, with
 * the place and season it comes from; otherwise ×1.
 */
export function ballonDorPremium(
  history: Podiums,
  year: number,
  id: string,
): { factor: number; place?: 1 | 2 | 3; year?: number } {
  const { premiumSeasons, premium } = BALLON_DOR_CONFIG;
  let best: { factor: number; place?: 1 | 2 | 3; year?: number } = { factor: 1 };
  for (const season of history) {
    if (season.year < year - premiumSeasons || season.year >= year) continue;
    const at = season.ballonDor?.findIndex((place) => place.id === id) ?? -1;
    if (at < 0) continue;
    const factor = at === 0 ? premium.winner : premium.podium;
    if (factor > best.factor || (factor === best.factor && season.year > (best.year ?? 0)))
      best = { factor, place: (at + 1) as 1 | 2 | 3, year: season.year };
  }
  return best;
}
