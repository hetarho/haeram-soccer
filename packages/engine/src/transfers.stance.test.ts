import { legacySettings } from './responsibilities';
import { lineOf } from './player';
import { describe, expect, it } from 'vitest';
import { validateWorld } from '../../contracts/src/index';
import type { World } from '../../contracts/src/types';
import {
  activePlayers,
  advanceDays,
  FOUNDING_YEAR,
  operate,
  operatingCosts,
  seasonLength,
  transferStance,
  UNTOUCHABLE_BAR,
  untouchableVerdict,
} from './index';
import { inBids, world } from './transfers.testkit';

describe('transfer stance', () => {
  /** Runs one season of days and returns every incoming bid with the player it was for. */
  function season(w: World) {
    for (let n = 0; n < seasonLength(w) - 1 && w.year === FOUNDING_YEAR; n++) advanceDays(w, 1);
    return inBids(w).map((bid) => ({ bid, player: w.players.find((p) => p.id === bid.playerId)! }));
  }

  it('sets a stance per player, recording each change and saving only listed or untouchable', () => {
    const w = world('stance-switch');
    const p = activePlayers(w).find((x) => lineOf(x.position) === 'MF')!;
    expect(transferStance(p)).toBe('open');
    operate(w, { type: 'transfer-stance', id: p.id, stance: 'untouchable' });
    expect(p.stance).toBe('untouchable');
    expect(w.events.at(-1)).toMatchObject({
      kind: 'transfer-list',
      title: `${p.name} 이적 불가 선언`,
    });
    expect(w.events.at(-1)!.detail).toContain(`${UNTOUCHABLE_BAR}%`);
    operate(w, { type: 'transfer-stance', id: p.id, stance: 'listed' });
    expect(w.events.at(-1)!.title).toBe(`${p.name} 이적 명단 등록`);
    const events = w.events.length;
    operate(w, { type: 'transfer-stance', id: p.id, stance: 'listed' });
    expect(w.events).toHaveLength(events);
    operate(w, { type: 'transfer-stance', id: p.id, stance: 'open' });
    expect('stance' in p).toBe(false);
    p.retiring = w.year;
    expect(() => operate(w, { type: 'transfer-stance', id: p.id, stance: 'listed' })).toThrow(
      '은퇴',
    );
    validateWorld(w);
  });

  it('draws offers near value for listed players, which delegated staff accept', () => {
    const w = world('stance-listed');
    w.intervention = 4;
    w.settings = legacySettings(4);
    const listed = activePlayers(w).filter(
      (p) => lineOf(p.position) === 'MF' || lineOf(p.position) === 'FW',
    );
    for (const p of listed) operate(w, { type: 'transfer-stance', id: p.id, stance: 'listed' });
    const bids = season(w).filter(({ bid }) => bid.id.includes(':list:'));
    expect(bids.length).toBeGreaterThan(0);
    for (const { bid, player } of bids) {
      expect(bid.status).toBe('completed');
      expect(player.status).toBe('sold');
      expect(w.inbox!.find((i) => i.ref === bid.id)).toMatchObject({ kind: 'staff-report' });
    }
    expect(activePlayers(w).length).toBeGreaterThanOrEqual(14);
  });

  it('refuses offers below 150% for untouchable players and asks the owner about bigger ones', () => {
    const w = world('stance-untouchable');
    // A selling club draws more and richer offers, so both sides of the bar appear.
    w.build = { market: 'selling' };
    for (const p of activePlayers(w))
      operate(w, { type: 'transfer-stance', id: p.id, stance: 'untouchable' });
    // Values move with form and age, so each offer is judged by the share stated when it came.
    const items = season(w).map(({ bid }) => ({
      bid,
      item: w.inbox!.find((i) => i.ref === bid.id)!,
    }));
    const share = (detail: string) => Number(detail.match(/평가 가치의 (\d+)%/)![1]);
    const low = items.filter(({ item }) => item.kind === 'staff-report');
    const high = items.filter(({ item }) => item.kind === 'incoming-bid');
    expect(low.length).toBeGreaterThan(0);
    expect(high.length).toBeGreaterThan(0);
    expect(low.length + high.length).toBe(items.length);
    for (const { bid, item } of low) {
      expect(bid.status).toBe('rejected');
      expect(item).toMatchObject({ attention: false });
      expect(item.detail).toContain('이적 불가');
      expect(share(item.detail)).toBeLessThan(UNTOUCHABLE_BAR);
    }
    for (const { item } of high) {
      expect(item).toMatchObject({ attention: true });
      expect(item.title).toContain('거액');
      expect(share(item.detail)).toBeGreaterThanOrEqual(UNTOUCHABLE_BAR);
    }
  });

  it('lets delegated staff and the manager weigh big offers by market card, cash and the XI', () => {
    const w = world('stance-verdict');
    expect(untouchableVerdict(w, 199, false).accept).toBe(false);
    expect(untouchableVerdict(w, 200, false).accept).toBe(true);
    // The manager holds out 25 points longer for a starter nobody can replace.
    expect(untouchableVerdict(w, 200, true)).toMatchObject({ accept: false });
    expect(untouchableVerdict(w, 225, true).reason).toContain('기준 225%');
    w.build = { market: 'selling' };
    expect(untouchableVerdict(w, 150, false).accept).toBe(true);
    w.build = { market: 'hardball' };
    expect(untouchableVerdict(w, 224, false).accept).toBe(false);
    w.build = { market: 'hold' };
    expect(untouchableVerdict(w, 400, false).accept).toBe(false);
    // Twenty weeks of fixed costs: tight, so the price drops 25 points.
    w.build = {};
    const annual = BigInt(operatingCosts(w).annual);
    w.cash = ((annual * 20n) / 46n).toString();
    expect(untouchableVerdict(w, 175, false)).toMatchObject({ accept: true });
    // A cash crisis sells, whatever the card.
    w.build = { market: 'hold' };
    w.cash = '0';
    expect(untouchableVerdict(w, 150, false).accept).toBe(true);
  });
});
