import type { TransferBid, World } from '../../contracts/src/types';
import { country } from '../../catalogs/src/index';
import { clubOf } from './world';
import { prepareSeason } from './season';
import { currentDay } from './calendar';
import { assessOperatingExpenses } from './finance';
import { playerValue, respondBid } from './transfers';

/**
 * Tests and benchmarks that exercise professional-league rules start the own club in the lowest
 * professional division instead of the amateur league: it swaps places with that division's first
 * club, which drops to the amateur level, and the season is drawn again.
 */
export function professionalStart(w: World) {
  const own = clubOf(w),
    last = country(own.country).groups.length - 1;
  if (!w.lower) return w;
  const slot = w.clubs.find(
    (c) => c.country === own.country && c.tier === last && c.group === 0 && !c.representative,
  )!;
  slot.tier = last + 1;
  slot.group = 0;
  slot.representative = true;
  own.tier = last;
  own.group = 0;
  w.lower = false;
  delete w.rankHistory;
  delete w.scorerSeason;
  prepareSeason(w);
  // The season starts again in this division, at its floor of operating expenses (→ECON-30).
  w.operatingExpenses = assessOperatingExpenses(w);
  return w;
}

/** Another club's accepted offer for one of our players at his value (window must be open). */
export function sellPlayer(w: World, id: string) {
  const p = w.players.find((player) => player.id === id)!;
  const club = w.clubs.find((c) => c.id !== w.playerClub && !c.representative)!;
  const day = currentDay(w);
  const bid: TransferBid = {
    id: `in:test:${w.year}:${day}:${id}`,
    direction: 'in',
    playerId: id,
    club: club.id,
    fee: playerValue(w, p),
    year: w.year,
    day,
    due: day + 5,
    status: 'pending',
  };
  w.bids = [...(w.bids || []), bid];
  respondBid(w, bid.id, true);
  return bid;
}
