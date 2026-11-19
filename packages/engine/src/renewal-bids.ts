import type { Club, Player, World } from '../../contracts/src/types';
import { currentDay } from './calendar';
import { transferWindowDays } from './transfer-window';

/** The last real opening, including while the market is closed. */
export function renewalWindow(w: World, year = w.year, day = currentDay(w)) {
  return {
    year,
    window: day >= transferWindowDays(year).winterOpen ? ('winter' as const) : ('summer' as const),
  };
}
const ordinal = (year: number, window: 'summer' | 'winter') =>
  year * 2 + Number(window === 'winter');

/** Only two windows of actual bids at this club survive; abandoned stints never count. */
export function pruneRenewalBids(w: World, p: Player, club: Club) {
  const now = renewalWindow(w),
    at = ordinal(now.year, now.window);
  const rows = (p.renewalBids ?? []).filter(
    (b) =>
      b.club === club.id && ordinal(b.year, b.window) >= at - 1 && ordinal(b.year, b.window) <= at,
  );
  if (rows.length) p.renewalBids = rows;
  else delete p.renewalBids;
}

/** Called only after a bid is counted, never by candidate search or measurement observers. */
export function recordRenewalBid(w: World, p: Player, seller: Club, buyer: Club) {
  pruneRenewalBids(w, p, seller);
  const now = renewalWindow(w);
  const row = p.renewalBids?.find((b) => b.year === now.year && b.window === now.window);
  if (row) row.reputation = Math.max(row.reputation, buyer.reputation);
  else (p.renewalBids ??= []).push({ club: seller.id, ...now, reputation: buyer.reputation });
}

/** Saved bids are a fallback for old saves, constrained to the player's recorded current stint. */
export function higherReputationBid(w: World, p: Player, club: Club) {
  const now = renewalWindow(w),
    at = ordinal(now.year, now.window);
  if (
    p.renewalBids?.some(
      (b) =>
        b.club === club.id &&
        b.reputation > club.reputation &&
        ordinal(b.year, b.window) >= at - 1 &&
        ordinal(b.year, b.window) <= at,
    )
  )
    return true;
  // A held player's record stays in memory (`isColdPlayerRecord`, →SAVE-32).
  const moves = w.playerRecords?.[p.id]?.moves ?? [];
  const last = moves[moves.length - 1];
  return (w.bids ?? []).some((b) => {
    if (
      b.playerId !== p.id ||
      !b.club ||
      (b.direction === 'out' && b.club !== club.id) ||
      (b.direction === 'in' && club.id !== w.playerClub)
    )
      return false;
    if (p.joined !== undefined && b.year < p.joined) return false;
    if (
      last &&
      (last.to !== club.id || b.year < last.year || (b.year === last.year && b.day <= last.day))
    )
      return false;
    const window = renewalWindow(w, b.year, b.day),
      stamp = ordinal(window.year, window.window);
    // Recorded facts take precedence over a later reading of the bidder's reputation.
    if (
      p.renewalBids?.some(
        (row) => row.club === club.id && row.year === window.year && row.window === window.window,
      )
    )
      return false;
    const buyer = w.clubs.find((c) => c.id === (b.direction === 'in' ? b.club : w.playerClub));
    return stamp >= at - 1 && stamp <= at && !!buyer && buyer.reputation > club.reputation;
  });
}
