import type { Club, MatchRecord, World } from '../../contracts/src/types';
import { activePlayers, clubOf, findClub, footballQuote, initialElo, quote } from './world';
import { playerValue } from './transfers';
import { facilityBuiltUnits } from './facilities';

/**
 * Club Elo after every settled result, every club and competition (→HIST-12), in the World
 * Football Elo form: K 20, home advantage 60 points, more weight for wider margins.
 */
export const ELO = { k: 20, home: 60 } as const;

export function eloOf(c: Club) {
  return c.elo ?? initialElo(c.strength);
}

export function settleElo(w: World, m: Pick<MatchRecord, 'home' | 'away' | 'score'>) {
  const home = findClub(w, m.home),
    away = findClub(w, m.away);
  const rh = eloOf(home),
    ra = eloOf(away);
  const expected = 1 / (1 + 10 ** ((ra - rh - ELO.home) / 400));
  const result = m.score.home > m.score.away ? 1 : m.score.home === m.score.away ? 0.5 : 0;
  const margin = Math.abs(m.score.home - m.score.away);
  const weight = margin <= 1 ? 1 : margin === 2 ? 1.5 : (11 + margin) / 8;
  const delta = ELO.k * weight * (result - expected);
  home.elo = Math.round((rh + delta) * 10) / 10;
  away.elo = Math.round((ra - delta) * 10) / 10;
}

/** The own club's place among every club of the world by Elo, 1 = best. */
export function eloRank(w: World) {
  const own = eloOf(clubOf(w));
  return w.clubs.filter((c) => c.id !== w.playerClub && eloOf(c) > own).length + 1;
}

/**
 * The Club Elo spread, rounded: lowest and highest of every club in the world, then of `league`,
 * the scale a season archive places the own rating on (→HIST-12).
 */
export function eloRange(w: World, league: readonly Club[]): [number, number, number, number] {
  const spread = (clubs: readonly Club[]) => {
    const elos = clubs.map(eloOf);
    return [Math.round(Math.min(...elos)), Math.round(Math.max(...elos))] as const;
  };
  return [...spread(w.clubs), ...spread(league)];
}

/** Market value of the squad: the fee clubs would consider fair for each player. */
export function squadValue(w: World) {
  return activePlayers(w)
    .reduce((sum, p) => sum + BigInt(playerValue(w, p)), 0n)
    .toString();
}

/**
 * Club valuation (→HIST-12): squad value + half of what the facility parts cost to build + a brand
 * worth one unit per 20 supporters, raised by reputation + cash (debt counts against it).
 */
export function clubValuation(w: World) {
  const club = clubOf(w),
    code = club.country;
  const built = facilityBuiltUnits(w);
  // Facilities are built on the football index (→ECON-32), so their half is valued on it too.
  const squad = squadValue(w),
    facilities = footballQuote(code, w.year, 150 + built / 2),
    brand = quote(code, w.year, (club.fans / 20) * (1 + club.reputation / 100));
  const total = BigInt(squad) + BigInt(facilities) + BigInt(brand) + BigInt(w.cash);
  return { squad, facilities, brand, cash: w.cash, total: total.toString() };
}
