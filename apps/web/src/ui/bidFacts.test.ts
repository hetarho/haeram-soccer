import { describe, expect, it } from 'vitest';
import type { Player, TransferBid, World } from '../../../../packages/contracts/src/types';
import type { StopReason } from '../../../../packages/engine/src/stopping';
import { requestSubject } from './approvalOrder';
import { bidPlayer, bidTerms } from './bidFacts';

/** Synthetic players holding only what a bid's review reads. */
const player = (id: string, extra: Partial<Player> = {}) =>
  ({
    id,
    name: `Player ${id}`,
    status: 'active',
    wage: '1000',
    until: 1953,
    ...extra,
  }) as Player;
const bid = (extra: Partial<TransferBid>) =>
  ({
    id: 'bid',
    direction: 'out',
    playerId: 'target',
    fee: '5000',
    year: 1950,
    day: 10,
    due: 13,
    status: 'countered',
    counterFee: '6000',
    ...extra,
  }) as TransferBid;
const world = (players: Player[]) => ({ players }) as Pick<World, 'players'>;

describe('the player a bid concerns (→CLUB-14/18)', () => {
  it('reads an outgoing bid’s pinned offer, ahead of an older row of ours, off the market page', () => {
    // A former player of ours bought back: his sold row holds his old contract with us.
    const stale = player('target', { status: 'sold', wage: '300', until: 1951, name: 'Old row' });
    const pinned = player('target', { wage: '1800', until: 1954, name: 'Pinned target' });
    const out = bid({ offer: { player: pinned, fee: '5500', loanFee: '900' } });
    // The current market page lists someone else entirely.
    const market = [{ player: player('market:1950:other:3') }];
    const found = bidPlayer(world([stale]), out, market);
    expect(found).toEqual({ player: pinned, source: 'offer' });
    expect(bidTerms(out, found)).toEqual({ wage: '1800', until: 1954 });
  });
  it('ignores a pinned offer for another ID and keeps the legacy market and own-row fallbacks', () => {
    const other = player('someone-else');
    const legacy = bid({ offer: { player: other, fee: '1', loanFee: '1' } });
    const listed = player('target', { name: 'Listed target', wage: '700' });
    const found = bidPlayer(world([]), legacy, [{ player: listed }]);
    expect(found).toEqual({ player: listed, source: 'market' });
    // The market list's terms are today's, not the ones the bid was made on.
    expect(bidTerms(legacy, found)).toBeUndefined();
    const stale = player('target', { status: 'sold' });
    const own = bidPlayer(world([stale]), bid({}));
    expect(own).toEqual({ player: stale, source: 'squad' });
    expect(bidTerms(bid({}), own)).toBeUndefined();
  });
  it('leaves an unknown player unknown, without inventing a record or terms', () => {
    expect(bidPlayer(world([player('someone')]), bid({}), [])).toBeUndefined();
    expect(bidTerms(bid({}), undefined)).toBeUndefined();
  });
  it('shows a loan’s wage only: his contract end is his club’s, not the loan’s', () => {
    const pinned = player('target', { wage: '1200', until: 1956 });
    const loan = bid({ loan: true, offer: { player: pinned, fee: '5000', loanFee: '800' } });
    expect(bidTerms(loan, bidPlayer(world([]), loan))).toEqual({ wage: '1200' });
  });
  it('reads an incoming bid’s player from our squad with his current contract', () => {
    const ours = player('ours', { wage: '2500', until: 1952 });
    const offer = bid({ direction: 'in', playerId: 'ours', status: 'pending', club: 'c1' });
    const found = bidPlayer(world([ours]), offer);
    expect(found).toEqual({ player: ours, source: 'squad' });
    expect(bidTerms(offer, found)).toEqual({ wage: '2500', until: 1952 });
    // A player who has since left has no current contract of ours to show.
    const gone = player('ours', { status: 'sold' });
    expect(bidTerms(offer, bidPlayer(world([gone]), offer))).toBeUndefined();
  });
  it('names the queue row’s subject by the same lookup', () => {
    const pinned = player('target', { name: 'Pinned target' });
    const w = {
      players: [player('target', { status: 'sold', name: 'Pinned target' })],
      clubs: [{ id: 'seller', name: 'Seller FC' }],
      bids: [bid({ club: 'seller', offer: { player: pinned, fee: '1', loanFee: '1' } })],
    } as unknown as World;
    const item = { kind: 'bid-response', ref: 'bid' } as StopReason;
    expect(requestSubject(w, item)).toBe('Pinned target · Seller FC');
    w.bids = [bid({ playerId: 'missing', club: 'seller' })];
    expect(requestSubject(w, item)).toBe('Seller FC');
  });
});
