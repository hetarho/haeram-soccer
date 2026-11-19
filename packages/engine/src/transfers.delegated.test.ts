import { describe, expect, it } from 'vitest';
import { staffAuthority, unreadAttention } from './testing';
import type { TransferBid, World } from '../../contracts/src/types';
import { activePlayers, advanceDays, isDelegated, playerValue, seasonLength } from './index';
import { inBids, world } from './transfers.testkit';

describe('incoming bids', () => {
  it('lets delegated staff answer quietly, as the selling club (→CLUB-18, CLUB-52)', () => {
    // A season whose offers include both answers once the 단장 has signed from the shortlist (the
    // merged NPC market's season on `market-3` drew no refusal, nor did `market-4` once seller
    // stature and distress entered the answers, CLUB-52).
    const w = world('market-6');
    // New clubs answer offers themselves; this scenario hands transfers to the staff.
    expect(isDelegated(w, 'sales')).toBe(false);
    w.settings = staffAuthority(4);
    const decisions: {
      bid: TransferBid;
      value: bigint;
      report?: NonNullable<World['inbox']>[number];
    }[] = [];
    for (let n = 0; n < seasonLength(w) - 1; n++) {
      const known = new Set(inBids(w).map((b) => b.id));
      advanceDays(w, 1);
      for (const bid of inBids(w).filter((b) => !known.has(b.id))) {
        // Nothing else changes after the day's market, so this reproduces the staff's view.
        const p = w.players.find((x) => x.id === bid.playerId)!;
        decisions.push({
          bid,
          report: w.inbox?.find((item) => item.ref === bid.id),
          value: BigInt(playerValue(w, p)),
        });
      }
      expect(activePlayers(w).length).toBeGreaterThanOrEqual(14);
    }
    expect(decisions.some((d) => d.bid.status === 'completed')).toBe(true);
    expect(decisions.some((d) => d.bid.status === 'rejected')).toBe(true);
    for (const { bid, value, report } of decisions) {
      expect(['completed', 'rejected']).toContain(bid.status);
      // Inspect the report when the decision was made; later reports may leave the bounded inbox.
      const item = report;
      expect(item).toBeDefined();
      if (item) expect(item).toMatchObject({ kind: 'staff-report', attention: false });
      // The 단장 answers and the report names him (→STAFF-20).
      if (item) expect(item.title).toMatch(/^(감독과 상의한 )?단장이 /);
      // The report states the bar the staff asked and the factors behind his reservation.
      if (bid.status === 'completed' && bid.id.includes(':list:')) {
        expect(item?.detail).toContain('이적 명단에 오른 선수라 매각했어요.');
        expect(BigInt(bid.fee)).toBeGreaterThan(0n);
        expect(w.players.find((p) => p.id === bid.playerId)?.status).toBe('sold');
      } else if (bid.status === 'completed' && !item?.title.startsWith('감독과')) {
        expect(item?.detail, `${bid.id}: ${item?.detail}`).toMatch(/평가 가치의 \d+%/);
        expect(item?.detail).toContain('구단이 버틴 선');
        // A counter the bidder took sells at the counter, never below 80% of value.
        const fee = BigInt(bid.counterFee ?? bid.fee);
        expect(fee * 100n).toBeGreaterThanOrEqual(value * 80n);
        if (bid.counterFee) expect(item?.detail).toContain('역제안');
        expect(w.players.find((p) => p.id === bid.playerId)?.status).toBe('sold');
      }
    }
    expect(
      unreadAttention(w).filter((i) => i.kind === 'incoming-bid' || i.kind === 'staff-report'),
    ).toEqual([]);
  });
});
