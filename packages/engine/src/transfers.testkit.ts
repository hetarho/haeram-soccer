import { legacySettings } from './responsibilities';
import type { TransferBid, World } from '../../contracts/src/types';
import { createWorld, currentDay, seasonDayOf } from './index';
import { cachedWorld, DISABLED_RELEASE } from '../../../tests/fixtures/worlds';

export const CLOSED = '이적시장이 닫혀 있어요. 자유계약 선수만 언제든 영입할 수 있어요.';

/** The market's club on the pre-feature path: transfers, not the match model, are the subject. */
export function world(seed = 'transfer-market', fresh = false) {
  const found = () =>
    createWorld(
      {
        country: 'ENG',
        name: 'Market Town',
        color: '#224433',
        seed,
        level: 'easy' as const,
      },
      DISABLED_RELEASE,
    );
  // Founding costs most of a test that plays no match: each seed is founded once and copied.
  const w = fresh ? found() : cachedWorld(`founded:${seed}`, found);
  w.settings = legacySettings(2);
  w.cash = '999999999999';
  return w;
}

export const on = (w: World, month: number, date: number) => {
  w.calendar = { day: seasonDayOf(w.year, month, date) };
  return w;
};

export const inBids = (w: World) => (w.bids || []).filter((b) => b.direction === 'in');

export function incoming(w: World, playerId: string, fee: string): TransferBid {
  const day = currentDay(w);
  const bid: TransferBid = {
    id: `in:test:${playerId}`,
    direction: 'in',
    playerId,
    club: w.clubs.find((c) => c.tier === 0 && c.country === 'ENG')!.id,
    fee,
    year: w.year,
    day,
    due: day + 5,
    status: 'pending',
  };
  w.bids = [...(w.bids || []), bid];
  return bid;
}
