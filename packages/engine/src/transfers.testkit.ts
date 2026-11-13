import type { TransferBid, World } from '../../contracts/src/types';
import { staffAuthority } from './testing';
import { currentDay, seasonDayOf } from './index';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import { careerWorld } from './career.testkit';
import { joinFreeAgents } from './free-agents';
import { overall } from './player-state';
import { FREE_AGENT_CAP } from '../../contracts/src/player';

export const CLOSED = '이적시장이 닫혀 있어요. 자유계약 선수만 언제든 영입할 수 있어요.';

/** The market's club on the released model: transfers, not the match model, are the subject. */
export function world(seed = 'transfer-market', fresh = false) {
  const found = () => {
    const w = careerWorld({ seed });
    // A recruitment fixture supplies actual released players; new worlds start with no pool.
    for (const c of w.clubs) {
      if (c.id === w.playerClub || c.representative) continue;
      for (const p of [...(w.squads?.[c.id] ?? [])]
        .filter((p) => w.year - p.born >= 21)
        .sort((a, b) => overall(a) - overall(b))
        .slice(0, 2))
        joinFreeAgents(w, p, w.year);
      if ((w.freeAgents?.length ?? 0) >= FREE_AGENT_CAP) break;
    }
    return w;
  };
  // The takeover costs most of a test that plays no match: each seed is taken over once and copied.
  const w = fresh ? found() : cachedWorld(`founded:${seed}`, found);
  w.settings = staffAuthority(2);
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
