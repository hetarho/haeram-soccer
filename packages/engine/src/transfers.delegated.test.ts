import { legacySettings } from './responsibilities';
import { describe, expect, it } from 'vitest';
import type { TransferBid, World } from '../../contracts/src/types';
import {
  activePlayers,
  advanceDays,
  delegated,
  playerValue,
  seasonLength,
  selectedLineup,
  unreadAttention,
} from './index';
import { inBids, world } from './transfers.testkit';

describe('incoming bids', () => {
  it('lets delegated staff answer quietly: only generous offers for non-essential players', () => {
    // A season whose offers include both answers once the 단장 has signed from the shortlist.
    const w = world('market-1');
    // New clubs answer offers themselves; this scenario hands transfers to the staff.
    expect(delegated(w, 'transfers')).toBe(false);
    w.intervention = 4;
    w.settings = legacySettings(4);
    const decisions: {
      bid: TransferBid;
      starter: boolean;
      age: number;
      value: bigint;
      report?: NonNullable<World['inbox']>[number];
    }[] = [];
    for (let n = 0; n < seasonLength(w) - 1; n++) {
      const known = new Set(inBids(w).map((b) => b.id));
      advanceDays(w, 1);
      for (const bid of inBids(w).filter((b) => !known.has(b.id))) {
        // Nothing else changes after the day's market, so this reproduces the staff's view.
        const p = w.players.find((x) => x.id === bid.playerId)!;
        const squad = [
          ...activePlayers(w),
          ...(p.status === 'sold' ? [{ ...p, status: 'active' as const }] : []),
        ];
        const starters = selectedLineup(squad, w.lineup, w.tactic, w.manager, w.year).map(
          (x) => x.id,
        );
        decisions.push({
          bid,
          report: w.inbox?.find((item) => item.ref === bid.id),
          starter: starters.includes(p.id),
          age: w.year - p.born,
          value: BigInt(playerValue(w, p)),
        });
      }
      expect(activePlayers(w).length).toBeGreaterThanOrEqual(14);
    }
    expect(decisions.some((d) => d.bid.status === 'completed')).toBe(true);
    expect(decisions.some((d) => d.bid.status === 'rejected')).toBe(true);
    for (const { bid, starter, age, value, report } of decisions) {
      expect(['completed', 'rejected']).toContain(bid.status);
      // Inspect the report when the decision was made; later reports may leave the bounded inbox.
      const item = report;
      expect(item).toBeDefined();
      if (item) expect(item).toMatchObject({ kind: 'staff-report', attention: false });
      // The 단장 answers and the report names him (→STAFF-20).
      if (item) expect(item.title).toMatch(/^(감독과 상의한 )?단장이 /);
      // The report states the bar the staff applied; the decision must agree with it.
      const bar = Number(item?.detail.match(/기준 (\d+)%/)?.[1]);
      if (bid.status === 'completed' && bid.id.includes(':list:')) {
        expect(item?.detail).toContain('이적 명단에 오른 선수라 매각했어요.');
        expect(BigInt(bid.fee)).toBeGreaterThan(0n);
        expect(w.players.find((p) => p.id === bid.playerId)?.status).toBe('sold');
      } else if (bid.status === 'completed') {
        expect(bar, `${bid.id}: ${item?.detail}`).toBeGreaterThanOrEqual(80);
        expect(BigInt(bid.fee) * 100n).toBeGreaterThanOrEqual(value * BigInt(bar));
        expect(!starter || age >= 30).toBe(true);
        expect(w.players.find((p) => p.id === bid.playerId)?.status).toBe('sold');
      } else if (item?.detail.includes('못 미쳐'))
        expect(BigInt(bid.fee) * 100n).toBeLessThan(value * BigInt(bar));
    }
    expect(
      unreadAttention(w).filter((i) => i.kind === 'incoming-bid' || i.kind === 'staff-report'),
    ).toEqual([]);
  });
});
