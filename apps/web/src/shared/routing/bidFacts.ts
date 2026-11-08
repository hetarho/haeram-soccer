import type { Player, TransferBid, World } from '../../../../../packages/contracts/src/types';

/** Where a bid's player was found: the offer it pinned, our squad's rows or the market list. */
export type BidSource = 'offer' | 'squad' | 'market';
export interface BidPlayer {
  player: Player;
  source: BidSource;
}

/**
 * The player a bid concerns, by his stable ID (→CLUB-14/18). An outgoing bid reads the offer it
 * pinned when that offer names him, ahead of an older row of ours (a former player bought back);
 * an incoming bid reads our current player. A bid from before pinned offers falls back to the
 * published market list, then to our own rows. Nothing found stays unknown, never invented.
 */
export function bidPlayer(
  w: Pick<World, 'players'>,
  bid: TransferBid,
  market: readonly { player: Player }[] = [],
): BidPlayer | undefined {
  const pinned = bid.offer?.player.id === bid.playerId ? bid.offer.player : undefined;
  const squad = w.players.find((player) => player.id === bid.playerId);
  const listed = market.find((offer) => offer.player.id === bid.playerId)?.player;
  const order: [Player | undefined, BidSource][] =
    bid.direction === 'out'
      ? [
          [pinned, 'offer'],
          [listed, 'market'],
          [squad, 'squad'],
        ]
      : [
          [squad, 'squad'],
          [pinned, 'offer'],
          [listed, 'market'],
        ];
  const found = order.find(([player]) => player);
  return found && { player: found[0]!, source: found[1] };
}

/**
 * The contract a bid can truthfully show (→CLUB-14): the annual wage and contract end of the offer
 * an outgoing bid pinned, which a completed signing keeps, or our player's current contract for
 * an incoming bid. A loan keeps his own club's contract and sets its own end on completion, so it
 * shows the wage alone, never that contract's end as the loan's. Terms read from the market list
 * or an older row of ours are not the bid's, so they are left out.
 */
export function bidTerms(
  bid: TransferBid,
  found: BidPlayer | undefined,
): { wage: string; until?: number } | undefined {
  if (!found) return;
  const { player, source } = found;
  const own = source === 'squad' && player.status === 'active';
  if (bid.direction === 'out' ? source !== 'offer' : !own) return;
  return bid.loan ? { wage: player.wage } : { wage: player.wage, until: player.until };
}
